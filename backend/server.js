import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const isDev = !isProd;

const app = express();
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// In production the frontend is served from the same origin, so CORS is only
// needed locally where the dev server runs on a different port.
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
if (isDev) {
  app.use(cors({ origin: corsOrigin }));
} else if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: corsOrigin }));
}

app.use(express.json({ limit: '10mb' })); // clinical notes + papers can be large

const {
  AZURE_OPENAI_ENDPOINT: DEFAULT_AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY: DEFAULT_AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_DEPLOYMENT: DEFAULT_AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION: DEFAULT_AZURE_OPENAI_API_VERSION,
  APP_SHARED_SECRET,
  REQUIRE_SHARED_SECRET,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  PORT = 3001,
} = process.env;

const mustRequireSharedSecret =
  REQUIRE_SHARED_SECRET === 'true' || (isProd && REQUIRE_SHARED_SECRET !== 'false');

if (mustRequireSharedSecret && !APP_SHARED_SECRET) {
  throw new Error('APP_SHARED_SECRET is required (set APP_SHARED_SECRET or REQUIRE_SHARED_SECRET=false).');
}

const apiLimiter = rateLimit({
  windowMs: Number(RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(RATE_LIMIT_MAX ?? 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded' },
});

app.use('/api', apiLimiter);

function sendError(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const message = err?.expose ? err.message : (status < 500 ? 'request_failed' : 'internal_server_error');

  if (!err?.expose) {
    console.error('[api_error]', {
      status,
      message: err?.message,
      code: err?.code,
    });
  }

  return res.status(status).json({ error: message });
}

// --- Auth middleware ---------------------------------------------------------
// Optional: protect the proxy with a shared secret so it's not an open relay
// if you ever expose it beyond localhost.
function requireSecret(req, res, next) {
  if (!mustRequireSharedSecret && !APP_SHARED_SECRET) return next(); // local-only convenience
  if (req.header('X-App-Secret') !== APP_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// --- Azure call helper -------------------------------------------------------
function getAzureConfig(req) {
  const bodyConfig = req.body?.azureConfig ?? {};

  const endpoint = (bodyConfig.endpoint ?? DEFAULT_AZURE_OPENAI_ENDPOINT ?? '').trim();
  const apiKey = (bodyConfig.apiKey ?? DEFAULT_AZURE_OPENAI_API_KEY ?? '').trim();
  const deployment = (bodyConfig.deployment ?? DEFAULT_AZURE_OPENAI_DEPLOYMENT ?? '').trim();
  const apiVersion = (bodyConfig.apiVersion ?? DEFAULT_AZURE_OPENAI_API_VERSION ?? '').trim();

  const missing = [];
  if (!endpoint) missing.push('endpoint');
  if (!apiKey) missing.push('apiKey');
  if (!deployment) missing.push('deployment');
  if (!apiVersion) missing.push('apiVersion');

  if (missing.length) {
    const err = new Error(`Azure config missing: ${missing.join(', ')}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }

  return { endpoint: endpoint.replace(/\/$/, ''), apiKey, deployment, apiVersion };
}

async function callAzure(azureConfig, messages, { jsonMode = false, temperature = 0, seed = 42 } = {}) {
  const url = `${azureConfig.endpoint}/openai/deployments/${azureConfig.deployment}/chat/completions?api-version=${azureConfig.apiVersion}`;

  const body = {
    messages,
    temperature,
    seed,
    ...(jsonMode && { response_format: { type: 'json_object' } }),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': azureConfig.apiKey, // Azure uses 'api-key', NOT 'Authorization: Bearer'
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(res.status === 429 ? 'azure_rate_limited' : 'azure_request_failed');
    err.status = res.status === 429 ? 429 : 502;
    err.code = `AZURE_${res.status}`;
    console.error('[azure_error]', {
      status: res.status,
      body: text.slice(0, 500),
    });
    throw err;
  }
  return res.json();
}

// --- Routes ------------------------------------------------------------------

// Sanity check — does the key/deployment actually work?
app.post('/api/test-connection', requireSecret, async (req, res) => {
  try {
    const azureConfig = getAzureConfig(req);
    const result = await callAzure(
      azureConfig,
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { temperature: 0 }
    );
    const reply = result.choices?.[0]?.message?.content ?? '';
    res.json({ ok: true, reply });
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    const message = err?.expose ? err.message : (status < 500 ? 'request_failed' : 'internal_server_error');
    if (!err?.expose) {
      console.error('[api_error]', { status, message: err?.message, code: err?.code });
    }
    res.status(status).json({ ok: false, error: message });
  }
});

// Extract a codebook from an example paper
app.post('/api/extract-codebook', requireSecret, async (req, res) => {
  try {
    const azureConfig = getAzureConfig(req);
    const { paperText } = req.body;
    if (!paperText) return res.status(400).json({ error: 'paperText required' });

    const result = await callAzure(
      azureConfig,
      [
        { role: 'system', content: CODEBOOK_SYSTEM_PROMPT },
        { role: 'user', content: `Example paper text:\n\n${paperText}` },
      ],
      { jsonMode: true, temperature: 0 }
    );

    const raw = result.choices?.[0]?.message?.content ?? '{}';
    res.json({ codebook: JSON.parse(raw) });
  } catch (err) {
    sendError(res, err);
  }
});

// Code a clinical note against an approved codebook
app.post('/api/code-note', requireSecret, async (req, res) => {
  try {
    const azureConfig = getAzureConfig(req);
    const { noteText, codebook, corrections } = req.body;
    if (!noteText || !codebook) {
      return res.status(400).json({ error: 'noteText and codebook required' });
    }

    const result = await callAzure(
      azureConfig,
      [
        { role: 'system', content: codingSystemPrompt(codebook, corrections) },
        { role: 'user', content: `Clinical note:\n\n${noteText}` },
      ],
      { jsonMode: true, temperature: 0, seed: 42 }
    );

    const raw = result.choices?.[0]?.message?.content ?? '{}';
    res.json({ codings: JSON.parse(raw) });
  } catch (err) {
    sendError(res, err);
  }
});

// --- Prompts (kept here so backend is self-contained) -----------------------
const CODEBOOK_SYSTEM_PROMPT = `You are a qualitative methods expert specializing in respiratory failure and critical care pulmonology. Read the example paper and identify the qualitative coding framework the authors used, focusing exclusively on concepts related to respiratory failure.

Respiratory failure domains of interest include (but are not limited to):
- Oxygenation status (SpO2, PaO2/FiO2 ratio, hypoxemia)
- Ventilatory support (invasive mechanical ventilation, non-invasive ventilation, HFNC, CPAP/BiPAP)
- Ventilator settings and modes (PEEP, tidal volume, FiO2, driving pressure, plateau pressure)
- Respiratory mechanics and work of breathing
- Weaning and liberation from mechanical ventilation / extubation
- Airway management (intubation, tracheostomy, secretions)
- Respiratory interventions (proning, recruitment maneuvers, inhaled agents)
- Causes and phenotypes of respiratory failure (ARDS, pneumonia, COPD exacerbation, pulmonary edema)
- Respiratory medications (bronchodilators, corticosteroids, pulmonary vasodilators)
- Respiratory trajectories and outcomes (reintubation, prolonged ventilation, respiratory recovery)

Do NOT extract codes related to vasopressors, hemodynamics, renal replacement therapy/dialysis, nutrition, sedation unrelated to ventilation, or other non-respiratory ICU domains.

Return STRICT JSON with this shape:
{
  "framework_name": "string — name or short description of the coding approach",
  "codes": [
    {
      "name": "short code name",
      "definition": "what this code captures, in 1-2 sentences",
      "inclusion_criteria": "when to apply this code",
      "exclusion_criteria": "when NOT to apply this code, even if it seems close",
      "examples": ["short example phrase from the paper or representative of the code"]
    }
  ]
}

Be faithful to what the paper actually used — do not invent codes the authors didn't use. If the paper describes 6 respiratory codes, return 6. Omit any codes outside the respiratory failure domain.`;

function codingSystemPrompt(codebook, corrections) {
  const correctionBlock = corrections?.length
    ? `\nUSER CORRECTIONS from a previous coding run — apply this reasoning to all similar passages in this note:\n${
        corrections.map((c, i) =>
          `${i + 1}. Quote: "${c.quote}"\n   Was coded as: "${c.original_code}" → Correct code: "${c.corrected_code}"\n   Reason: ${c.reason}`
        ).join('\n')
      }\n`
    : '';

  return `You are applying a qualitative codebook focused on respiratory failure to a clinical note. Code only passages that clearly match a code's definition and inclusion criteria AND are related to respiratory status, ventilation, oxygenation, or airway management. When in doubt, do not code.

Ignore passages about vasopressors, hemodynamic management, renal replacement therapy, dialysis, or other non-respiratory ICU interventions — even if they appear in the note.
${correctionBlock}
CODEBOOK:
${JSON.stringify(codebook, null, 2)}

Return STRICT JSON with this shape:
{
  "codings": [
    {
      "quote": "exact verbatim span from the note",
      "code": "code name from the codebook",
      "rationale": "1 sentence on why this passage matches the code's definition",
      "confidence": "high | medium | low"
    }
  ]
}

Rules:
- "quote" must be an exact substring of the note (preserve punctuation/casing).
- One passage may receive multiple codes — emit one entry per (quote, code) pair.
- Only code respiratory failure-relevant content; skip hemodynamic, renal, or other non-respiratory passages.
- If nothing matches, return {"codings": []}.`;
}

// --- Health check (Azure uses this to verify the app is up) ------------------
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'qual-coding-backend',
    message: 'Backend is running. Use POST /api/test-connection, /api/extract-codebook, or /api/code-note.',
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Static frontend (production only) ---------------------------------------
// Vite builds into backend/public/; serve it and fall through to index.html
// for any path that isn't an API route (SPA client-side routing).
if (isProd) {
  const publicDir = join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
  if (!DEFAULT_AZURE_OPENAI_API_KEY) {
    console.log('ℹ️  No default AZURE_OPENAI_API_KEY in env; expecting credentials from step 1 UI.');
  }
});

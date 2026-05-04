import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

dotenv.config();

const app = express();

// In dev the frontend runs on a separate Vite port; in production it's same-origin.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }));
}

app.use(express.json({ limit: '10mb' })); // clinical notes + papers can be large

const {
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION,
  APP_SHARED_SECRET,
  PORT = 3001,
} = process.env;

// --- Auth middleware ---------------------------------------------------------
// Optional: protect the proxy with a shared secret so it's not an open relay
// if you ever expose it beyond localhost.
function requireSecret(req, res, next) {
  if (!APP_SHARED_SECRET) return next(); // disabled
  if (req.header('X-App-Secret') !== APP_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// --- Azure call helper -------------------------------------------------------
async function callAzure(messages, { jsonMode = false, temperature = 0, seed = 42 } = {}) {
  const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;

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
      'api-key': AZURE_OPENAI_API_KEY, // Azure uses 'api-key', NOT 'Authorization: Bearer'
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// --- Routes ------------------------------------------------------------------

// Sanity check — does the key/deployment actually work?
app.post('/api/test-connection', requireSecret, async (_req, res) => {
  try {
    const result = await callAzure(
      [{ role: 'user', content: 'Reply with the single word: ok' }],
      { temperature: 0 }
    );
    const reply = result.choices?.[0]?.message?.content ?? '';
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Extract a codebook from an example paper
app.post('/api/extract-codebook', requireSecret, async (req, res) => {
  try {
    const { paperText } = req.body;
    if (!paperText) return res.status(400).json({ error: 'paperText required' });

    const result = await callAzure(
      [
        { role: 'system', content: CODEBOOK_SYSTEM_PROMPT },
        { role: 'user', content: `Example paper text:\n\n${paperText}` },
      ],
      { jsonMode: true, temperature: 0 }
    );

    const raw = result.choices?.[0]?.message?.content ?? '{}';
    res.json({ codebook: JSON.parse(raw) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Code a clinical note against an approved codebook
app.post('/api/code-note', requireSecret, async (req, res) => {
  try {
    const { noteText, codebook } = req.body;
    if (!noteText || !codebook) {
      return res.status(400).json({ error: 'noteText and codebook required' });
    }

    const result = await callAzure(
      [
        { role: 'system', content: codingSystemPrompt(codebook) },
        { role: 'user', content: `Clinical note:\n\n${noteText}` },
      ],
      { jsonMode: true, temperature: 0, seed: 42 }
    );

    const raw = result.choices?.[0]?.message?.content ?? '{}';
    res.json({ codings: JSON.parse(raw) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Prompts (kept here so backend is self-contained) -----------------------
const CODEBOOK_SYSTEM_PROMPT = `You are a qualitative methods expert. Read the example paper and identify the qualitative coding framework the authors used.

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

Be faithful to what the paper actually used — do not invent codes the authors didn't use. If the paper describes 6 codes, return 6.`;

function codingSystemPrompt(codebook) {
  return `You are applying a qualitative codebook to a clinical note. Code only passages that clearly match a code's definition and inclusion criteria. When in doubt, do not code.

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
- If nothing matches, return {"codings": []}.`;
}

// Serve built frontend in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'frontend', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Proxy listening on http://localhost:${PORT}`);
  if (!AZURE_OPENAI_API_KEY) console.warn('⚠️  AZURE_OPENAI_API_KEY not set');
});

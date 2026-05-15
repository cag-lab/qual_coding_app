// Single client for the backend proxy. The Azure key never appears here —
// the proxy holds it. We only carry an optional shared secret.
// In production the frontend is served from the same origin as the API, so
// relative paths work. In local dev, Vite's proxy forwards /api → localhost:3001.
const BASE = '';

async function post(path, body, secret) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret && { 'X-App-Secret': secret }),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  testConnection: (secret) => post('/api/test-connection', {}, secret),
  extractCodebook: (paperText, secret) =>
    post('/api/extract-codebook', { paperText }, secret),
  codeNote: (noteText, codebook, secret, corrections) =>
    post('/api/code-note', { noteText, codebook, ...(corrections?.length && { corrections }) }, secret),
};

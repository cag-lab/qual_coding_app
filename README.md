# Respiratory Failure — Qualitative Coding App

A React + Node app for AI-assisted qualitative coding of clinical notes, scoped to respiratory failure, using Azure OpenAI.

## Screenshots

**Step 2 — Build the codebook.** Upload a paper and the model extracts a respiratory-focused coding framework, or load a previously saved codebook JSON.

![Codebook step](Screenshot%202026-05-15%20at%204.17.07%E2%80%AFPM.png)

**Step 3 — Code a clinical note.** Paste or upload a note, run coding, review quoted passages with assigned codes and rationale, flag corrections for re-run, then hand off to physician comparison.

![Coding results step](Screenshot%202026-05-15%20at%204.38.59%E2%80%AFPM.png)

## Architecture

```
qual-coding-app/
├── backend/        # Express proxy — receives Azure config, forwards to Azure
└── frontend/       # React app — UI, file parsing, results table
```

**Why a backend proxy?** The frontend sends Azure settings to the backend, and the
backend is still the only component that calls Azure directly. You can optionally
protect the proxy with a shared secret (`APP_SHARED_SECRET`).

## Quick start

1. Start backend (`npm run dev` in `backend/`)
2. Start frontend (`npm run dev` in `frontend/`)
3. Open the app and complete **Step 1: Connect to Azure**

## Setup

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env    # optional: set APP_SHARED_SECRET, CORS_ORIGIN, PORT
npm run dev
```
Runs on http://localhost:3001

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on http://localhost:5173

### 3. Enter Azure credentials in the UI
On step 1 in the frontend, paste:
- Azure endpoint
- Azure API key
- Deployment name
- API version

If `APP_SHARED_SECRET` is set in `backend/.env`, enter that on step 1 too.

### Optional: fallback credentials via env
If you prefer, backend supports fallback `AZURE_*` values in `backend/.env`.
When those are present, they are used if no `azureConfig` is sent in the request.

## Build order (recommended)

1. Get the backend talking to Azure (`POST /api/test-connection`)
2. Wire up the frontend connection screen
3. Add codebook extraction from example paper
4. Add note-coding flow
5. Add CSV export

## Compare tab: physician JSON import

Step 4 supports importing physician annotations exported as:

- filename pattern: `<noteid>__<coder>__coding.json`
- schema: `note-coder/v1`
- required data: `annotations[]` with `{code,start,end,text}` and `note.text`

After import, the app compares imported physician codings with LLM codings and shows:

- existing reliability metrics (Cohen's κ, Krippendorff's α, % agreement)
- span-aware metrics (exact span F1, overlap F1, code presence F1)

If LLM codings do not include offsets, the compare tab infers them from quote text against
the note (first occurrence; warns if a quote appears multiple times).

## PHI / compliance reminders

- Azure deployment must be in a HIPAA-eligible subscription with a BAA in place
- Disable any request/response logging on the backend before sending real notes
- The frontend stores nothing — refresh = clean slate
- `temperature: 0` + fixed `seed` on the coding call for reproducibility

## Backend hardening controls

- `APP_SHARED_SECRET`: shared secret required by clients in `X-App-Secret`
- `REQUIRE_SHARED_SECRET`: defaults to effectively required in production (`true` unless set to `false`)
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`: per-IP API rate limiting for `/api/*`
- CORS in production is only enabled when `CORS_ORIGIN` is explicitly set

For clinical use, run behind HTTPS and keep `REQUIRE_SHARED_SECRET=true`.

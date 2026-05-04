# Qualitative Coding App

A React + Node app for AI-assisted qualitative coding of clinical notes using Azure OpenAI.

## Architecture

```
qual-coding-app/
├── backend/        # Express proxy — holds API key, forwards to Azure
└── frontend/       # React app — UI, file parsing, results table
```

**Why a backend proxy?** The Azure API key never touches the browser. The frontend
authenticates to the backend (optional shared secret), the backend holds the key
in an env var and forwards requests to Azure. For clinical notes / PHI this is the
right pattern even for solo use — keeps a single auditable point of egress.

## Setup

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env    # fill in AZURE_* values
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

## Build order (recommended)

1. Get the backend talking to Azure (`POST /api/test-connection`)
2. Wire up the frontend connection screen
3. Add codebook extraction from example paper
4. Add note-coding flow
5. Add CSV export

## PHI / compliance reminders

- Azure deployment must be in a HIPAA-eligible subscription with a BAA in place
- Disable any request/response logging on the backend before sending real notes
- The frontend stores nothing — refresh = clean slate
- `temperature: 0` + fixed `seed` on the coding call for reproducibility

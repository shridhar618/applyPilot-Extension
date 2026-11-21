# ApplyPilot AI

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white) ![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-4285F4?logo=googlechrome&logoColor=white)

**Find better jobs. Build stronger resumes. Apply smarter.**

A Chrome extension and FastAPI backend that reads a job posting, compares it with your resume, and shows an explainable, estimated compatibility score, with the evidence behind every skill verdict. Saved jobs go into an application tracker.

## Repository layout

| Folder | What it contains |
|---|---|
| [`ApplyPilot-AI/`](ApplyPilot-AI) | Full source: FastAPI backend, Chrome extension (MV3) app, shared packages, Docker Compose and Render deployment config |
| `applypilot-ai-extension-0.1.0/` | Packaged build of the extension (v0.1.0), ready to load in Chrome |

## Highlights

- Account system with argon2 password hashing, JWT and server-side token revocation
- Resume library: upload PDF/DOCX or paste text, with section, skill and contact parsing
- Job-description analyzer: required, preferred and mentioned skills, experience, education and a prompt-injection flag
- Explainable match score with documented weights
- Extension popup and side panel with Greenhouse, Lever, JSON-LD and generic job-page extraction
- Application tracker API with filtering, search and CSV export

## Getting started

Setup instructions, the feature list and progress notes are in [`ApplyPilot-AI/README.md`](ApplyPilot-AI/README.md) and [`ApplyPilot-AI/PROGRESS.md`](ApplyPilot-AI/PROGRESS.md).

### Load the packaged extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `applypilot-ai-extension-0.1.0/`.


## Environment variables

Copy `ApplyPilot-AI/.env.example` to `backend/.env`. See that file for the full list, including scoring weight overrides.

| Variable | Purpose | Default |
|---|---|---|
| `APPLYPILOT_ENV` | `development` or `production` | `development` |
| `APPLYPILOT_DATABASE_URL` | Database URL (SQLite locally, PostgreSQL in production) | `sqlite:///./applypilot.db` |
| `APPLYPILOT_SECRET_KEY` | Token signing key. Required in production, at least 32 random characters | insecure dev value |
| `APPLYPILOT_ACCESS_TOKEN_MINUTES` | Access token lifetime | `60` |
| `APPLYPILOT_CORS_ORIGINS / APPLYPILOT_CORS_ORIGIN_REGEX` | Allowed origins; pin your extension ID in production | `http://localhost:5173` |
| `APPLYPILOT_UPLOAD_DIR / APPLYPILOT_MAX_UPLOAD_BYTES` | Resume upload directory and size limit | `./storage/resumes`, 5 MB |
| `APPLYPILOT_AI_PROVIDER` | `none`, `openai_compatible` or `anthropic`. Only AI explanations need it | `none` |
| `APPLYPILOT_AI_BASE_URL / _MODEL / _API_KEY` | Settings for the chosen AI provider | empty |
| `APPLYPILOT_SEMANTIC_BACKEND` | `lexical` or `sentence-transformers` | `lexical` |

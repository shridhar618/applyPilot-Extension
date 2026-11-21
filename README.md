# ApplyPilot AI

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

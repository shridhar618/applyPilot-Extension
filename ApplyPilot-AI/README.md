# ApplyPilot AI

**Find better jobs. Build stronger resumes. Apply smarter.**

A Chrome extension + FastAPI backend that reads a job posting, compares it with your resume, and shows an **explainable, estimated** compatibility score, with the evidence behind every skill verdict. Save jobs to an application tracker.

> **Status: Slice 1 (vertical slice).** The core loop works end-to-end and is tested. The web dashboard, resume optimizer, cover letters, interview prep, and other advanced features are **not built yet**. See [PROGRESS.md](PROGRESS.md) for exactly what is verified, partial, and missing.

## What works today

- Register / sign in / sign out (argon2 hashing, JWT, server-side revocation), account deletion, data export
- Resume library: upload PDF/DOCX (validated by type, magic bytes, size), paste text, set default, delete, section/skill/contact parsing
- Job-description analyzer (required / preferred / mentioned skills, years, education, ambiguity notes, prompt-injection flag)
- Explainable match score (documented weights; non-assessable components are excluded, not scored zero)
- Chrome extension (MV3): popup, side panel (Overview, Job Match, Save Job, Resumes, Settings), service worker, context menu, Greenhouse / Lever / JSON-LD / generic extraction, manual paste fallback
- Application tracker API (CRUD, filter, search, sort, CSV export with formula-injection protection)
- Optional AI explanation of a score (needs a provider **and** your consent)

## Repository layout

```
ApplyPilot-AI/
├── apps/extension/        Chrome MV3 extension (React + TS + Vite + Tailwind)
│   ├── src/{popup,sidepanel,background,content,adapters,shared}
│   └── public/{manifest.json,icons/}      → built into apps/extension/dist
├── backend/               FastAPI + SQLAlchemy 2 + Alembic
│   ├── app/{api,core,models,schemas,services}
│   ├── migrations/        Alembic (0001_initial_schema)
│   └── tests/
├── packages/shared-types/ API contract types used by the extension
├── scripts/               icon generator, build verifier, ZIP packager
├── docker-compose.yml     (UNVERIFIED, see Limitations)
└── .env.example
```
(`apps/web`, the dashboard, does not exist yet.)

## 1. Install dependencies

Requires Python 3.12+ and Node 20+.

```bash
# backend
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && cd ..
# extension (installs the npm workspace from the repo root)
npm install
```

## 2. Configure environment variables

```bash
cp .env.example backend/.env      # then edit backend/.env
```
Defaults work for local development (SQLite, no AI). In **production** `APPLYPILOT_SECRET_KEY` is required (the server refuses to start with the dev key).

| | Local development | Production |
|---|---|---|
| Database | `sqlite:///./applypilot.db` | `postgresql+psycopg://…` |
| Secret key | dev default (insecure) | random ≥32 chars, **required** |
| Backend URL in extension | `http://localhost:8000` | `https://your-api.example.com` (https enforced) |
| CORS | any `chrome-extension://<id>` | pin your extension ID via `APPLYPILOT_CORS_ORIGIN_REGEX` |

## 3. Start the backend

```bash
npm run backend:migrate     # alembic upgrade head
npm run backend:dev         # http://localhost:8000  (API docs at /docs in development)
```
Health: `GET /health`, readiness (DB check): `GET /ready`.

## 4. Web dashboard

Not built yet (Slice 2+). Everything below works from the extension alone.

## 5. Build the extension

```bash
npm run build:extension       # typecheck → vite build → content script → verifies the output
npm run package:extension     # also writes apps/extension/applypilot-ai-0.1.0.zip
npm run dev:extension         # rebuild on change (reload the extension in chrome://extensions)
```

## 6. Install in Chrome

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select **`apps/extension/dist`** (the folder containing `manifest.json`).
3. Pin the extension. Chrome 116+ is required (side panel API).

## 7. Configure the AI provider (optional)

Everything except "Explain this score with AI" works without one. In `backend/.env`:

```bash
# Ollama (local, no key)
APPLYPILOT_AI_PROVIDER=openai_compatible
APPLYPILOT_AI_BASE_URL=http://localhost:11434/v1
APPLYPILOT_AI_MODEL=llama3.1
# OpenAI-compatible hosted API
APPLYPILOT_AI_PROVIDER=openai_compatible
APPLYPILOT_AI_BASE_URL=https://api.openai.com/v1
APPLYPILOT_AI_MODEL=<model you have access to>
APPLYPILOT_AI_API_KEY=<key>
# Anthropic
APPLYPILOT_AI_PROVIDER=anthropic
APPLYPILOT_AI_MODEL=<model id>
APPLYPILOT_AI_API_KEY=<key>
```
Restart the backend. Keys live only in the backend environment, never in the extension. The score is always computed by the deterministic algorithm; the AI only writes commentary. Resume and job text are sent to the provider **only after you tick the consent box** in Settings.

## 8. Test the full workflow

1. Start the backend; load the extension; open the side panel → **Settings** and confirm "Server reachable".
2. Create an account (Overview tab).
3. **Resumes** → upload a PDF/DOCX or paste text.
4. Open a job posting (e.g. a Greenhouse or Lever page), click the toolbar icon → **Analyze this page**. If Chrome asks, click **Allow on this site**.
5. **Job Match** → *Calculate estimated match* → read the breakdown and evidence.
6. **Save Job** → the application is stored in the database.
7. If extraction fails, use **Paste job description**. The result is labelled "Entered manually".

Automated tests:

```bash
npm run backend:test          # pytest (62 tests)
npm run test:extension        # vitest (62 tests)
npm run typecheck && npm run lint
```

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| "Can't reach the ApplyPilot server" | Backend not running, or wrong URL in Settings. Check `curl localhost:8000/health`. |
| Works in Settings but API calls fail with CORS errors | Set `APPLYPILOT_CORS_ORIGIN_REGEX` to your extension origin (find the ID on `chrome://extensions`). |
| "Allow on this site" appears | Expected: Chrome grants per-site access only when you click it. |
| "We couldn't find a job posting" | Layout changed or content is in an iframe. Use **Paste job description**. |
| Resume "no readable text" | Scanned/image PDF. Paste the text instead. |
| `APPLYPILOT_SECRET_KEY must be set` | Production mode requires a real secret (see `.env.example`). |
| Session expired | Tokens last 60 min by default (`APPLYPILOT_ACCESS_TOKEN_MINUTES`); sign in again. |

## 10. Chrome Web Store checklist (future)

- [ ] Host the backend over **https**; add its origin to `host_permissions` or rely on the runtime optional-permission prompt
- [ ] Pin `APPLYPILOT_CORS_ORIGIN_REGEX` to the published extension ID
- [ ] Publish a privacy policy covering resume data, AI-provider processing, and retention (required by the store)
- [ ] Prepare listing assets: 128px icon (done), screenshots 1280×800, promo tile, per-permission justifications (see Settings → "Permissions, in plain words")
- [ ] Bump `version` in `public/manifest.json`, run `npm run package:extension`, upload the ZIP
- [ ] Test on a clean Chrome profile; verify each supported site manually (see PROGRESS.md)

## 11. Deploy to Render

The repository includes [`render.yaml`](render.yaml) for a production web service,
managed PostgreSQL database, and persistent resume storage.

1. Push the repository to GitHub and create a new Render Blueprint from it.
2. Set `APPLYPILOT_CORS_ORIGIN_REGEX` to the Web Store extension origin after
   Chrome assigns the extension ID:
   `^chrome-extension://YOUR_32_CHARACTER_EXTENSION_ID$`
3. Replace `https://api.example.com` in
   [`apps/extension/.env.production`](apps/extension/.env.production) and
   [`apps/extension/public/manifest.json`](apps/extension/public/manifest.json)
   with the deployed API hostname, then build and package the extension:
   `npm run package:extension`
4. Configure the custom domain in Render and verify `/health` and `/ready`.
5. Upload the generated ZIP to the Chrome Web Store. The extension defaults to
   the production API URL while local test runs continue to use localhost.

## Security notes

Server-enforced auth and per-user ownership on every query (other users' IDs return 404); argon2 password hashing; token revocation on logout; upload validation by extension + magic bytes + size + zip-bomb check, random on-disk names, private directory; request-body values never logged or echoed; AI prompts treat documents as untrusted data and outputs are schema-validated; CSV export neutralises spreadsheet formulas; rate limiting on auth routes (in-memory, single process: use Redis behind multiple instances); responses sent with `Cache-Control: no-store`.

## Limitations

See [PROGRESS.md](PROGRESS.md#known-limitations).

# Progress

_Last updated after Slice 1. Numbers below are from actual runs in the build environment._

## Test & build results (actual)

| Check | Result |
|---|---|
| Backend `pytest` | **62 passed** |
| Extension `vitest` | **62 passed** (adapters 11, manifest 5, API client 10, service worker 12, components 24) |
| `tsc --noEmit` | clean |
| `eslint src` | clean |
| `npm run build:extension` | success; `scripts/verify-extension-build.mjs` confirms valid MV3 manifest, 53 files, every referenced path resolves, no dev-server URLs, no broad host permissions |
| Alembic | `upgrade head` and `downgrade base` verified on SQLite; schema equals models (test) |
| Real HTTP smoke test | uvicorn on a migrated SQLite file: register → upload PDF → parse → match preview all OK; CORS allows an extension origin, rejects `https://evil.example`; request log contained no credentials |

## ✅ Implemented and tested

Auth (register/login/logout/me, consent, delete account, data export, rate limit, revocation) · Resume upload/paste/list/default/delete/download/re-parse · Job analysis & dedupe · Requirement editing (API) · Explainable match (preview + persisted) · AI-explain with provider failure handling · Application CRUD/filter/search/sort/CSV · Extension popup, side panel, service worker, context menu, adapters (Greenhouse, Lever, JSON-LD, generic), manual fallback, per-site permission flow, session-expiry handling · Alembic migration

## 🟡 Implemented but NOT verified

- **The extension has never been loaded in real Chrome.** The sandbox had no browser (Chromium download blocked). UI/logic is tested against an in-memory `chrome.*` mock and the build output is statically verified, but side-panel opening, `chrome.scripting` injection, and permission prompts are unconfirmed on a real browser. **First thing to do: Load unpacked and click through the workflow.**
- **Site adapters were tested against hand-written HTML fixtures, not captured live pages.** Greenhouse/Lever selectors follow their public markup as I know it; they may need adjusting. JSON-LD extraction is the most robust path.
- **PostgreSQL** (migrations + `psycopg`) and **Docker/Compose**: written, never run.
- `sentence-transformers` semantic backend: code path exists, not installed or tested. The default lexical method is tested.
- AI providers (OpenAI-compatible, Anthropic): request shapes written from documentation; tested only with a fake provider, never against a live API.

## ❌ Not implemented yet

Web dashboard (all 21 pages incl. landing & pricing) · LinkedIn and Indeed adapters · password reset (needs email) · profile/preferences/onboarding wizard · resume optimizer, resume builder & DOCX/PDF export · cover letters · interview prep · skill-gap & roadmap · recruiter messages · company research · scam-risk indicators · reminders & notifications · job discovery · plan limits / payments · audit events table · TanStack Query / Playwright e2e · resume version history.

## Known limitations

- Skill detection uses a curated taxonomy (~130 skills). Skills outside it are invisible to scoring. Treat "Not found" as "not detected", not "you lack it".
- Experience years are estimated from date ranges in the resume's experience section; unparseable dates → component excluded.
- Job text inside iframes (e.g. an embedded Greenhouse board on a company site) is not read; use manual paste.
- Rate limiting is in-memory (single process). Access tokens last 60 min with no refresh token.
- Scores are heuristic estimates with configurable starting weights, **not** validated against hiring outcomes and **not** an ATS score.

## Next slice (suggested)

1. Load in Chrome, fix whatever breaks, capture real adapter fixtures.
2. Web dashboard shell: auth, resume library, application tracker (table + Kanban), real dashboard stats.
3. Resume optimizer with accept/reject/edit and no fabricated claims; cover letters.

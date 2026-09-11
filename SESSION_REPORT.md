# SESSION REPORTS — AI Dental Lead CRM

Most recent session first.

---

# SESSION 5 — Production Deployment And Live-AI Verification

Session date: 2026-09-11
Scope: final documentation/status pass after the Vercel deployment and the production live-AI
qualification were confirmed by the user. No application code was changed in this session.

---

## Outcome

The MVP is complete and running in production:

- **T-039 — Deploy to Vercel: DONE.** The deployment is live against the production Neon database
  with authentication, clinic tenancy and the public lead form all working.
- **Live AI qualification: VERIFIED IN PRODUCTION.** Session 4's open item is closed.

## Production runtime configuration

| Variable | Value |
| --- | --- |
| `AI_MODE` | `live` |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `AI_MODEL` | `openrouter/free` |
| `AI_TIMEOUT_MS` | `50000` |

## What was verified

The existing lead **"Live AI Test 2"** was analysed after redeployment and returned:

| Field | Value |
| --- | --- |
| Lead score | **90/100** |
| Priority | **HOT** |
| Urgency | **IMMEDIATE** |
| Intent | **HIGH** |
| Service | **EMERGENCY** |
| Summary | Generated |
| Recommended action | Generated |
| Draft reply | Generated |
| Activity timeline | `AI_ANALYSIS_COMPLETED` |
| Model recorded | `openrouter/free` |

## Why this closes session 4

Session 4 diagnosed the production 404 to an invalid model id — `openai/gpt-oss-20b:free` is not a
model OpenRouter serves — rather than a URL bug, and prescribed pointing `AI_MODEL` at an id the
provider actually serves. Production now uses `openrouter/free`, a real OpenRouter **router** id
(distinct from a `:free` model suffix) that dispatches across free-pool models.

That also explains the earlier timeout: free pools are slow, so `AI_TIMEOUT_MS` is raised to 50000 ms,
which stays below the `maxDuration = 60` budget added in session 4 to the AI-invoking route segments.
The session 4 fixes (sanitized diagnostics plus a longer serverless budget) combined with this
configuration close the defect.

## Invariants unchanged

The lead is persisted before AI runs, an AI failure never deletes a lead, retry stays available, AI
output is Zod-validated before persistence, and no provider is hard-coded — `AI_MODE=mock` still works
locally with no network access.

## Files touched

| File | Change |
| --- | --- |
| `TASKS.md` | T-039 marked DONE; CURRENT EXECUTION moved to MVP COMPLETE; session 5 note added |
| `DECISIONS.md` | D-043 added — OpenRouter free router is the initial production runtime model |
| `README.md` | Production AI configuration section added with the verified values |
| `SESSION_REPORT.md` | This session 5 entry; session 4's open item marked resolved |

Documentation only — no application code was modified, and nothing was committed or pushed.

## Secrets

No secret values appear in this report or in any tracked file. Production secrets live only in the
Vercel environment variables; `.env.local` was not modified and no credential, `DATABASE_URL` or
`BETTER_AUTH_SECRET` value was printed.

## Open items

None in the TASKS.md queue. The session 3 residue is unchanged: the old demo password literal still
exists in git history (inert, because the live credential was revoked) and removing it would require a
history rewrite.

---

# SESSION 4 — Production Live-AI 404: Root Cause And Fix

Session date: 2026-09-11
Scope: live AI qualification failed in production with `AI provider request failed with status 404.`
with `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1` and
`AI_MODEL=openai/gpt-oss-20b:free`. Find and fix the actual integration bug, improve provider error
diagnostics safely, and keep the provider-agnostic architecture and the lead-safety guarantees.

---

## Root cause

The bug was **not** in the URL. It was the **model identifier**.

`lib/ai/client.ts` built the request as `` `${baseUrl.replace(/\/$/, "")}/chat/completions` ``, which
for the configured base URL resolves to:

```
https://openrouter.ai/api/v1/chat/completions
```

That is exactly OpenRouter's documented chat-completions endpoint. There was no doubled `/v1`, no
missing `/chat/completions`, and no malformed join. The request path was correct.

`openai/gpt-oss-20b:free` is simply **not a model OpenRouter serves**. Its live catalogue advertises
`openai/gpt-oss-20b` and `openai/gpt-oss-120b` (plus `:batch` variants); the `:free` suffix is not
used for those ids. For an unknown or endpoint-less model, OpenRouter responds:

```
HTTP 404
{"error":{"message":"No endpoints found for <model>.","code":404}}
```

That 404 is indistinguishable from a wrong URL — and the client discarded the response body, so the
failure read only as `status 404`. The earlier `openrouter/free` attempt did not 404 because
`openrouter/free` *is* a real (free-pool router) model; it failed with a timeout instead, which is a
different problem: free pools are slow, and the default serverless budget could abort the call before
the 30s client timeout was reached.

So the two reported symptoms had two distinct causes: a **timeout** (request budget too short for a
free pool) and a **404** (invalid model id).

## The fix

**`lib/ai/client.ts` (rewritten)**

| Area | Change |
|---|---|
| URL construction | `resolveChatCompletionsUrl()` appends `/chat/completions` exactly once, trims trailing slashes, tolerates a base URL that already ends with the endpoint, and rejects an empty base. Never appends a second `/v1`. |
| Failure diagnostics | Non-2xx responses are parsed into sanitized details: HTTP status, model, endpoint host/path, and the provider's own `code` / `type` / `message`. The body is size-capped and truncated. |
| Secret safety | `sanitizeProviderText()` redacts credential-shaped tokens and strips control characters; `describeProviderTarget()` drops the query string so a key cannot ride along in a URL. |
| `response_format` | A 400/422 that explicitly rejects `response_format` triggers exactly one retry without it. The prompt already requires JSON-only output and the parser tolerates prose and code fences. |
| Timeout | New optional `AI_TIMEOUT_MS` (default 30000 ms, clamped to 1000-120000) instead of a hard-coded 30s. |
| Empty replies | The error now reports the provider's `finish_reason`, which distinguishes "truncated" from "model produced nothing". |

A real production failure now reads, in the log and on the lead's activity timeline:

```
AI provider request failed with status 404. model=openai/gpt-oss-20b:free
endpoint=openrouter.ai/api/v1/chat/completions providerCode=404
providerMessage="No endpoints found for openai/gpt-oss-20b:free."
hint=the model name may not exist on this provider, or AI_BASE_URL may not be the provider's API root
```

**Serverless budget.** `export const maxDuration = 60` was added to `app/c/[clinicSlug]/page.tsx`
(public submission) and `app/(crm)/leads/[leadId]/page.tsx` (manual retry). Both run live AI inside a
server action, and the default function budget is shorter than `AI_TIMEOUT_MS`, which would abort the
call mid-flight and surface as a timeout regardless of the AI client's own timeout.

**`scripts/verify-ai-provider.mts` (new, `npm run verify:ai`)**

Three layers, none of which print a credential:

1. **Offline** — URL-construction assertions, including the exact production value, trailing-slash
   handling, and that no `/v1/v1` or doubled suffix can be produced.
2. **Model list** — when `AI_MODE=live`, asks the provider's OpenAI-compatible `GET /models` whether
   `AI_MODEL` exists, and prints the closest matches when it does not.
3. **`--self-test`** — drives the real client against a loopback stub provider and asserts the exact
   request path, `Authorization` header, body shape, 404 diagnostics, no-retry-on-404, the one
   `response_format` fallback retry, and `finish_reason` reporting.

Plus `--probe`, which performs one real completion. The script exits non-zero on failure so it can
gate a deployment.

**Unchanged invariants:** the lead is persisted before AI runs, an AI failure never deletes a lead,
retry stays available, structured output is still Zod-validated, and no provider is hard-coded —
`AI_MODE=mock` still works with no network access.

## Verification

| Check | Result |
|---|---|
| `npm run verify:ai` | PASS — 9/9 URL checks, 3/3 sanitisation checks; live checks SKIP locally because `AI_MODE=mock` |
| `npm run verify:ai -- --self-test` | PASS — 15/15 against the loopback stub provider |
| Real OpenRouter model list, `openai/gpt-oss-20b:free` | **FAIL** — not advertised (437 models checked); closest matches `openai/gpt-oss-20b`, `openai/gpt-oss-20b:batch` |
| Real OpenRouter model list, `openai/gpt-oss-20b` | PASS — advertised |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run verify:e2e` | PASS — 30/30, full workflow still green after the client rewrite |

The two real-provider rows above are the decisive evidence: they isolate the failure to the model id,
not the URL.

## Files touched

| File | Change |
|---|---|
| `lib/ai/client.ts` | Rewritten: URL builder, sanitized provider diagnostics, `response_format` fallback, `AI_TIMEOUT_MS`, `finish_reason` reporting |
| `lib/validation/env.ts` | `AI_TIMEOUT_MS` added; `AI_BASE_URL` must start with `http://` or `https://` |
| `app/c/[clinicSlug]/page.tsx` | `maxDuration = 60` |
| `app/(crm)/leads/[leadId]/page.tsx` | `maxDuration = 60` |
| `scripts/verify-ai-provider.mts` | New provider diagnostic and loopback integration test |
| `package.json` | `verify:ai` script |
| `.env.example` | `AI_BASE_URL` semantics, `AI_MODEL` guidance, `AI_TIMEOUT_MS` placeholder |
| `TASKS.md` | Session note 7, session 4 verification block, T-039 minimum-action addendum, session 4 remediation section |
| `DECISIONS.md` | D-042 — Provider Requests Are Diagnosed, Not Guessed |
| `README.md` | Verify-the-AI-provider section, live-AI URL/model rules, `AI_TIMEOUT_MS` |
| `SESSION_REPORT.md` | This section |

## Secrets

`.env.local` was not modified. No real API key was used: the loopback self-test uses a
loopback-only stub value that never leaves `127.0.0.1`, and the model-list checks only read
OpenRouter's public `GET /models`. No credential, `DATABASE_URL` or `BETTER_AUTH_SECRET` value was
printed at any point, and `.env.example` gained placeholders only.

## Outstanding action — RESOLVED IN SESSION 5

This is a **Vercel environment change, not a code change**. It is kept here as a record of what
session 4 recommended; **do not follow it as-is** — session 5 took a different, verified route (see
the closing note below and the session 5 entry):

1. In Vercel, set `AI_MODEL=openai/gpt-oss-20b` (the current `openai/gpt-oss-20b:free` is not a model
   OpenRouter serves).
2. Optionally set `AI_TIMEOUT_MS` if the default 30000 ms does not suit the plan.
3. Leave `AI_BASE_URL=https://openrouter.ai/api/v1` exactly as it is — it is correct.
4. Redeploy, then confirm the lead's activity timeline shows `AI_ANALYSIS_COMPLETED` instead of
   `AI_ANALYSIS_FAILED`.

Production live-AI verification was deliberately left open in this session; it was completed in
session 5. Production was pointed at OpenRouter's free-model router (`AI_MODEL=openrouter/free`,
`AI_TIMEOUT_MS=50000`) rather than `openai/gpt-oss-20b`, and live qualification then succeeded on a
real production lead. See the session 5 entry at the top of this file and DECISIONS.md D-043.

---

# SESSION 3 — Security Remediation: Public Seeded Demo Credential

Session date: 2026-09-11
Scope: a working sign-in credential for the seeded demo owner was committed to this public repository
and the deployed application points at the same Neon database. Remove it from source control, make
seeding safe, and revoke the credential that already existed in the database.

---

## The vulnerability

`prisma/seed.ts` contained a hard-coded `email` + `password` pair for the demo clinic owner
(`owner@bright-smile-demo.test`). Because the repository is public and the Vercel deployment shares the
seeded Neon database, that fixture was not demo data — it was a **live, reusable public credential**
for the production CRM.

It was not theoretical. `POST /api/auth/sign-in/email` with the seeded credential returned a valid
session cookie, and the `session` table still held an **active** row from earlier QA. Revoking the
password alone would have left that session usable until it expired.

## Fix — source control

`prisma/seed.ts` was rewritten so that demo sign-in is configuration, never source code:

- The password literal is **gone**. Credentials come from `DEMO_USER_EMAIL` (default
  `owner@bright-smile-demo.test`) and optional `DEMO_USER_PASSWORD`.
- **When `DEMO_USER_PASSWORD` is unset, the demo user is created with no credential account at all** —
  the demo data exists, but nobody can sign into it. This is now the default.
- Production guard: the seed refuses to run when `NODE_ENV` or `VERCEL_ENV` is `production` unless
  `ALLOW_DEMO_SEED=true`, and **never creates a sign-in credential in production** even then.
  Production owners are created through `/signup`.
- A password shorter than 8 characters (Better Auth's minimum) is rejected explicitly.
- The demo user is now reused via `upsert` instead of deleted and recreated, and its credential is
  reset to match the current environment on every run, so a credential left by an older revision cannot
  survive a re-seed.
- All guards run **before** the Prisma client is constructed, so a refused run never opens a database
  connection.
- The console output no longer echoes a password.
- The literal was also redacted from `TASKS.md` and `DECISIONS.md` so the documentation does not
  republish it.

## Fix — database remediation

New script `scripts/remove-demo-credential.mts` (dry-run by default), exposed as
`npm run security:revoke-demo-credential`. It deletes the demo user's credential account **and revokes
its sessions**, touching nothing else:

```
npm run security:revoke-demo-credential              # dry run
npm run security:revoke-demo-credential -- --apply   # apply
```

Applied against the live Neon database:

```
Matched 1 user row(s) for owner@bright-smile-demo.test.
  credential accounts to remove: 1
  active sessions to revoke:     1
  other linked providers kept:   0
Deleted 1 credential account(s) and revoked 1 session(s).
The clinic, leads, notes and activity timeline were not modified.
```

Data integrity confirmed immediately afterwards — **1 clinic, 9 leads (the submitted test lead is
still present, status NEW), 4 notes, 32 activities, 1 membership, 0 credential accounts, 0 sessions**.

## Verification

```
npx tsc --noEmit                    # PASS (exit 0)
npm run lint                        # PASS (exit 0)
npm run build                       # PASS (production build)
NODE_ENV=production npx tsx prisma/seed.ts        # PASS — refuses, no DB access
DEMO_USER_PASSWORD=short npx tsx prisma/seed.ts   # PASS — rejects, no DB access
npm run security:revoke-demo-credential -- --apply # PASS — 1 credential + 1 session revoked
```

Runtime checks against `next start` on port 3100, using the real Neon database:

| Check | Result |
| --- | --- |
| Old credential via `POST /api/auth/sign-in/email` | **401 INVALID_EMAIL_OR_PASSWORD** |
| `/c/bright-smile-dental` (public enquiry form) | 200 — data intact |
| `/dashboard` | 307 → `/login` — protection intact |
| `grep` for the literal across the working tree | clean (only an unrelated `.env.example` placeholder) |

The seed was deliberately **not** re-run against the live database: it replaces the demo clinic, which
would delete the test lead.

## Files touched

| File | Change |
| --- | --- |
| `prisma/seed.ts` | Removed the hard-coded credential; env-driven password; production guards; upsert + credential reset; no password in logs |
| `scripts/remove-demo-credential.mts` | New revocation script (credential **and** sessions), dry-run by default |
| `package.json` | Added the `security:revoke-demo-credential` script |
| `.env.example` | New optional `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `ALLOW_DEMO_SEED` placeholders — no real values |
| `TASKS.md` | Session note 6, T-007 security remediation note, CURRENT EXECUTION + session 3 verification log |
| `DECISIONS.md` | Added **D-041 — Demo Credentials Are Configuration, Never Source Code** |
| `README.md` | Rewrote the seed section; documented the revocation command |

## Secrets

`.env.local` was **not modified** and no secret values were printed. No credentials were fabricated.
The new `.env.example` entries are placeholders only.

## Known residue

The removed literal still exists in this repository's git history (commits `598cfeb`, `f5bcdb6`). It is
inert: the live credential is revoked, the seed cannot recreate it, and no other environment uses it.
Removing it from history requires a rewrite and force push, which was not performed.

## What the user must do next — create a secure production owner account

1. Open the deployed app and go to **`/signup`**.
2. Enter your name, your clinic name, a real staff email, and a **strong unique password** from a
   password manager (12+ characters). Never reuse the old demo password.
3. Submitting creates the Better Auth account **and** the clinic workspace with an `OWNER`
   membership. Then sign in at **`/login`**.
4. Do **not** run `npm run db:seed` against production — it now refuses unless `ALLOW_DEMO_SEED=true`,
   and it would replace the demo clinic including the test lead.
5. No new Vercel environment variables are required; `DEMO_USER_*` are local-only and should stay
   unset in production.

Two follow-ups worth noting:

- The demo clinic now has **no reachable owner** (its only membership belongs to a user with no
  credentials). The test lead is safe in the database; granting the new account an `OWNER` membership
  on `bright-smile-dental` would restore access to it.
- `/signup` is open registration, so anyone can create their own clinic workspace (tenant isolation is
  verified — they cannot see other clinics' data). Locking registration down is optional hardening.

---

# SESSION 2 — Prisma Migration Repair & Database Verification

Session date: 2026-09-11
Scope: fix the failing Prisma migration, then complete every database-dependent task that was
previously blocked.

---

## Root cause of P3006/P3018

`prisma.config.ts` (and `prisma/seed.ts`) called dotenv's `config()` **without `quiet: true`**.
dotenv v17 prints its `◇ injected env (8) from .env.local …` banner to **stdout**, and the initial
migration had been created by redirecting `prisma migrate diff … --script` into `migration.sql` —
so the banner was captured as line 1 of the SQL file. Postgres choked on `◇`.

**Fix:** removed the stray line (the file is now pure DDL, 264 lines, zero non-ASCII characters) and
added `quiet: true` to every `loadEnv(...)` call so it cannot recur.

---

## Tasks completed

| Task | Result |
| --- | --- |
| **T-006** | ✅ `format` / `validate` / `generate` + `npm run db:migrate` applied `20260911000000_init` to Neon — `migrate status`: database schema is up to date |
| **T-007** | ✅ `npm run db:seed` — demo clinic `bright-smile-dental`, 8 leads, demo owner; run twice to confirm repeatability |
| **T-040** | ✅ Route QA, anonymous **and** authenticated |
| **T-041** | ✅ Full end-to-end CRM workflow — 30/30 checks |

`migrate status` showed the migration as never-applied rather than failed, so no `migrate resolve`
was needed.

---

## Bug found and fixed during QA

`/c/<unknown-slug>` returned **200** while rendering the not-found UI. Cause: the route's
`loading.tsx` creates a Suspense boundary, so React flushed the shell — and with it the response
status — before `notFound()` threw. Deleting `app/c/[clinicSlug]/loading.tsx` restored a true
**404**.

The authenticated CRM keeps its skeletons, so an unknown lead id renders the correct not-found UI
with a 200 status. Recorded as an accepted tradeoff (DECISIONS.md D-039) because those URLs are
behind auth, are never crawled or integrated, and the user-visible behaviour is correct.

---

## Verification

Commands:

```
npx tsc --noEmit          # PASS (exit 0)
npm run lint              # PASS (exit 0)
npm run build             # PASS (Next.js 16.3.4, all routes compiled)
npx prisma format         # PASS
npx prisma validate       # PASS
npx prisma generate       # PASS
npm run db:migrate        # PASS
npm run db:seed           # PASS
npm run verify:e2e        # PASS (30/30)
```

Anonymous `next start` on port 3100:

- `/`, `/login`, `/signup` → 200
- `/dashboard`, `/leads`, `/leads/[leadId]` → 307 to `/login` (protection works)
- `/c/bright-smile-dental` → 200
- `/c/no-such-clinic-xyz` → **404**

Authenticated (real Better Auth session from `POST /api/auth/sign-in/email` as the seeded owner):

- `/dashboard` → 200
- `/leads` → 200
- `/leads/[leadId]` → 200, with the AI qualification panel rendered: score badge `100/100`, HOT
  priority, urgency/intent/service, Summary, Recommended action, Draft reply (staff review
  required), plus Internal notes, Workflow and Activity timeline

`npm run verify:e2e` (new) — 30/30 checks:

1. Public lead submission → clinic slug resolves, input passes Zod, lead persists
2. AI qualification → `LeadAnalysis` written with 1–100 score, HOT/WARM/COLD priority, populated
   summary / recommended action / draft reply, model name recorded
3. Lead appears in the CRM list (with AI priority), dashboard counters, recent leads
4. Staff opens the lead → detail loads for the owning clinic with the AI recommendation
5. Tenant isolation → a second clinic can neither read the lead nor list it
6. Status change and note both persist
7. Timeline records `LEAD_CREATED`, `AI_ANALYSIS_STARTED`, `AI_ANALYSIS_COMPLETED`,
   `STATUS_CHANGED`, the `APPOINTMENT_SET` milestone and `NOTE_ADDED`, newest first
8. AI retry upserts (exactly one `LeadAnalysis` row) instead of duplicating

The script deletes the records it creates, so the seed data stays the source of truth.

---

## Files touched

| File | Change |
| --- | --- |
| `prisma/migrations/20260911000000_init/migration.sql` | Removed the injected dotenv banner line |
| `prisma.config.ts`, `prisma/seed.ts` | `quiet: true` on every dotenv load |
| `app/c/[clinicSlug]/loading.tsx` | Deleted — restores a real 404 for unknown clinic links |
| `scripts/verify-e2e.mts` | New repeatable end-to-end verification script |
| `package.json` | Added the `verify:e2e` script |
| `TASKS.md` | T-006 / T-007 / T-040 / T-041 → DONE, CURRENT EXECUTION, session notes, verification log |
| `DECISIONS.md` | Added D-039 (not-found under streaming) and D-040 (dotenv is always quiet) |
| `README.md` | Added the end-to-end verification section and the dotenv warning |

---

## Secrets

`.env.local` was **not modified** and no secret values were printed anywhere. `DATABASE_URL` remains
ignored via the `.env*` rule in `.gitignore`. No credentials were fabricated.

---

## Remaining blocker (recorded in session 2 — since resolved in session 5)

| Task | Status | Minimum action |
| --- | --- | --- |
| **T-039 — Deploy to Vercel** | DONE (session 5) | — |

Everything else in the TASKS.md queue is DONE. `AI_MODE=mock` remains the local default; live AI mode
was verified in production in session 5.

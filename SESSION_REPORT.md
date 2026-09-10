# SESSION REPORTS — AI Dental Lead CRM

Most recent session first.

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

## Remaining blocker (still open after session 3 — session 3 added no new tasks)

| Task | Status | Minimum action |
| --- | --- | --- |
| **T-039 — Deploy to Vercel** | BLOCKED | Create/authorize the Vercel project, set `DATABASE_URL` (production Neon branch), `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AI_MODE` (plus `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` only if live AI is enabled), then deploy |

Everything else in the TASKS.md queue is DONE. `AI_MODE=mock` remains the local default; live AI mode
is still unverified and needs a real provider.

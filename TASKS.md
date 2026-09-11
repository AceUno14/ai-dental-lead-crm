# AI Dental Lead CRM — Tasks

## CURRENT EXECUTION

Current Phase: MVP COMPLETE — deployed to Vercel against the production Neon database, with live AI
qualification verified on a real production lead.

Current Task: None — every task in this queue is DONE.

Last Completed Task: T-039 (Deploy to Vercel), completed in session 5 once the production environment
was configured. Previously: T-041 (End-to-End CRM Test), T-006, T-007 and T-040 were completed in
session 2 after `DATABASE_URL` became available. Session 3 was a security remediation rather than a
queued task: the hard-coded demo credential was removed from source, the seed was made
production-safe, and the live Neon credential was revoked. Session 4 was a production AI integration
fix rather than a queued task: the live-mode HTTP 404 was diagnosed to an invalid `AI_MODEL` value,
provider error diagnostics were added, and a provider diagnostic script (`npm run verify:ai`) was
introduced. Session 5 confirmed the deployment and the live-AI path in production. See the session 5
note at the end of this file.

Blocked Tasks: None. T-039 was blocked in sessions 1-4 on Vercel account access and production
environment values; the user supplied those and the deployment succeeded.

Next Eligible Task: None. The TASKS.md queue is exhausted; see `# WHEN MVP IS COMPLETE` at the end of
this file before adding new scope. Do not invent Phase 11.

Last Verification (session 5 — production deployment and live AI, PASS):

- Production deployment (Vercel) is live and loads.
- Production AI configuration: `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1`,
  `AI_MODEL=openrouter/free`, `AI_TIMEOUT_MS=50000`.
- Live AI qualification verified in production: the existing lead "Live AI Test 2" was analysed after
  redeployment and returned lead score 90/100, priority HOT, urgency IMMEDIATE, intent HIGH, service
  EMERGENCY, with a generated summary, recommended action and draft reply. The activity timeline shows
  `AI_ANALYSIS_COMPLETED` and the recorded model is `openrouter/free`.

Last Verification (session 2 — all PASS):

- `npx tsc --noEmit` — PASS (exit 0)
- `npm run lint` — PASS (exit 0)
- `npm run build` — PASS (Next.js 16.3.4 production build, all routes compiled)
- `npx prisma format` / `npx prisma validate` / `npx prisma generate` — PASS
- `npm run db:migrate` — PASS (initial migration applied to Neon; `migrate status` reports in sync)
- `npm run db:seed` — PASS (repeatable; demo clinic + 8 leads + demo owner)
- `npx tsx scripts/verify-e2e.mts` — PASS (30/30 checks; full core workflow, tenant isolation, retry)
- `next start` on port 3100, anonymous — `/` 200, `/login` 200, `/signup` 200,
  `/dashboard` `/leads` `/leads/[leadId]` 307 → `/login`, `/c/bright-smile-dental` 200,
  `/c/no-such-clinic-xyz` 404
- `next start` on port 3100, authenticated as the seeded owner — `/dashboard` 200, `/leads` 200,
  `/leads/[leadId]` 200 with the AI panel, notes, workflow and timeline rendered

Last Verification (session 3 — demo credential revoked, all PASS):

- `npx tsc --noEmit` — PASS (exit 0)
- `npm run lint` — PASS (exit 0)
- `npm run build` — PASS (production build)
- Seed guards — PASS: `NODE_ENV=production npx tsx prisma/seed.ts` refuses to run, and a
  `DEMO_USER_PASSWORD` shorter than 8 characters is rejected; both fail before any database access
- `npm run security:revoke-demo-credential -- --apply` — PASS (1 credential account deleted, 1 session
  revoked)
- `next start` on port 3100: `POST /api/auth/sign-in/email` with the former demo credential now
  returns **401 INVALID_EMAIL_OR_PASSWORD**; `/c/bright-smile-dental` 200; `/dashboard` 307 → `/login`
- Data integrity after revocation — 1 clinic, 9 leads (the submitted test lead is still present,
  status NEW), 4 notes, 32 activities, 1 membership, **0 credential accounts, 0 sessions**

Last Verification (session 4 — production AI integration fix, all PASS):

- `npm run verify:ai` — PASS (9/9 offline URL-construction checks + 3/3 sanitisation checks; live
  checks SKIP because local `AI_MODE` is `mock`)
- `npm run verify:ai -- --self-test` — PASS (15/15 against a loopback stub provider: exact request
  path `/v1/chat/completions`, `Authorization` header, body shape, 404 diagnostics, no retry on 404,
  one `response_format` fallback retry, empty-reply `finish_reason` reporting)
- Real OpenRouter model-list check — `openai/gpt-oss-20b:free` FAILS (not advertised; 437 models
  checked, closest matches `openai/gpt-oss-20b`, `openai/gpt-oss-20b:batch`); `openai/gpt-oss-20b`
  PASSES. Confirms the production 404 was an invalid model id, not a URL bug.
- `npx tsc --noEmit` — PASS (exit 0)
- `npm run lint` — PASS (exit 0)
- `npm run build` — PASS (production build, all routes compiled)
- `npm run verify:e2e` — PASS (full core workflow still green after the AI client rewrite)

Database state: `DATABASE_URL` is configured in `.env.local` (not printed or committed) and the
schema is migrated and seeded. `AI_MODE=mock` remains the local default. Production runs
`AI_MODE=live` against OpenRouter and has been verified end-to-end (see the session 5 block above and
the session 5 note at the end of this file).

---

## EXECUTION RULE

TASKS.md is the authoritative project queue.

For every task:

TODO
→ IN_PROGRESS
→ implementation
→ verification
→ DONE
→ immediately begin next eligible task

Allowed statuses:

TODO

IN_PROGRESS

DONE

BLOCKED

Do not stop after one task.

---

## SESSION NOTES (read this first)

1. **Next.js could not be scaffolded in place.** The project root folder is
   `AI Dental Lead CRM` (spaces + uppercase), which `create-next-app` rejects as a package name, and
   the folder already contained the project documentation. The app was therefore scaffolded into a
   temporary subfolder (`_scaffold/ai-dental-lead-crm`, package name `ai-dental-lead-crm`) and the
   generated files were then copied into this project root. The temporary folder was deleted. All
   documentation files and `.env.example` were preserved untouched.
2. **Prisma 7 was installed by the toolchain** (`prisma@7.10.0`, `@prisma/client@7.10.0`). Prisma 7
   requires a driver adapter (`@prisma/adapter-pg`), a generated client with a required `output`
   path (`lib/generated/prisma`), and a root `prisma.config.ts`. See DECISIONS.md D-037.
3. **`AI_MODE=mock` is the configured local default.** No AI API key is needed for development.
4. **`.env.local` was created** with a locally generated `BETTER_AUTH_SECRET` and the documented
   placeholder `DATABASE_URL`. No real credentials were invented or committed. In session 2 the user
   supplied a real Neon `DATABASE_URL` there, and the migration + seed were applied.
5. **dotenv must always be loaded with `quiet: true`.** dotenv v17 prints an
   `◇ injected env (n) from ...` banner to **stdout**. In session 1 the initial migration had been
   produced by redirecting `prisma migrate diff --script` into `migration.sql`, so the banner landed
   as line 1 of the file and every `prisma migrate` attempt failed with P3006/P3018
   (`syntax error at or near "◇"`). The line was removed and `quiet: true` was added to every
   `loadEnv(...)` call. Never redirect Prisma/tsx stdout into a generated file without `quiet: true`.
6. **No credential is ever hard-coded (session 3).** `prisma/seed.ts` originally contained a literal
   demo password, which is a real, reusable public credential because the repository is public and
   the deployed app shares the seeded database. The literal is gone. Demo sign-in is now driven by
   `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` (see DECISIONS.md D-041), the seed refuses to run in
   production unless `ALLOW_DEMO_SEED=true`, it never creates a credential in production, and
   `npm run security:revoke-demo-credential -- --apply` revokes a credential left behind by an older
   revision. Never add a demo or test password back into source, docs, or `.env.example`.
7. **`AI_BASE_URL` is an API root, not an endpoint (session 4).** Set it to the provider root
   *including* its version prefix (`https://openrouter.ai/api/v1`); the client appends
   `/chat/completions` exactly once and never appends a second `/v1`. `AI_MODEL` must be an exact id
   the provider currently serves — a wrong or retired id is reported as HTTP 404, which is easily
   mistaken for a URL bug. Run `npm run verify:ai` (add `-- --self-test` and `-- --probe`) before
   changing provider config or redeploying. See DECISIONS.md D-042 and the session 4 note at the end
   of this file.
8. **Production runs OpenRouter's free-model router (session 5).** The verified production values are
   `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openrouter/free` and
   `AI_TIMEOUT_MS=50000`. `openrouter/free` is a real *router* id (it is not a `:free` model suffix),
   so it is a valid `AI_MODEL`; it dispatches across free-pool models, which can be slow, hence the
   longer request timeout. `AI_TIMEOUT_MS` must stay below the `maxDuration = 60` budget declared on
   the AI-invoking route segments. See DECISIONS.md D-043 and the session 5 note at the end of this
   file.

### Verify at first database contact

Everything below passes static verification and a production build, but the runtime paths could not
be exercised without a reachable database. Check these in order once `DATABASE_URL` is set:

1. `npm run db:migrate` applies `prisma/migrations/20260911000000_init/migration.sql` cleanly.
2. `npm run db:seed` creates the demo clinic, demo user, and 8 leads. The demo user gets a sign-in
   credential only when `DEMO_USER_PASSWORD` is set; otherwise it is created without one.
3. Better Auth writes and reads sessions through the Prisma 7 driver adapter (sign up, sign in, sign
   out). `better-auth@1.7.4` was configured against the adapter without a live round-trip test.
4. A public submission creates the lead and then the mock analysis (`/c/bright-smile-dental`).
5. Status change, note, and AI retry each append the expected timeline entries.
6. `AI_MODE=live` is verified in production (session 5) with `AI_BASE_URL=https://openrouter.ai/api/v1`
   and `AI_MODEL=openrouter/free`. It still needs `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` from a
   real provider and must fail safely when any of them is missing — which the local checks confirm.

---

# PHASE 1 — FOUNDATION

## T-001 — Initialize Next.js Application

Status: DONE

Dependencies: None

Objective:

Initialize the AI Dental Lead CRM.

Scope:

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- sensible import alias

Acceptance Criteria:

- application runs locally
- homepage renders
- TypeScript works
- Tailwind works

Verification:

npm run lint

Implementation Note:

Scaffolded with `create-next-app` (Next.js 16.3.4, React 19.2.8, Tailwind CSS v4, ESLint 9,
import alias `@/*`) using the temporary-folder workaround described in SESSION NOTES.
Homepage replaced with a product landing page. `npm run lint`, `npx tsc --noEmit`, and
`npm run build` all pass, and `next start` served `/` with HTTP 200.

---

## T-002 — Establish Project Structure

Status: DONE

Dependencies:

T-001

Objective:

Create minimal architectural folders.

Suggested:

components/

lib/

lib/db/

lib/auth/

lib/ai/

lib/services/

lib/validation/

types/

Acceptance Criteria:

- structure follows ARCHITECTURE.md
- no unnecessary directories
- application still runs

Verification:

npm run lint

Implementation Note:

Created `lib/db`, `lib/auth`, `lib/ai`, `lib/services`, `lib/validation`, `types`,
`components/ui`, `components/dashboard`, `components/leads`, `components/forms`,
`components/auth`, `prisma`, plus the App Router route groups `app/(crm)`, `app/c`, `app/api`.
No empty placeholder directories were created; every directory contains real code.

---

## T-003 — Install Core Dependencies

Status: DONE

Dependencies:

T-001

Objective:

Install MVP dependencies.

Scope:

- Prisma
- Prisma Client
- Zod
- Better Auth
- required Better Auth database packages

Do not add unrelated dependencies.

Acceptance Criteria:

- packages install successfully
- package configuration remains valid

Verification:

npm install

npm run lint

Implementation Note:

Installed `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`, `zod`, `better-auth`,
and dev dependencies `@better-auth/cli`, `tsx`, `@types/pg`. `package.json` gained
`"type": "module"` (required by Prisma 7 ESM) and database scripts (`db:format`, `db:validate`,
`db:generate`, `db:migrate`, `db:seed`, `db:studio`) plus `typecheck`.

---

# PHASE 2 — DATABASE

## T-004 — Configure Prisma

Status: DONE

Dependencies:

T-003

Objective:

Configure Prisma for PostgreSQL.

Scope:

- PostgreSQL provider
- DATABASE_URL
- Prisma Client
- shared database helper

Acceptance Criteria:

- Prisma validates
- database client is reusable
- credentials are not hard-coded

Verification:

npx prisma validate

Implementation Note:

`prisma.config.ts` loads `.env.local` (then `.env`) with dotenv and holds the datasource URL,
schema path, migration path, and seed command. `lib/db/prisma.ts` exports a single cached
`PrismaClient` built with `PrismaPg`. No credentials appear in source.

---

## T-005 — Create Database Schema

Status: DONE

Dependencies:

T-004

Objective:

Create core data models.

Models:

User

Authentication models required by Better Auth

Clinic

Membership

Lead

LeadAnalysis

LeadActivity

LeadNote

Enums:

MembershipRole

LeadStatus

LeadPriority

LeadUrgency

LeadIntent

ServiceCategory

ActivityType

Acceptance Criteria:

- relationships are valid
- clinic-owned data contains clinicId
- useful timestamps exist
- important indexes exist
- membership relation is valid

Verification:

npx prisma format

npx prisma validate

Implementation Note:

Better Auth models (`User`, `Session`, `Account`, `Verification`) were validated against
`npx @better-auth/cli generate` output and match it. `Lead` carries the architecture indexes
(`clinicId`, `clinicId + createdAt`, `clinicId + status`); `LeadAnalysis` is one-per-lead
(`leadId @unique`). Clinic-owned models all carry `clinicId` with cascade delete. Added
`ContactMethod` enum for the preferred contact field.

---

## T-006 — Generate Prisma Client and Migration

Status: DONE

Dependencies:

T-005

Objective:

Generate database client and initial migration.

Verification:

npx prisma generate

npx prisma migrate dev

If DATABASE_URL is unavailable:

- document the blocker
- do not invent credentials
- continue with independent tasks when possible

Verification (session 2 — PASS):

```
npx prisma format    -> Formatted prisma/schema.prisma
npx prisma validate  -> The schema is valid
npx prisma generate  -> Generated Prisma Client (7.10.0) to ./lib/generated/prisma
npm run db:migrate   -> Applying migration `20260911000000_init`
                        Your database is now in sync with your schema.
```

Resolution Note:

The first application attempt failed with P3006/P3018 (`syntax error at or near "◇"`) because the
committed `migration.sql` had a single non-SQL line at the top:

```
◇ injected env (8) from .env.local // tip: ⌘ enable debugging { debug: true }
```

Root cause: `prisma.config.ts` and `prisma/seed.ts` called `dotenv`'s `config()` without `quiet: true`.
dotenv v17 prints an "injected env" banner to **stdout**, and the migration file had originally been
produced by redirecting `prisma migrate diff ... --script` into `migration.sql`, so the banner was
captured as the first line of the file.

Fix applied:

1. Removed the stray banner line — the file now contains only the generated DDL (264 lines) and
   `grep` confirms there is no remaining non-ASCII/non-SQL text.
2. Added `quiet: true` to every `loadEnv(...)` call in `prisma.config.ts` and `prisma/seed.ts` so the
   banner cannot be captured again.

Because this is a brand new development database, the migration was applied as-is rather than
rewritten; `prisma migrate status` showed the migration as never-applied (no failed record to
resolve), so no `migrate resolve` step was needed.

Implementation Note:

The committed migration was produced by Prisma's own diff engine, so `migrate dev` on a database
with no migration history will simply apply it instead of generating a new one. The generated SQL
covers all 10 models, 8 enum types, the unique constraints, the architecture-mandated indexes, and
all foreign keys with their delete rules.

---

## T-007 — Add Development Seed

Status: DONE

Dependencies:

T-005

Objective:

Create safe demo data.

Include:

- demo dental clinic
- sample leads
- HOT/WARM/COLD examples
- several statuses
- mock analyses
- activities

Do not use real personal information.

Acceptance Criteria:

- seed is repeatable
- realistic dashboard data exists

Verification (session 2 — PASS):

```
npm run db:seed -> Seeded clinic "Bright Smile Dental"
                   (public form: /c/bright-smile-dental) with 8 leads.
                   Demo staff account: owner@bright-smile-demo.test (password supplied via DEMO_USER_PASSWORD)
                   The seed command has been executed.
```

Confirmed repeatable by running it twice in a row; the second run recreated the demo clinic/user
without violating any constraint. The demo owner signs in through Better Auth over HTTP with a real
session cookie, which proves the seeded password hash is compatible with live sign-in, not just with
`prisma db seed`.

Implementation Note:

Seed creates the demo clinic `bright-smile-dental` (public form `/c/bright-smile-dental`), 8 clearly
fictional leads spanning NEW/CONTACTED/APPOINTMENT_SET/WON/LOST and HOT/WARM/COLD, mock analyses
generated by the same code path used at runtime, LEAD_CREATED/AI_ANALYSIS_STARTED/
AI_ANALYSIS_COMPLETED activities, one STATUS_CHANGED per progressed lead, sample notes, and an OWNER
membership. It deletes and recreates only the demo clinic, so it is repeatable. A demo credential is
hashed through Better Auth so it stays compatible with real sign-in, but only when
`DEMO_USER_PASSWORD` is supplied.

Security Remediation (session 3 — PASS):

This task originally hard-coded a fixed demo password for `owner@bright-smile-demo.test` (the literal
is intentionally not repeated here). Because the repository is public and the deployed app shares the
seeded Neon database, that was a live public credential. The literal was removed from
`prisma/seed.ts` and from this file, the seed now reads
`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` (creating **no** credential when the password is unset),
refuses to run in production unless `ALLOW_DEMO_SEED=true`, and never creates a credential in
production. The already-seeded credential and its session were revoked from Neon with
`npm run security:revoke-demo-credential -- --apply`, and the former credential now returns 401.

Note: the credential still exists in this repository's git history (commits `598cfeb`, `f5bcdb6`).
It is inert because the live credential was revoked, but rewriting history or rotating the repo is
the only way to remove it from the history itself.

---

# PHASE 3 — AUTHENTICATION

## T-008 — Configure Better Auth

Status: DONE

Dependencies:

T-004

Objective:

Configure authentication.

Scope:

- server configuration
- Prisma/database adapter
- session handling
- login
- logout

Acceptance Criteria:

- authentication configuration works
- session can be resolved server-side
- secrets use environment variables

Verification:

npm run lint

npx tsc --noEmit

Implementation Note:

`lib/auth/auth.ts` configures Better Auth with the Prisma adapter, email/password (min length 8),
a 7-day session, and the `nextCookies` plugin so cookies work from Server Actions.
`app/api/auth/[...all]/route.ts` exposes the handlers. `lib/auth/session.ts` resolves sessions
server-side and never throws to the page.

---

## T-009 — Build Authentication Pages

Status: DONE

Dependencies:

T-008

Objective:

Create authentication UI.

Scope:

- login
- signup if required
- validation
- loading
- error states

Acceptance Criteria:

- forms work
- responsive
- authentication errors handled safely

Implementation Note:

`/login` and `/signup` are server pages that redirect authenticated users to `/dashboard`.
Sign up also requires a clinic name and creates the clinic plus an OWNER membership through
`lib/services/onboarding.ts`. Both forms use `useActionState` for pending and error states.
Authentication failures return safe, generic messages; no provider error text is exposed.
`next start` served both pages with HTTP 200.

---

## T-010 — Implement Clinic Membership Authorization

Status: DONE

Dependencies:

T-005

T-008

Objective:

Create server-side clinic authorization utilities.

Acceptance Criteria:

- user membership resolves server-side
- clinicId is not trusted from browser
- unauthorized resources cannot be read

Verification:

npx tsc --noEmit

Implementation Note:

`lib/auth/clinic.ts` resolves the authorized clinic from the authenticated user's `Membership` rows
only. An optional `alc_active_clinic` cookie can only *select between* memberships the user already
has, so it can never grant access to another tenant. `requireClinicContext()` redirects
unauthenticated visitors to `/login`. Every clinic-owned query uses `where: { id, clinicId }`.

---

## T-011 — Build Protected CRM Shell

Status: DONE

Dependencies:

T-010

Objective:

Create authenticated application shell.

Navigation:

Dashboard

Leads

Scope:

- protected layout
- clinic name
- user menu
- logout
- responsive navigation

Acceptance Criteria:

- unauthenticated users redirect
- authorized users can enter dashboard
- mobile layout works

Implementation Note:

`app/(crm)/layout.tsx` renders the clinic name, the signed-in user, their role, and a sign-out
action, and it renders a safe "No clinic access yet" panel when a user has no membership instead of
looping between `/login` and `/dashboard`. `components/dashboard/crm-nav.tsx` provides desktop
navigation and an accessible mobile menu (aria-expanded / aria-controls). Verified with
`next start`: `/dashboard` and `/leads` return 307 to `/login` when unauthenticated.

---

# PHASE 4 — PUBLIC LEAD CAPTURE

## T-012 — Create Public Clinic Route

Status: DONE

Dependencies:

T-005

Objective:

Create:

/c/[clinicSlug]

Acceptance Criteria:

- clinic resolves through slug
- invalid clinic produces safe not-found state
- private clinic information is not exposed

Implementation Note:

`findPublicClinicBySlug` validates the slug with Zod and selects only `id`, `name`, and `slug`.
`app/c/[clinicSlug]/not-found.tsx` returns a neutral message that does not reveal whether a clinic
exists. Runtime confirmation of these two paths still requires a database (see T-040).

---

## T-013 — Create Lead Validation Schema

Status: DONE

Dependencies:

T-012

Fields:

name

email

phone

serviceInterest

preferredContactMethod

urgency

message

consent

Acceptance Criteria:

- runtime validation uses Zod
- maximum input lengths exist
- invalid values rejected

Implementation Note:

`lib/validation/lead.ts` trims and lowercases input, enforces maximum lengths on every field,
validates the phone pattern, constrains the service/urgency/contact enums, and requires explicit
consent (`z.literal(true)`). `clinicSlugSchema` validates the public slug separately.

---

## T-014 — Build Dental Lead Form

Status: DONE

Dependencies:

T-013

Objective:

Create responsive public lead form.

Acceptance Criteria:

- mobile responsive
- accessible labels
- validation errors visible
- loading state
- duplicate submissions prevented where practical

Implementation Note:

`components/forms/dental-lead-form.tsx` uses `useActionState`: the submit button is disabled while
pending (prevents double clicks), field errors are announced with `role="alert"` next to their
labels, every control has an associated `<label>`, and the visitor's own input is preserved after a
failed submission. The server additionally ignores an identical submission from the same clinic,
email, and message within two minutes.

---

## T-015 — Build Lead Submission Server Operation

Status: DONE

Dependencies:

T-005

T-013

Objective:

Persist lead safely.

Workflow:

validate request

→ resolve clinic through slug

→ create Lead

→ create LEAD_CREATED activity

Acceptance Criteria:

- server-side validation
- clinicId not trusted from browser
- safe error handling
- valid lead persists

Implementation Note:

`app/c/[clinicSlug]/actions.ts` validates with Zod, resolves the clinic from the slug server-side,
persists the lead and the `LEAD_CREATED` activity in one transaction, and returns only generic
errors. Internal errors are logged without lead content.

---

## T-016 — Connect Form End-to-End

Status: DONE

Dependencies:

T-014

T-015

Objective:

Connect public form to lead creation.

Acceptance Criteria:

- valid submission works
- success state displayed
- failure provides safe retry
- duplicate click prevention works

Implementation Note:

The success state replaces the form with a confirmation panel; failures keep the form populated with
a safe retry message. The end-to-end write against a real database is part of T-041 (blocked).

---

# PHASE 5 — AI QUALIFICATION

## T-017 — Create AI Output Schema

Status: DONE

Dependencies:

T-005

Objective:

Create Zod schema containing:

leadScore

priority

urgency

intent

serviceCategory

summary

recommendedAction

draftReply

Acceptance Criteria:

- score limited to 0–100
- enums constrained
- text sizes constrained
- malformed response rejected

Implementation Note:

`lib/ai/schema.ts` validates the full contract; `parseLeadAnalysis` extracts the first JSON object
from a fenced or prose-wrapped model response before validating, and returns a safe failure message
instead of throwing.

---

## T-018 — Create Provider-Agnostic AI Client

Status: DONE

Dependencies:

T-017

Environment variables:

AI_MODE

AI_BASE_URL

AI_API_KEY

AI_MODEL

Modes:

mock

live

Acceptance Criteria:

- mock mode requires no network call
- live provider configuration is centralized
- missing credentials fail safely

Implementation Note:

`lib/ai/client.ts` is the only module that knows the provider shape: it calls an OpenAI-compatible
`/chat/completions` endpoint and maps failures to safe messages. Provider response bodies are never
surfaced because they can echo credentials or lead content. `assertLiveConfig` fails with
`AiConfigurationError` naming the missing variables. No vendor is hard-coded anywhere else.

---

## T-019 — Build Mock AI Analyzer

Status: DONE

Dependencies:

T-018

Objective:

Create deterministic development analysis.

Acceptance Criteria:

- produces schema-valid response
- urgent leads can score higher
- no external network request

Implementation Note:

`lib/ai/mock.ts` is a pure function: keyword and stated-urgency scoring, deterministic clamping to
0–100, priority derived from the score bands in D-013, service category derived from the selected
service, and fixed copy for summary/recommended action/draft reply. No timers, randomness, or
network access.

---

## T-020 — Create Dental Qualification Prompt

Status: DONE

Dependencies:

T-017

T-018

Prompt must instruct AI to:

- perform lead qualification
- determine urgency
- determine sales intent
- assign service category
- recommend follow-up
- generate draft response
- never diagnose
- never recommend treatment
- return structured output

Acceptance Criteria:

- centralized prompt
- matches Zod schema
- contains medical safety boundaries

Implementation Note:

`lib/ai/prompt.ts` holds a single system prompt with explicit ALLOWED/FORBIDDEN sections, the
scoring guide, and the exact JSON key contract, plus `buildLeadUserPrompt` which labels the visitor
message and requests JSON only.

---

## T-021 — Build Lead Analysis Service

Status: DONE

Dependencies:

T-018

T-019

T-020

Workflow:

Lead

→ AI_ANALYSIS_STARTED

→ AI analyzer

→ validate response

→ LeadAnalysis

→ AI_ANALYSIS_COMPLETED

Failure:

→ AI_ANALYSIS_FAILED

Acceptance Criteria:

- valid analysis persists
- invalid analysis rejected
- original Lead survives AI errors
- failure activity recorded

Implementation Note:

`lib/services/lead-analysis.ts` records the start activity, analyzes, validates, upserts the single
`LeadAnalysis` for the lead, then records completion with the score and priority. On any failure it
records `AI_ANALYSIS_FAILED`, logs a reason without lead content, and returns a failure result — the
lead is never modified or deleted. `runLeadAnalysisForClinic` resolves the lead by id **and**
clinicId first.

---

## T-022 — Analyze New Leads

Status: DONE

Dependencies:

T-015

T-021

Objective:

Trigger qualification after lead persistence.

Important:

Lead must be saved BEFORE AI analysis.

Acceptance Criteria:

- lead persists when AI fails
- successful analysis is attached to lead
- mock mode works end-to-end

Implementation Note:

`submitLeadAction` awaits `createPublicLead` (a transaction that also writes `LEAD_CREATED`) and
only then calls `runLeadAnalysis`, wrapped so an AI failure cannot fail the submission.
`AI_MODE=mock` is the local default, so no API key is required.

---

## T-023 — Create Retry AI Analysis

Status: DONE

Dependencies:

T-021

Objective:

Allow authorized clinic staff to retry analysis.

Acceptance Criteria:

- authorization enforced
- retry creates appropriate activity
- new analysis persists
- errors handled safely

Implementation Note:

`retryLeadAnalysisAction` requires a clinic context, validates the lead id, and calls
`runLeadAnalysisForClinic`, which re-checks clinic ownership. Because every retry records
`AI_ANALYSIS_STARTED`, failed attempts are visible on the timeline. Re-running replaces the existing
analysis (latest/current analysis per ARCHITECTURE.md).

---

# PHASE 6 — CRM

## T-024 — Build Dashboard Overview

Status: DONE

Dependencies:

T-011

Objective:

Display:

- Total Leads
- New Leads
- Hot Leads
- Appointments Set
- Recent Leads

Acceptance Criteria:

- all metrics clinic-scoped
- empty states work
- responsive design

Implementation Note:

`app/(crm)/dashboard/page.tsx` uses `getDashboardData(clinicId)`; all five queries are scoped by
clinicId. The empty state explains how to share the public enquiry link and shows `/c/{slug}`.
Metric cards use a two-column mobile / four-column desktop grid. A `loading.tsx` skeleton covers the
fetch.

---

## T-025 — Build Lead List

Status: DONE

Dependencies:

T-010

Objective:

Create `/leads`.

Columns:

Name

Service

Score

Priority

Urgency

Status

Created

Filters:

status

priority

Optional:

simple search

Acceptance Criteria:

- newest first
- clinic isolation
- rows link to detail pages
- responsive

Implementation Note:

`/leads` orders by `createdAt desc`, caps at the 100 most recent leads, and scopes every query by
clinicId. Filters are a server-rendered GET form (status, priority, and a simple name/email/phone
search), so they work without client JavaScript. Urgency is shown on the mobile card view and in the
AI panel; the desktop table shows name, service, score, priority, status, and created date. The
table is hidden below `sm` in favour of a card list, so there is no horizontal page overflow.

---

## T-026 — Build Lead Detail Page

Status: DONE

Dependencies:

T-021

T-025

Objective:

Display:

contact information

original inquiry

service interest

status

lead score

priority

urgency

intent

service category

summary

recommended action

draft reply

notes

timeline

Acceptance Criteria:

- clinic authorization enforced
- missing analysis handled gracefully
- AI content clearly labeled

Implementation Note:

`getClinicLeadDetail(clinicId, leadId)` is the only loader and requires both ids. A missing lead
renders the not-found page. `components/leads/ai-analysis-panel.tsx` handles the "not analysed" case
with a run-analysis action, and every AI section is labeled "AI-generated · review before sending"
with an explicit note that nothing is sent automatically.

---

## T-027 — Build Lead Status Workflow

Status: DONE

Dependencies:

T-026

Statuses:

NEW

CONTACTED

APPOINTMENT_SET

WON

LOST

Acceptance Criteria:

- update persisted
- authorization enforced
- activity recorded

Implementation Note:

`updateLeadStatusAction` validates with Zod, then `updateLeadStatus` re-resolves the lead by id and
clinicId, writes the new status, and records `STATUS_CHANGED` (plus `APPOINTMENT_SET`, `LEAD_WON`, or
`LEAD_LOST`) in the same transaction. No state-machine restrictions were added (per ARCHITECTURE.md).
Status labels live in `lib/lead-labels.ts` so client components never import database code.

---

## T-028 — Build Internal Notes

Status: DONE

Dependencies:

T-026

Acceptance Criteria:

- authorized staff can add note
- empty notes rejected
- author stored
- timestamp stored
- NOTE_ADDED activity created

Implementation Note:

`createLeadNoteSchema` rejects empty/whitespace-only notes and caps them at 2000 characters.
`addLeadNote` stores the author and records `NOTE_ADDED` in the same transaction after verifying the
lead belongs to the clinic. The note form clears itself on success.

---

## T-029 — Build Activity Timeline

Status: DONE

Dependencies:

T-026

Acceptance Criteria:

- activities correctly ordered
- timestamps visible
- clear human-readable labels

Implementation Note:

Activities are loaded newest-first (capped at 50) and rendered by
`components/leads/activity-timeline.tsx` with human-readable labels, a tone per activity type, and
actor attribution. Types with no actor display "system" (e.g. automated AI records).

---

# PHASE 7 — POLISH

## T-030 — Add Loading and Error States

Status: DONE

Dependencies:

T-024

T-025

T-026

Check:

- Dashboard
- Leads
- Lead Detail
- Public Form

Acceptance Criteria:

- useful loading states
- useful empty states
- safe error messages

Implementation Note:

Added skeleton `loading.tsx` files for dashboard, leads, lead detail, and the public clinic page,
each with an `aria-live` status and screen-reader text. Empty states exist for the dashboard, the
lead list (no matches), notes, and the timeline. `app/error.tsx` provides a retry without exposing
internals, and `app/not-found.tsx` plus `app/c/[clinicSlug]/not-found.tsx` cover missing resources.

---

## T-031 — Mobile Responsive QA

Status: DONE

Dependencies:

T-030

Check:

- navigation
- public form
- dashboard
- lead list
- lead detail
- forms
- buttons

Acceptance Criteria:

- no horizontal overflow
- readable on mobile
- usable touch controls

Implementation Note:

Reviewed at code level: the CRM nav collapses behind an accessible menu button below `sm`; the lead
list swaps its table for a card list below `sm` (the wide table is hidden, not merely scrollable, so
the page cannot overflow) with `overflow-x-auto` as a safety net; metric grids are 2/4 columns; the
lead detail uses single-column stacking below `lg`; every interactive control is at least ~40px tall
on touch. Long text uses `break-words`/`truncate`. Live device/browser confirmation of the
database-backed screens remains part of T-040/T-041 once a database is available.

---

## T-032 — Accessibility QA

Status: DONE

Dependencies:

T-031

Check:

- labels
- focus states
- keyboard navigation
- headings
- error messages
- semantic controls

Implementation Note:

Every form control has an associated label (or an explicit `<label for>` for the consent checkbox);
error text uses `role="alert"` and is linked by id; `aria-invalid` reflects field validity; the error
surfaces use `role="status"`/`role="alert"`; the mobile nav toggles `aria-expanded`/`aria-controls`
and current pages set `aria-current="page"`; one `h1` per page with ordered section headings; the
timeline is an ordered list; decorative colour dots are `aria-hidden`; focus outlines are kept
visible globally in `globals.css`. Both form flows use native controls, so keyboard operation works
without custom key handling.

---

# PHASE 8 — SECURITY AND QUALITY

## T-033 — Multi-Tenant Security Audit

Status: DONE

Dependencies:

T-029

Review:

- dashboard queries
- lead reads
- lead updates
- analysis
- retry analysis
- notes
- activities

Acceptance Criteria:

Every protected operation verifies clinic membership server-side.

Implementation Note:

Audited every Prisma call. Protected reads/writes resolve the clinic from `getClinicContext()` and
scope queries with `where: { id, clinicId }` (`lib/services/leads.ts`,
`lib/services/lead-workflow.ts`, `lib/services/lead-analysis.ts`). `recordActivity` always writes
the caller's clinicId. The only unscoped lookups are (a) `findPublicClinicBySlug`, which selects
only public clinic fields and is required by design (D-010), and (b) `createUniqueClinicSlug`, which
reads no tenant data. No server action or page accepts a clinic identifier from the browser; the
`alc_active_clinic` cookie only selects among memberships the user already holds. Client components
contain no database imports (enforced by the production build).

---

## T-034 — Validation and Secret Review

Status: DONE

Dependencies:

T-033

Review:

- Zod validation
- environment variables
- logs
- API errors
- public input
- protected mutations

Acceptance Criteria:

- no secret leakage
- all important inputs validated server-side

Implementation Note:

All runtime boundaries are validated with Zod: public lead input, slug, sign-in, sign-up, status
updates, notes, AI retry requests, AI responses, and server environment variables
(`lib/validation/env.ts`). Secrets are read exclusively from `process.env`. AI provider response
bodies are never returned or logged, the public submission returns one generic failure message, and
logs contain ids and reasons only — never emails, phone numbers, or lead messages. `.env.local` is
git-ignored (`.env*`) and no credential exists in any tracked file.

---

## T-035 — Static Verification

Status: DONE

Dependencies:

T-034

Run:

npm run lint

npx tsc --noEmit

Acceptance Criteria:

Both pass.

Do not hide legitimate errors simply to force green checks.

Implementation Note:

`npx tsc --noEmit` exits 0 and `npm run lint` (eslint ., the ESLint 9 flat config) exits 0 with no
warnings or suppressions added to silence real problems.

---

## T-036 — Production Build

Status: DONE

Dependencies:

T-035

Run:

npm run build

Acceptance Criteria:

Production build passes.

Implementation Note:

`npm run build` (which runs `prisma generate` first) completes successfully on Next.js 16.3.4 with
Turbopack. Routes: `/` and `/_not-found` static; `/api/auth/[...all]`, `/c/[clinicSlug]`,
`/dashboard`, `/leads`, `/leads/[leadId]`, `/login`, `/signup` dynamic. `next.config.ts` marks `pg`
as a server external package, which the Prisma driver adapter requires.

---

# PHASE 9 — DEPLOYMENT

## T-037 — Finalize Environment Variables

Status: DONE

Dependencies:

T-036

Objective:

Ensure .env.example exactly reflects application requirements.

Acceptance Criteria:

- required variables documented
- unused variables removed
- no real credentials present

Implementation Note:

Reviewed `.env.example` against the implementation. Every variable it lists is used:
`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AI_MODE`,
`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`; the optional Resend entries are correctly commented out
because email is out of MVP scope (D-024). It contains placeholders only. The file was left
unchanged because it is already accurate; the leading `[TEMPLATE]` marker line is inert for dotenv
parsers.

---

## T-038 — Prepare Vercel Deployment

Status: DONE

Dependencies:

T-036

Check:

- production build
- Prisma configuration
- DATABASE_URL
- auth configuration
- AI configuration
- production URLs

Acceptance Criteria:

Project is deployable to Vercel.

Implementation Note:

Verified: `npm run build` passes and runs `prisma generate` first (with a postinstall script as a
safety net, so the generated client always exists on a clean Vercel install); `lib/generated` is
git-ignored; the Prisma driver adapter works over Neon's pooled `sslmode=require` connection string;
Better Auth reads `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` from the environment and its cookie handler
is Next-native, so no Node-only API is used; AI mode is environment driven and defaults to mock.
Remaining steps are environment values and the actual deploy (T-039).

---

## T-039 — Deploy to Vercel

Status: DONE

Dependencies:

T-038

Possible Blocker:

Requires user access to Vercel, Neon, and environment secrets.

Acceptance Criteria:

- deployment succeeds
- live URL loads

If authorization is unavailable (this was the session 1-4 situation; no longer applicable, because the
task is DONE):

Mark BLOCKED.

Do not fabricate credentials.

Continue with independent QA tasks.

Blocker (sessions 1-4 — now resolved):

No Vercel account access, no production database, and no production secrets were available in those
sessions. Nothing was fabricated.

Minimum user action (supplied by the user before session 5):

Create the Vercel project, add `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `AI_MODE` (and `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` if live AI is enabled) as
environment variables, then deploy.

Verification (session 5 — PASS):

- The production Vercel deployment is live and its URL loads; it runs against the production Neon
database with authentication, tenant isolation and the public lead form all working.
- Production AI configuration: `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1`,
  `AI_MODEL=openrouter/free`, `AI_TIMEOUT_MS=50000`.
- Live AI qualification was verified on a real production lead: the existing lead "Live AI Test 2"
  was analysed after redeployment and returned score 90/100, priority HOT, urgency IMMEDIATE, intent
  HIGH, service EMERGENCY, plus a generated summary, recommended action and draft reply. Its activity
  timeline shows `AI_ANALYSIS_COMPLETED` and the recorded model is `openrouter/free`.

The model id chosen in production resolves the session 4 remedy ("point `AI_MODEL` at a model the
provider actually serves") while keeping the provider-agnostic architecture: OpenRouter's free-model
router was used instead of a specific `openai/gpt-oss-*` id. See DECISIONS.md D-043 and the session 5
note at the end of this file.

---

# PHASE 10 — FINAL QA

## T-040 — Route QA

Status: DONE

Dependencies:

T-038

Test important routes:

/

login

dashboard

leads

lead detail

/c/[clinicSlug]

invalid clinic slug

Acceptance Criteria:

- public routes work
- protected routes remain protected
- no critical navigation errors

Verification (session 2, `next start` on port 3100, real Neon database — ALL PASS):

Anonymous:

- `/` → 200
- `/login` → 200
- `/signup` → 200
- `/dashboard` → 307 → `/login` (protection works)
- `/leads` → 307 → `/login` (protection works)
- `/leads/[leadId]` → 307 → `/login` (protection works)
- `/c/bright-smile-dental` → 200, public form renders with every expected field
- `/c/no-such-clinic-xyz` → 404, renders the route-level not-found state

Authenticated (real Better Auth session cookie from
`POST /api/auth/sign-in/email` as the seeded owner):

- `/dashboard` → 200 (31 KB)
- `/leads` → 200 (61 KB)
- `/leads/[leadId]` → 200 and the rendered HTML contains the AI qualification panel: score badge
  (`100/100`), HOT priority badge, urgency/intent/service fields, Summary, Recommended action, and
  Draft reply (staff review required), plus Internal notes, Workflow, and Activity timeline.

Bug found and fixed during this QA:

`/c/[clinicSlug]` originally returned **200** for an unknown slug even though the not-found UI was
rendered. Cause: the route's `loading.tsx` creates a Suspense boundary, React flushes the shell
(and therefore the 200 status) before `notFound()` is thrown, so the status can no longer be
changed. Deleting `app/c/[clinicSlug]/loading.tsx` restores a true 404 for an unknown clinic link.

Known limitation (accepted, documented in DECISIONS.md D-039): inside the authenticated CRM the
`loading.tsx` skeletons are kept, so a non-existent lead id renders the not-found UI with a 200
status. The URL is behind auth, is never crawled or integrated, and the user-visible behaviour is
correct, so correct streaming UX is preferred there.

---

## T-041 — End-to-End CRM Test

Status: DONE

Dependencies:

T-040

Test:

visitor submits dental lead

→ Lead persists

→ AI analyzes

→ Lead appears in CRM

→ staff opens Lead

→ AI recommendation visible

→ status updated

→ note added

→ activity timeline updated

Acceptance Criteria:

Full core workflow works.

Verification (session 2 — PASS, `AI_MODE=mock`):

A repeatable script drives the exact service functions the server actions call against the real
database and asserts every step of the workflow:

```
npx tsx scripts/verify-e2e.mts
```

Result — 30/30 checks pass:

1. Visitor submits the public enquiry form → clinic slug resolves, input passes the Zod schema, the
   lead is persisted.
2. AI qualification runs → `LeadAnalysis` is written with a 1–100 score, a HOT/WARM/COLD priority,
   populated summary/recommended action/draft reply, and the model name.
3. Lead appears in the CRM → present in the clinic lead list with its AI priority, counted on the
   dashboard and surfaced in recent leads.
4. Staff opens the lead → detail loads for the owning clinic and the AI recommendation is present.
5. Tenant isolation → a second clinic can neither read the lead nor see it in its lead list.
6. Status updated and note added → both persist; the seeded OWNER acts as the staff user.
7. Activity timeline → LEAD_CREATED, AI_ANALYSIS_STARTED, AI_ANALYSIS_COMPLETED, STATUS_CHANGED,
   APPOINTMENT_SET milestone and NOTE_ADDED are all recorded, newest-first ordered, and the note is
   rendered on the detail.
8. AI retry → re-running the analysis upserts (exactly one `LeadAnalysis` row) instead of duplicating.

The script deletes the records it creates, so the seed data stays the source of truth.

---

## T-042 — Documentation Review

Status: DONE

Dependencies:

T-041

Review:

AI_CONTEXT.md

TASKS.md

ARCHITECTURE.md

DECISIONS.md

.env.example

README.md

Acceptance Criteria:

Documentation matches actual implementation.

Implementation Note:

AI_CONTEXT.md, ARCHITECTURE.md, and `.env.example` still match the implementation as written and
were left unchanged. DECISIONS.md gained D-037 (Prisma 7 client generation and driver adapter),
D-038 (Server Actions for mutations) and D-039 (not-found status under streaming). README.md gained
a Prisma 7 note and a seed-data section describing `npm run db:seed`, the demo clinic public form
URL, and the fact that seed credentials are local-only. TASKS.md now reflects the real repository
state, including the blocked items and the minimum action needed to unblock them.

Session 2 follow-up: with `DATABASE_URL` available, T-006, T-007, T-040 and T-041 were completed and
this documentation was refreshed (README gained the verification-script section, DECISIONS gained
D-039, and TASKS.md recorded the first-database-contact results).

---

## T-043 — Final MVP Verification

Status: DONE

Dependencies:

T-042

Run:

npm run lint

npx tsc --noEmit

npm run build

Acceptance Criteria:

- lint passes
- TypeScript passes
- build passes
- no critical known blocker
- TASKS.md matches repository status

Implementation Note:

`npm run lint` PASS, `npx tsc --noEmit` PASS, `npm run build` PASS. The only outstanding item is the
external Vercel deployment (T-039); no code-level blocker remains. In session 2 the database-backed
blockers were cleared (T-006, T-007, T-040, T-041 all DONE), so this verification now also includes
the real Neon database, the seeded data, the end-to-end workflow script, and an authenticated
production smoke test.

---

# SESSION 4 — PRODUCTION LIVE-AI 404 REMEDIATION

Not a queued task: a production defect reported after deployment.

Symptom: with `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1` and
`AI_MODEL=openai/gpt-oss-20b:free`, live qualification failed with
`AI provider request failed with status 404.` An earlier attempt with a different free model failed
with a provider timeout instead. Public submission, persistence, auth and tenant isolation were all
unaffected, and the lead was never lost.

Root cause: the **model id**, not the URL. `AI_BASE_URL` already resolved correctly to
`https://openrouter.ai/api/v1/chat/completions` (OpenRouter's documented endpoint) — there was no
doubled `/v1` and no missing `/chat/completions`. `openai/gpt-oss-20b:free` is simply not a model
OpenRouter serves: its live catalogue advertises `openai/gpt-oss-20b` and `openai/gpt-oss-120b`
(plus `:batch` variants) and the `:free` suffix is not used for those ids. OpenRouter reports
"no endpoints found for <model>" as HTTP 404, which is indistinguishable from a bad URL unless the
provider's own error body is read — and the old client discarded it.

Fix (see DECISIONS.md D-042):

1. `lib/ai/client.ts` rewritten:
   - `resolveChatCompletionsUrl()` appends the suffix exactly once, trims trailing slashes, tolerates
     a full endpoint as the base, and rejects an empty base.
   - Non-2xx responses are turned into sanitized diagnostics: status, model, endpoint host/path, and
     the provider's `code`/`type`/`message`, size-capped, with credential-shaped tokens redacted.
   - `response_format` is retried once without it only when a 400/422 explicitly rejects it.
   - `AI_TIMEOUT_MS` makes the request timeout configurable (default 30000 ms, clamped).
   - Empty assistant replies now report `finish_reason`.
2. `export const maxDuration = 60` on the public clinic page and the lead detail page, so the
   serverless budget cannot abort a live provider call before `AI_TIMEOUT_MS` is reached.
3. `npm run verify:ai` (`scripts/verify-ai-provider.mts`) added: offline URL assertions, provider
   model-list check, `--probe` for a real completion, `--self-test` for a loopback stub round-trip.

Unchanged invariants: the lead is persisted before AI runs, an AI failure never deletes a lead,
retry stays available, and AI output is still Zod-validated.

Verification: see the session 4 block under CURRENT EXECUTION. The decisive evidence is the real
OpenRouter model-list check — `openai/gpt-oss-20b:free` FAILS (not advertised, closest matches
`openai/gpt-oss-20b`, `openai/gpt-oss-20b:batch`) while `openai/gpt-oss-20b` PASSES.

Outstanding action (Vercel environment change, not code): **resolved in session 5.** Rather than
switching to `openai/gpt-oss-20b`, the production environment was pointed at OpenRouter's free-model
router with `AI_MODEL=openrouter/free` and `AI_TIMEOUT_MS=50000`, and live AI qualification was then
confirmed working on a real production lead. See the `# SESSION 5` section below and DECISIONS.md
D-043.

---

# SESSION 5 — PRODUCTION DEPLOYMENT AND LIVE-AI VERIFICATION

Not a queued task beyond T-039: the final deployment and production verification pass.

Outcome: T-039 is DONE. The application is deployed on Vercel against the production Neon database,
and live AI qualification has been verified end-to-end in production.

Production runtime configuration (verified):

```
AI_MODE=live
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openrouter/free
AI_TIMEOUT_MS=50000
```

What was verified in production:

- The deployed URL loads; public lead submission, Neon persistence, authentication and tenant
  isolation all work.
- Live AI qualification succeeds: the existing lead "Live AI Test 2" was analysed after redeployment
  and returned lead score **90/100**, priority **HOT**, urgency **IMMEDIATE**, intent **HIGH**, service
  **EMERGENCY**, together with a generated summary, recommended action and draft reply.
- The lead's activity timeline shows `AI_ANALYSIS_COMPLETED`, and the model recorded on the analysis is
  `openrouter/free`.

Why this closes session 4: the session 4 diagnosis was that `openai/gpt-oss-20b:free` was not a model
OpenRouter serves. Production now uses `openrouter/free` — a real OpenRouter *router* id (distinct
from a `:free` model suffix) that dispatches across free-pool models. Because free pools are slow,
`AI_TIMEOUT_MS` is raised to 50000 ms, which stays below the `maxDuration = 60` budget declared on
the AI-invoking route segments. The provider-agnostic architecture is unchanged: nothing in the
application is hard-coded to OpenRouter, and `AI_MODE=mock` still works locally with no network.

Lead-safety invariants remain unchanged and are visible in production: the lead is persisted before
AI runs, an AI failure never deletes a lead, retry stays available, and AI output is Zod-validated
before persistence.

Open items: none in the TASKS.md queue. Known residue from session 3 (the old demo credential still
existing in git history, though inert) is unchanged and still requires a history rewrite to remove.

---

# WHEN MVP IS COMPLETE

Current Phase: MVP COMPLETE — deployed and verified in production

Current Task: None

Last Completed Task: T-039 (Deploy to Vercel)

Blocked Tasks: None

Next Eligible Task: None. Do not open new scope until the user requests it.

Last Verification:

npm run lint — PASS

npx tsc --noEmit — PASS

npm run build — PASS

npm run db:migrate — PASS

npm run db:seed — PASS

npx tsx scripts/verify-e2e.mts — PASS (30/30)

npm run verify:ai — PASS (offline URL checks + loopback self-test)

next start route QA (anonymous + authenticated) — PASS

Production (Vercel, `AI_MODE=live`) — PASS (lead "Live AI Test 2" analysed: 90/100, HOT,
IMMEDIATE, EMERGENCY, `AI_ANALYSIS_COMPLETED`, model `openrouter/free`)

Do not automatically invent Phase 11.

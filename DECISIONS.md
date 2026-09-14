# AI Dental Lead CRM — Decisions

This document contains architectural and product decisions already made for the MVP.

DeepSeek should follow these decisions instead of repeatedly reconsidering the stack or product direction.

Add new decisions only when a genuine architectural choice is made.

---

# D-001 — Next.js App Router

Status:

ACCEPTED

Decision:

Use Next.js App Router as the full-stack framework.

Reason:

One repository can contain the frontend, server components, route handlers, authentication, and business logic.

Do not split the MVP into separate frontend and backend repositories.

---

# D-002 — TypeScript

Status:

ACCEPTED

Decision:

Use TypeScript throughout the application.

Reason:

Improves maintainability, correctness, and AI-assisted development.

Do not convert the project to JavaScript.

---

# D-003 — Tailwind CSS

Status:

ACCEPTED

Decision:

Use Tailwind CSS for application styling.

Reason:

Fast implementation, responsive design, and minimal CSS overhead.

Do not introduce a second major styling framework.

---

# D-004 — PostgreSQL

Status:

ACCEPTED

Decision:

Use PostgreSQL.

Reason:

Reliable relational database appropriate for CRM data.

---

# D-005 — Neon

Status:

ACCEPTED

Decision:

Use Neon as the PostgreSQL provider.

Reason:

Works well with Vercel and portfolio applications.

---

# D-006 — Prisma

Status:

ACCEPTED

Decision:

Use Prisma ORM.

Reason:

Provides typed database access, schema management, and migrations.

Do not introduce another ORM unless Prisma creates a genuine blocker.

---

# D-007 — Better Auth

Status:

ACCEPTED

Decision:

Use Better Auth for application authentication.

Reason:

Provides a modern authentication system compatible with the selected stack.

Authorization and clinic membership checks remain application responsibilities.

---

# D-008 — Clinic-Based Multi-Tenancy

Status:

ACCEPTED

Decision:

Clinic is the workspace/tenant boundary.

All protected clinic-owned records must be scoped using clinicId.

Reason:

Allows the portfolio project to demonstrate multi-tenant SaaS architecture.

---

# D-009 — Server-Side Tenant Enforcement

Status:

ACCEPTED

Decision:

Do not trust clinicId supplied by the browser for authorization.

Resolve authorized clinic access from authenticated membership server-side.

Reason:

Prevents cross-tenant access.

---

# D-010 — Public Clinic Slug

Status:

ACCEPTED

Decision:

Public lead forms use:

/c/[clinicSlug]

Reason:

A public visitor is not authenticated, so a safe public clinic identifier is required.

The server resolves the slug to the clinic.

---

# D-011 — CRM Lead Statuses

Status:

ACCEPTED

Decision:

Use:

NEW

CONTACTED

APPOINTMENT_SET

WON

LOST

Reason:

These statuses are sufficient for the MVP lead workflow.

Do not introduce unnecessary pipeline stages yet.

---

# D-012 — AI Priority

Status:

ACCEPTED

Decision:

Use:

HOT

WARM

COLD

Reason:

Simple terminology easily understood by clinic staff.

---

# D-013 — Lead Score

Status:

ACCEPTED

Decision:

AI lead score ranges from:

0 to 100

Default interpretation:

80–100 HOT

50–79 WARM

0–49 COLD

Reason:

Easy for users to interpret and visually prioritize.

---

# D-014 — AI Is a Lead Qualification Assistant

Status:

ACCEPTED

Decision:

AI is used for:

- qualification
- lead scoring
- intent classification
- urgency detection
- service categorization
- summarization
- recommended follow-up
- draft reply generation

AI is NOT used to diagnose or prescribe treatment.

Reason:

The product is a CRM, not a clinical system.

---

# D-015 — Human Review Required

Status:

ACCEPTED

Decision:

AI draft replies are suggestions only.

The MVP will not automatically send generated messages to leads.

Reason:

Reduces unnecessary risk and keeps staff in control.

---

# D-016 — Provider-Agnostic Runtime AI

Status:

ACCEPTED

Decision:

Use:

AI_BASE_URL

AI_API_KEY

AI_MODEL

instead of deeply hard-coding a specific runtime provider.

Reason:

Allows the runtime provider to change without rewriting the CRM.

---

# D-017 — Mock AI Mode

Status:

ACCEPTED

Decision:

Support:

AI_MODE=mock

Reason:

Allows development and testing without spending API credits.

Mock output should be deterministic and schema-valid.

---

# D-018 — Live AI Mode

Status:

ACCEPTED

Decision:

Support:

AI_MODE=live

Reason:

Production can call an OpenAI-compatible external model.

Missing credentials must fail safely.

---

# D-019 — Validate AI Output

Status:

ACCEPTED

Decision:

Every AI response must pass a Zod schema before persistence.

Reason:

Raw LLM output is not reliable enough to trust directly.

---

# D-020 — Persist Lead Before AI

Status:

ACCEPTED

Decision:

Save the Lead before running AI qualification.

Reason:

An AI outage must not cause a valuable customer inquiry to disappear.

---

# D-021 — Retry Failed AI Analysis

Status:

ACCEPTED

Decision:

Authorized staff can retry analysis.

Reason:

External AI providers can fail temporarily.

---

# D-022 — Activity Timeline

Status:

ACCEPTED

Decision:

Maintain LeadActivity records for important CRM events.

Reason:

Improves traceability and makes the CRM portfolio project more realistic.

---

# D-023 — Internal Notes

Status:

ACCEPTED

Decision:

Staff can add LeadNote records.

Reason:

Useful baseline CRM functionality.

---

# D-024 — No Automatic Email in MVP

Status:

ACCEPTED

Decision:

Do not automatically email leads during the initial MVP.

Reason:

AI draft generation and CRM workflow should be completed before outbound automation.

Resend may be added later.

---

# D-025 — No Appointment Calendar in MVP

Status:

ACCEPTED

Decision:

APPOINTMENT_SET is a CRM status only.

Do not build full scheduling during MVP.

Reason:

Calendar infrastructure expands scope significantly without being required to demonstrate the core product value.

---

# D-026 — No Billing

Status:

ACCEPTED

Decision:

Do not implement Stripe or subscription billing during MVP.

Reason:

Finish lead capture and qualification first.

---

# D-027 — No EHR Functionality

Status:

ACCEPTED

Decision:

Do not build medical charts, patient records, clinical documentation, insurance records, or treatment plans.

Reason:

This application is a lead CRM.

---

# D-028 — Minimal Lead Information

Status:

ACCEPTED

Decision:

Collect only data useful for sales follow-up.

Recommended fields:

Name

Email

Phone

Service Interest

Preferred Contact

Urgency

Message

Consent

Reason:

Avoid unnecessary collection of sensitive information.

---

# D-029 — Vercel Deployment

Status:

ACCEPTED

Decision:

Deploy the Next.js application to Vercel.

Reason:

Straightforward integration with the selected framework.

---

# D-030 — Real Secrets Never Go in Repository

Status:

ACCEPTED

Decision:

.env.example contains only names and placeholders.

Local secrets go in:

.env.local

Production secrets go in:

Vercel Environment Variables

Reason:

Credentials must not be committed.

---

# D-031 — DeepSeek Uses TASKS.md Continuously

Status:

ACCEPTED

Decision:

DeepSeek V4 Flash should execute TASKS.md sequentially throughout each Freebuff session.

After completing a task it must immediately start the next eligible task.

Reason:

Maximizes productive implementation time within each one-hour Freebuff coding session.

---

# D-032 — Small Task Slices

Status:

ACCEPTED

Decision:

Tasks should normally represent bounded implementation slices.

Reason:

Smaller tasks make autonomous AI execution, verification, debugging, and session continuation more reliable.

---

# D-033 — No Unrelated Refactors

Status:

ACCEPTED

Decision:

DeepSeek should not refactor unrelated working code while implementing a task.

Reason:

Reduces regressions and wasted Freebuff session time.

---

# D-034 — Blocked Tasks Do Not Stop Session

Status:

ACCEPTED

Decision:

If a task requires unavailable credentials or user authorization:

- mark it BLOCKED
- record the reason
- continue another independent task

Reason:

One external blocker should not waste the remaining one-hour coding session.

---

# D-035 — Documentation Is Persistent AI Context

Status:

ACCEPTED

Decision:

AI_CONTEXT.md, TASKS.md, ARCHITECTURE.md, and DECISIONS.md serve as persistent project memory between Freebuff sessions.

Reason:

A new DeepSeek session should be able to continue without the user manually explaining prior progress.

---

# D-036 — Final Quality Gate

Status:

ACCEPTED

Decision:

Before considering the MVP complete, run:

npm run lint

npx tsc --noEmit

npm run build

Reason:

The portfolio project should finish with a clean production build.

---

# D-037 — Prisma 7 Client Generation And Driver Adapter

Status:

ACCEPTED

Decision:

Use Prisma 7 as installed by the current toolchain, which requires:

- a required `output` path in the generator (`lib/generated/prisma`)
- the PostgreSQL driver adapter `@prisma/adapter-pg`
- a root `prisma.config.ts` for schema, migrations, seed, and the datasource URL
- explicit environment loading (dotenv) because Prisma 7 no longer loads `.env` files

Reason:

Prisma 7 is the current major version. Adapting to it keeps the project on a supported release
instead of pinning an older ORM. All Prisma-specific wiring stays inside `lib/db/prisma.ts`,
`prisma.config.ts`, and `prisma/seed.ts`, so the rest of the application is unaffected.

Consequences:

- `lib/generated` is git-ignored and regenerated by `npm run build` / the postinstall script.
- Application code imports `PrismaClient` from `@/lib/generated/prisma/client`, not `@prisma/client`.
- `next.config.ts` marks `pg` as a server external package.

---

# D-038 — Server Actions For Mutations

Status:

ACCEPTED

Decision:

Use Next.js Server Actions for all application mutations (public lead submission, sign in/sign up,
status change, notes, AI retry) with Zod validation inside each action, instead of separate REST
route handlers.

Reason:

Server Actions keep validation and authorization next to the UI that triggers them and avoid an
unnecessary internal API surface for the MVP. The only route handler is the Better Auth catch-all.

---

# D-039 — Correct 404 Status Beats A Route-level Loading Skeleton

Status:

ACCEPTED

Decision:

A route-level `loading.tsx` may not be used on a route that needs to answer with a non-200 status
for missing data. `app/c/[clinicSlug]/loading.tsx` was deleted so an unknown clinic slug returns a
real HTTP 404; the authenticated CRM routes keep their skeletons.

Reason:

`loading.tsx` creates a Suspense boundary. React flushes the shell (and therefore the response
status) before the page body runs, so a later `notFound()` can only swap the rendered UI — the status
stays 200. For the public clinic link this matters: `/c/<slug>` is the only crawlable, shareable,
integratable surface in the product, so an unknown clinic must not answer 200. Inside the
authenticated CRM the URL is never crawled or integrated and the user-visible not-found UI is
correct, so the streaming skeleton is worth more than the status code there.

Consequences:

- `/c/bright-smile-dental` → 200, `/c/no-such-clinic-xyz` → 404.
- An unknown lead id inside the CRM renders the not-found UI with a 200 status. Accepted; if this ever
  matters, the existence check must move above the Suspense boundary (e.g. into a route layout).

---

# D-040 — dotenv Is Always Loaded Quietly

Status:

ACCEPTED

Decision:

Every `dotenv` `config()` call in this project passes `quiet: true` (`prisma.config.ts` and
`prisma/seed.ts`). Generated artifacts are never produced by redirecting a command's stdout into a
file unless that command is known to write nothing but the artifact.

Reason:

`dotenv@17` prints an `◇ injected env (n) from <file> ...` banner to **stdout**, not stderr. The
initial migration was originally created with `prisma migrate diff ... --script > migration.sql`, so
the banner became the first line of the committed SQL. Postgres then rejected it with
`P3006/P3018: syntax error at or near "◇"` and the migration could not be applied.

Consequences:

- The corrupted line was removed from `prisma/migrations/20260911000000_init/migration.sql` and the
  migration applied cleanly; the banner cannot be re-captured.
- Any future file-generation step in this repo must either add `quiet: true` or write the file from
  Prisma's own output path instead of shell redirection.

---

# D-041 — Demo Credentials Are Configuration, Never Source Code

Status:

ACCEPTED

Context:

`prisma/seed.ts` hard-coded a demo email plus a fixed demo password. The repository is public and the
deployed Vercel application shares the seeded Neon database, so a committed demo password was a live,
reusable public credential rather than a harmless fixture. (The literal is deliberately not repeated
here.)

Decision:

- Source code, documentation and `.env.example` never contain a usable password.
- The seed reads `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from the environment. When
  `DEMO_USER_PASSWORD` is unset, the demo user is created with no credential account at all, so the
  demo data exists but cannot be signed into.
- The seed refuses to run when `NODE_ENV` or `VERCEL_ENV` is `production` unless `ALLOW_DEMO_SEED=true`,
  and it never creates a sign-in credential in production even then. Production owners register
  through `/signup`.
- The seed reuses the demo user row instead of deleting and recreating it, and resets that user's
  credential to match the current configuration, so a stale credential cannot survive a re-seed.
- `npm run security:revoke-demo-credential -- --apply` deletes the demo user's credential account and
  revokes its sessions, leaving clinic data untouched.

Reason:

Seeding must be able to load realistic demo data into a shared database without ever creating an
account that a stranger could sign into.

Consequences:

- Local development needs `DEMO_USER_PASSWORD` set explicitly to get a sign-in-capable demo account.
- Revoking a credential is not enough on its own; existing sessions must be revoked too, which the
  script does.
- The removed literal still exists in earlier git history; it is inert because the live credential was
  revoked, and removing it from history would require a history rewrite.
- Automated tests must never assert against a committed password.

---

# D-042 — Provider Requests Are Diagnosed, Not Guessed

Status:

ACCEPTED

Context:

Live AI qualification failed in production with "AI provider request failed with status 404" and the
failure message contained no more information than that. The URL construction was in fact correct —
`AI_BASE_URL=https://openrouter.ai/api/v1` resolved to `https://openrouter.ai/api/v1/chat/completions`,
which is OpenRouter's documented endpoint — but the configured model id, `openai/gpt-oss-20b:free`,
does not exist in OpenRouter's catalogue (only `openai/gpt-oss-20b` and `openai/gpt-oss-120b` exist;
the `:free` suffix is not used for those models). OpenRouter reports "no endpoints found for <model>"
as HTTP 404, which is indistinguishable from a bad URL unless the provider's own error is read.

Decision:

- `AI_BASE_URL` is the provider API root *including* its version prefix, and the client appends
  `/chat/completions` exactly once. The builder is idempotent: trailing slashes are trimmed and the
  suffix is not added twice, so a base URL that already ends with the endpoint cannot double the path.
- The client never appends a second `/v1` and never constructs a provider-specific path.
- Non-2xx responses are read into sanitized diagnostics: HTTP status, model, endpoint host and path,
  and the provider's own `code`, `type` and `message`. The body is size-capped, credential-shaped
  tokens are redacted, control characters are stripped and text is truncated before it is logged or
  persisted.
- Diagnostics never include the API key, `DATABASE_URL`, `BETTER_AUTH_SECRET` or lead content, and
  provider target descriptions drop the query string so a credential cannot ride along in a URL.
- A `400`/`422` that explicitly rejects `response_format` triggers exactly one retry without it; the
  prompt already requires JSON-only output and the parser tolerates prose and code fences.
- Request timeout is configurable through `AI_TIMEOUT_MS` (default 30000 ms, clamped 1000-120000), and
  the AI-invoking route segments declare `maxDuration = 60` so the serverless platform budget cannot
  abort a live provider call before the request timeout is reached.
- `npm run verify:ai` is the provider diagnostic. It asserts URL construction offline, checks the
  configured model against the provider's OpenAI-compatible `GET /models` list when live, can probe a
  real completion with `--probe`, and drives the real client against a loopback stub provider with
  `--self-test` (exact path, headers, body shape, 404 diagnostics, fallback and empty replies).

Reason:

A wrong model id and a wrong URL both surface as HTTP failures at request time. Without the provider's
own error and the exact resolved endpoint, the two are indistinguishable, and the difference between
them is a configuration change rather than a code change.

Consequences:

- Changing provider or model must be validated with `npm run verify:ai` before deploying; an invalid
  model id is caught in seconds instead of after a redeploy.
- The failure reason stored on `AI_ANALYSIS_FAILED` activity metadata is longer and more informative.
  It carries no secrets and no lead content.
- `AI_MODEL` must be an exact provider model id that the provider currently serves. The `:free` suffix
  is provider- and model-specific and must not be assumed.
- The lead-safety invariants are unchanged: a lead is persisted before AI runs, an AI failure never
  deletes a lead, retry stays available, and structured output is still Zod-validated.
- `maxDuration = 60` is the Vercel Hobby maximum. A plan with a longer limit may raise it, and
  `AI_TIMEOUT_MS` must remain below it.

---

# D-043 — OpenRouter Free Router Is The Initial Production Runtime Model

Status:

ACCEPTED

Context:

After the session 4 fix, production live AI was unblocked by pointing `AI_MODEL` at a model the
provider actually serves. The value chosen for production is `openrouter/free` — OpenRouter's
free-model router — rather than a specific `openai/gpt-oss-*` id. An earlier attempt with
`openrouter/free` had failed with a timeout, which was a request-budget problem rather than an invalid
model, and it was fixed by raising the timeout and declaring a longer serverless budget.

Decision:

- The initial production runtime model is OpenRouter's free-model router:
  `AI_MODE=live`, `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openrouter/free`.
- Production sets `AI_TIMEOUT_MS=50000`. The request timeout must always stay below the
  `maxDuration = 60` declared on the AI-invoking route segments (`/c/[clinicSlug]` for public
  submission and `/leads/[leadId]` for manual retry).
- `openrouter/free` is a router id, not a `:free` model suffix. It dispatches across OpenRouter's
  free-pool models, so latency varies and the model recorded on a `LeadAnalysis` is the configured
  router id rather than the specific upstream model that served the request.
- This is an initial, cost-controlled strategy, not a permanent commitment. It is a configuration
  choice: moving to a specific paid or self-hosted model means changing `AI_MODEL` (and optionally
  `AI_TIMEOUT_MS`) and re-running `npm run verify:ai`, with no application code changes.
- The provider-agnostic boundary stays intact: `lib/ai/client.ts` remains the only module that knows
  the provider shape, and nothing outside it hard-codes OpenRouter.

Reason:

Free routers keep the portfolio deployment running with no API spend, and `openrouter/free` is an id
OpenRouter actually serves — which is precisely what the session 4 failure was about. The
architecture already treats the runtime model as configuration, so a cost-controlled default does not
compromise the provider-agnostic design.

Consequences:

- Free-pool models can be slow and are rate limited, so a production lead may occasionally fail
  qualification and need a manual retry from the lead detail page. This is safe by design: the lead is
  always persisted before AI runs, and a failed analysis never deletes it.
- A failure is recorded on the lead's activity timeline as `AI_ANALYSIS_FAILED` with sanitized
  diagnostics (status, model, endpoint host/path, provider error) and no secrets or lead content.
- Choosing a faster or higher-quality model later is an environment-variable change plus
  `npm run verify:ai`, not an application change.

---

# D-044 — Shared Dental Scoring Model

Status: ACCEPTED (Session 8)

`lib/ai/scoring.ts` is the single source of truth for lead scoring:

- Component weights: urgency 25, appointment intent 20, treatment value potential 20,
  pain/need strength 15, payment readiness 10, responsiveness/completeness 10 (sum 100).
- Score range is clamped to 1–100; an all-UNKNOWN enquiry scores the floor, not zero.
- Priority bands: HOT ≥ 80, WARM ≥ 50, COLD < 50 (`priorityFromScore`).
- Follow-up timing (`followUpTiming`): EMERGENCY → IMMEDIATE/5 min, IMMEDIATE → 10 min,
  TODAY+HIGH intent → 15 min, TODAY → 60 min, HIGH intent → 120 min, THIS_WEEK/SOON → 240 min,
  FLEXIBLE → 1 business day, UNKNOWN → 2 business days.

Rationale: mock mode must be deterministic and testable, the live prompt must teach the same
weighting, and tests must assert both. One shared module prevents drift between modes.

Boundaries: the model performs business qualification only. Urgency means "how quickly should staff
respond", not clinical severity; painNeedLevel records the strength of the *stated* need; payment
readiness never punishes a patient for lacking insurance (NO_INSURANCE + READY scores within one
point of HAS_INSURANCE + READY and routes to a financing-first follow-up instead of a lower
priority). No protected characteristic is used anywhere in the model.

---

# D-045 — FollowUpTask Relation / Constraint Design

Status: ACCEPTED (Session 7, audited Session 8)

Follow-ups are a dedicated `FollowUpTask` model rather than overloading `LeadActivity`:
activities are an immutable log, tasks are mutable workflow state with `dueAt`, `status`,
`priority`, `source` and `completedAt`. Every task carries `clinicId` (tenant boundary) plus
indexes `(clinicId, status, dueAt)` and `(leadId, status)`.

The model intentionally has TWO foreign keys on the same column `leadId`:

- `follow_up_task_lead_fkey` → `lead.id` (via relation `"FollowUpTaskToLead"`)
- `follow_up_task_analysis_fkey` → `lead_analysis.leadId` (via relation
  `"FollowUpTaskToAnalysis"`; corrected in Session 9 — the original schema referenced
  `lead_analysis.id`, which can never be satisfied because `follow_up_task.leadId` stores the
  lead id; `lead_analysis.leadId` is `@unique` and is the correct referential target)

Both `map:` names are REQUIRED: Prisma/Postgres would otherwise derive the same constraint name
(`follow_up_task_leadId_fkey`) twice and fail validation. Do not "simplify" these away.

AI task idempotency (`upsertAiFollowUpTask`): an analysis run refreshes the single OPEN AI task
(dueAt/priority/description) instead of creating duplicates; if the existing AI task is COMPLETED
it is returned untouched — completed recommendations are never resurrected and retries never stack
new tasks; only a lead with no open/completed AI task gets a new one. AI tasks are titled
"AI recommendation: …" so staff always see them as advisory.

---

# D-046 — Email Alert Provider Abstraction

Status: ACCEPTED (Session 7, verified Session 8)

Outbound staff alerts live behind `lib/email/email.ts` (`sendEmail`), the only module that knows a
provider. `EMAIL_MODE=mock` (the default) resolves successfully without any network call so local
development and tests exercise the full workflow; `EMAIL_MODE=live` posts to the Resend REST API
with `RESEND_API_KEY`, and missing credentials fail with a typed error instead of a network call.
`sendEmail` never throws — it resolves `{ ok: false, error }` so an email outage can never break
lead capture, AI analysis, or task creation.

`lib/services/lead-alerts.ts` decides per lead: an alert fires when priority is HOT **or**
follow-up priority is IMMEDIATE. With no `ALERT_RECIPIENT_EMAIL` configured the alert is skipped
silently (alerts are enhancement, not core). Success and failure are recorded on the lead timeline
as `EMAIL_ALERT_SENT` / `EMAIL_ALERT_FAILED`. Alert content is operational only (patient name,
priority, score, treatment band, urgency, recommended action, CRM link, AI-review disclaimer) —
never the enquiry body, medical history, prices, or contact details.

Known limitation: `ALERT_RECIPIENT_EMAIL` is a single global mailbox. This matches the current
single-clinic deployment; per-clinic alert routing is future work and MUST be added before
multi-tenant alert delivery is advertised.

No patient reply is ever sent automatically; the draft reply remains review-only text.

---

# D-047 — Patient-Reported Insurance and Payment Preference (Public Form)

Status: ACCEPTED (Session 14)

Live production testing showed the AI could only infer insurance/payment readiness from free text
("I have insurance and can provide the details when contacted"), which is unreliable. The public
enquiry form therefore asks two OPTIONAL, structured questions:

- "Do you have dental insurance?" → `Lead.patientInsuranceStatus`
  (`PatientInsuranceStatus`: YES | NO | UNKNOWN)
- "How are you planning to pay?" → `Lead.paymentPreference`
  (`PaymentPreference`: INSURANCE | SELF_PAY | FINANCING | UNKNOWN)

Both columns live on `Lead`, not `LeadAnalysis`, because they are submitted by the patient rather
than derived by the AI. Both are `NOT NULL DEFAULT 'UNKNOWN'`, so existing production leads stay
valid with no backfill and the migration is purely additive.

Why new enums instead of reusing existing ones:

- `PatientInsuranceStatus` (YES/NO) is deliberately NOT the AI's `InsuranceStatus`
  (HAS_INSURANCE/NO_INSURANCE). One records what the patient said, the other what the AI concludes;
  collapsing them would make the UI unable to show the two side by side and would make it easy to
  present an unverified patient answer as an AI interpretation (or vice versa).
- `PaymentPreference` (how the patient expects to pay) is deliberately separate from
  `PaymentReadiness` (how ready the lead appears to move forward financially). These are different
  concepts and MUST NOT be conflated.

Patient-reported ≠ verified. `patientInsuranceStatus = YES` is never eligibility, benefits,
procedure-coverage, deductible or authorisation verification. The prompt forbids claiming any of
those, and the CRM labels the values "Patient input (unverified)".

Validation: `lib/validation/lead.ts` accepts only the supported enum values; an omitted, empty or
null answer becomes `UNKNOWN` server-side, so older form clients and integrations stay compatible.
Raw browser values are never trusted.

AI integration: the explicit answers are added to `LeadPromptInput` and rendered by
`buildLeadUserPrompt` as "Patient-reported answers from the public form (unverified)". The live
prompt instructs the model to treat them as STRONGER evidence than free-text inference — YES →
`insuranceStatus = HAS_INSURANCE`, NO → `NO_INSURANCE`, SELF_PAY → `paymentReadiness = READY`,
FINANCING/INSURANCE → `NEEDS_OPTIONS` — while still mapping FINANCING to `NEEDS_OPTIONS` rather than
to a penalty. Mock mode (`lib/ai/mock.ts`) applies the identical precedence so both modes agree.

Scoring: no weight changed (D-044 still holds). The explicit answers reach scoring only through
`insuranceStatus`/`paymentReadiness`, so urgency (25) plus appointment intent (20) remain the
dominant signals. Insurance is never required for a HOT lead (an uninsured, urgently self-paying
lead scores 81/HOT), and a patient requesting financing can never be pushed from HOT to COLD by
their payment preference alone.

---

# D-048 — The Public Submission Result Reflects Persistence, Not Downstream Steps

The public enquiry action reports the outcome of the ONE thing the visitor actually asked for:
storing the enquiry. Everything after persistence is best effort and can never change that result.

Two phases, deliberately:

1. **persist** — clinic resolution from the slug, duplicate check, `createPublicLead`. A failure here
   means nothing was stored, so the visitor may safely be told to try again (and the failure log
   carries `stage: "persist"`).
2. **post-persist** — AI qualification, the staff email alert and the environment lookup for the
   alert URL. Failures are logged with `stage: "post-persist"` plus the leadId, and recorded on the
   lead where possible (`AI_ANALYSIS_FAILED`) so staff can retry from the CRM. They never surface to
   the visitor, because the lead is already stored and the visitor is not the right person to fix an
   AI, email or environment problem.

Why this is a decision and not just a bug fix: `runLeadAnalysis` already returned a result instead of
throwing, but the action still wrapped every later step in the same try/catch, so any post-persistence
exception (an invalid `NEXT_PUBLIC_APP_URL` read for the alert link, a timeline write, a transaction
timeout) produced the generic failure message for a stored enquiry. The retry then only appeared to
"work" because duplicate detection returned the already-stored enquiry — the failure was invisible in
logs and looked like a flaky form.

Consequences:

- A visitor is never told an enquiry failed when it was stored, and is never told it succeeded when it
  was not. The pre-persistence phase keeps the existing safe generic error and the echoed form values.
- `lib/services/lead-analysis.ts` is now non-throwing on every branch: the `AI_ANALYSIS_STARTED`,
  `AI_ANALYSIS_COMPLETED` and `AI_ANALYSIS_FAILED` timeline markers are each best effort, so a
  timeline write can neither reject an already-persisted lead nor downgrade a stored analysis.
- `createPublicLead`'s interactive transaction declares `maxWait: 10_000` / `timeout: 20_000` instead
  of relying on Prisma's 2s/5s defaults, which a suspended Neon compute can exceed on the first
  enquiry of the day. Both values stay well inside the 60s serverless budget declared on the public
  route.
- The public form is uncontrolled and driven by `useActionState`; React 19 resets a form after every
  form action, including a failing one (react.dev/blog/2024/12/05/react-19), which reset the selects
  and the consent checkbox while already-mounted text inputs kept their updated `defaultValue`s. The
  form therefore tracks each new action result and bumps a version key so the echoed values are
  applied to freshly mounted fields, with `defaultChecked` for consent. The server action stays a
  Server Action used directly by the form, so progressive enhancement and server-side validation are
  unchanged.
- Regression coverage lives in `scripts/verify-e2e.mts` section 13: the reproduction is deterministic
  (an invalid `NEXT_PUBLIC_APP_URL` fails only after persistence) and no assertion needs a real AI or
  email provider.

---

# D-049 — Archive Is The Default Cleanup; Permanent Delete Is Owner-only And Cascade-backed

Status: ACCEPTED (Session 19)

Context:

A CRM needs a way to clear leads out of the working pipeline without destroying history, and
occasionally a genuinely destructive "remove this row and everything attached to it" action that must
be impossible to trigger by accident or by the wrong role. The existing model had only
`LeadStatus`, which is a sales stage (NEW → CONTACTED → APPOINTMENT_SET → WON/LOST) and therefore the
wrong place for "filed away": a lead can be LOST *and* archived, or WON *and* archived.

Decision:

1. **`Lead.archivedAt DateTime?` is the archive state**, orthogonal to `LeadStatus`. NULL means
   active; a timestamp means archived. The migration is additive (no backfill: existing rows are
   active), and the column is indexed as `(clinicId, archivedAt)` because every lead list, dashboard
   metric and open-follow-up query now carries that predicate.
2. **Archiving hides, it never deletes.** An archived lead keeps its `LeadAnalysis`, `FollowUpTask`
   rows, `LeadNote` rows and full `LeadActivity` history, and it keeps its `LeadStatus`. It is
   excluded only from the *views*: the default lead list, the dashboard metrics, the recent-leads
   panel, and the open follow-up queue. A dedicated `archived` filter (`archived` / `all`) makes the
   leads reachable, and the detail page shows an explicit ARCHIVED state with a restore action.
3. **Archive/restore are ordinary, clinic-scoped staff mutations** in
   `lib/services/lead-workflow.ts`, alongside `updateLeadStatus` and `addLeadNote`. The lead is
   resolved by lead id AND clinic id, so another clinic's lead is indistinguishable from a missing
   one, and the write itself is a guarded `updateMany` whose WHERE clause includes the current
   archive state — so a repeated archive/restore is a no-op instead of a duplicate timeline entry.
4. **Archive and restore are recorded on the activity timeline** through two new `ActivityType`
   values (`LEAD_ARCHIVED`, `LEAD_RESTORED`) added by the same forward migration, with the acting
   user attached. Permanent deletion records nothing: once the row (and its cascade) is gone there is
   no honest place to write, and inventing a posthumous audit entry would be fiction.
5. **Permanent deletion is OWNER-only, enforced twice, server-side.** `deleteLeadAction` checks the
   membership role resolved server-side by `requireClinicContext`, and `permanentlyDeleteLead`
   independently re-reads the OWNER membership from the `membership` table before deleting anything.
   A role supplied by a form field, an action argument or a cookie is never trusted. ADMIN and STAFF
   are rejected. The UI hides the destructive control from non-owners, but that is presentation only.
6. **Permanent deletion also requires an explicit typed confirmation**: the caller must send `DELETE`
   or the lead's exact name, compared server-side against the stored name. The confirmation value is
   never logged, and neither is any other field of the deleted lead.
7. **The delete is a single clinic-scoped `deleteMany`; dependents cascade in the database.**
   `lead_analysis`, `lead_note`, `lead_activity`, `follow_up_task` (both the lead FK and the analysis
   FK) already reference the lead with `ON DELETE CASCADE`. Those constraints are re-read from the
   live schema and asserted in `verify:e2e` section 14a *before* any delete runs, and section 14g
   then proves each dependent table reaches zero while sibling leads and other clinics keep their
   rows. No hand-written multi-table delete exists that could drift out of sync with the constraints.
8. **Archiving does not touch follow-up tasks.** It would be easy to cancel them, but cancelling is
   state loss; instead the queries that build the working views exclude tasks whose lead is archived,
   so restoring the lead restores its outstanding work with it.
9. **Duplicate-submission detection ignores archived leads.** Otherwise a patient whose old enquiry
   was archived could never submit a new one — the new enquiry would be matched to the archived lead
   and silently discarded.
10. **Scripts that write refuse to run outside development.** `npm run verify:e2e` and
    `scripts/db-identity.mts` compare a SHA-256 fingerprint of `DATABASE_URL` against the development
    fingerprint (`24ea81a95814`) and abort before the first query otherwise; the inherited production
    value (`46bfa2c59fb1`) is never accepted. Neither script ever prints the connection string.

Reason:

"Cleanup" and "destroy" are different operations with different risk, and collapsing them into one
button forces staff to choose between a cluttered working list and permanent data loss. A nullable
archive column is the smallest schema change that separates the two, keeps the audit trail intact,
and leaves `LeadStatus` doing the job it was defined for. For the irreversible action, defense in
depth beats a single check: role resolution at the action boundary *and* against the database, plus a
consent value derived from the row being destroyed.

Consequences:

- No large red delete button sits in the normal lead workflow: permanent deletion lives behind a
  collapsed "More actions → Delete permanently…" disclosure that names the analysis, tasks, notes and
  activity history it will destroy, and states that it cannot be undone.
- An archived lead is **not** a permission boundary. It stays fully readable, status-changeable,
  note-able and restorable by its own clinic; archive is a view state, not access control.
- Restoring is the documented recovery path for an accidental archive. There is no recovery path for
  a permanent delete, by design.
- Production must apply `20260914120000_lead_archive_restore` before the archive UI is used there.
  The migration is additive (new nullable column, new enum values, new index), so applying it
  changes no existing behaviour, but the actions do not exist until the column and enum values do.
- A "who deleted this lead?" audit answer does not exist by construction. If that is ever required,
  it must be built as a separate, non-PII deletion log — not by writing activity rows that are about
  to be cascaded away.
- `listClinicLeads`, `getDashboardData`, `listClinicFollowUps` and `findRecentDuplicateLead` now all
  carry an archive predicate. Any future lead query that intentionally wants archived rows (an
  admin/export view, for example) has to opt in explicitly.

---

# DECISION CHANGE RULE

Do not modify accepted decisions casually.

If implementation reveals that an accepted decision cannot work:

1. Document the technical problem.
2. Make the smallest reasonable replacement decision.
3. Add a new decision entry.
4. Update affected architecture/tasks.
5. Continue implementation.

Do not silently change the architecture.
# AI Dental Lead CRM

AI Dental Lead CRM is a full-stack AI-powered lead qualification and customer relationship management application designed for dental clinics.

It captures prospective patients from a public inquiry form, stores the leads in a clinic-scoped CRM, analyzes them with AI, assigns lead scores and priorities, recommends follow-up actions, and generates draft responses for clinic staff.

The project is designed as a portfolio-ready example of an AI-powered business application.

---

# CORE WORKFLOW

Public Dental Lead Form

→ Lead Stored

→ AI Qualification

→ Lead Score

→ Priority

→ Urgency

→ Service Category

→ Recommended Action

→ Draft Response

→ CRM Dashboard

→ Staff Follow-up

→ Appointment Set / Won / Lost

---

# EXAMPLE

A visitor submits:

"I broke a tooth today and need an appointment as soon as possible."

AI analysis could return:

Lead Score:

96/100

Priority:

HOT

Urgency:

IMMEDIATE

Intent:

HIGH

Service:

EMERGENCY

Summary:

Potential patient reports a broken tooth and is seeking an urgent appointment.

Recommended Action:

Call within 5 minutes and offer the earliest available appointment.

Draft Reply:

A professional response for clinic staff to review before sending.

---

# IMPORTANT PRODUCT BOUNDARY

This application is a lead-management CRM.

It is not intended to:

- diagnose medical conditions
- prescribe treatment
- replace a dentist
- act as an electronic health record
- store detailed patient clinical information

AI is used for lead qualification and communication assistance.

---

# FEATURES

MVP features include:

- Public clinic lead capture
- Dental service selection
- Lead urgency capture
- PostgreSQL lead persistence
- Authentication
- Multi-clinic workspace isolation
- AI lead qualification
- 0–100 lead scoring
- HOT / WARM / COLD priority
- Urgency classification
- Intent classification
- Service categorization
- AI lead summaries
- Recommended staff actions
- Draft response generation
- CRM dashboard
- Lead list
- Lead filters
- Lead detail pages
- Lead status workflow
- Internal staff notes
- Activity timeline
- AI retry functionality
- Mock AI development mode
- Provider-agnostic live AI mode
- Responsive interface
- Vercel deployment

---

# TECH STACK

Frontend:

- Next.js
- React
- TypeScript
- Tailwind CSS

Backend:

- Next.js Server Components
- Route Handlers / Server Actions where appropriate

Database:

- PostgreSQL
- Neon

ORM:

- Prisma

Authentication:

- Better Auth

Validation:

- Zod

AI:

- Provider-agnostic OpenAI-compatible runtime API

Deployment:

- Vercel

Development Coding Agent:

- DeepSeek V4 Flash through Freebuff

---

# PROJECT DOCUMENTATION

The repository uses several persistent context files to support AI-assisted development.

## AI_CONTEXT.md

Defines:

- project purpose
- technical rules
- safety requirements
- coding behavior
- continuous execution rules

DeepSeek should read this file at the beginning of every coding session.

---

## TASKS.md

Contains the authoritative MVP implementation queue.

DeepSeek should:

1. Find the first eligible TODO task.
2. Mark it IN_PROGRESS.
3. Implement it.
4. Verify it.
5. Mark it DONE.
6. Update project progress.
7. Immediately begin the next eligible task.

DeepSeek should not stop after finishing a single task.

---

## ARCHITECTURE.md

Defines:

- system architecture
- project structure
- database model
- tenant security
- AI integration
- server responsibilities

---

## DECISIONS.md

Records accepted project decisions.

This prevents future coding sessions from repeatedly changing the stack or architecture.

---

# PROJECT SETUP

## 1. Clone the Repository

Example:

git clone <repository-url>

cd <project-folder>

---

## 2. Install Dependencies

Run:

npm install

---

## 3. Create Local Environment File

Copy:

.env.example

to:

.env.local

Do not put real secrets inside .env.example.

Your local .env.local contains the real development credentials.

---

# DATABASE SETUP

Create a Neon PostgreSQL database.

Copy the Neon connection string.

Set:

DATABASE_URL

inside:

.env.local

Example structure:

DATABASE_URL="postgresql://..."

Never commit the real database URL.

---

# PRISMA

This project uses Prisma 7. Prisma 7 requires a driver adapter and a Prisma config file:

- prisma.config.ts holds the schema path, migration path, seed command, and database URL.
- Postgres access uses @prisma/adapter-pg (configured in lib/db/prisma.ts).
- The generated client is written to lib/generated/prisma and is not committed.

After the Prisma schema is configured:

Run:

npx prisma format

Then:

npx prisma validate

Then:

npx prisma generate

Then create/apply the development migration:

npx prisma migrate dev

`npm run build` runs `prisma generate` first, so a production build always has a fresh client.

Note: `prisma.config.ts` and `prisma/seed.ts` load dotenv with `quiet: true`. dotenv prints an
"injected env" banner to stdout, so redirecting Prisma or tsx output straight into a generated file
can inject that banner into the file (this previously corrupted the initial migration).

---

# SEED DATA

After the migration has been applied, load the demo clinic and sample leads:

npm run db:seed

The seed creates a demo clinic whose public enquiry form is available at:

/c/bright-smile-dental

It also creates a demo staff account. The seed prints the demo email and password when it runs;
those credentials are for local development only and must never be used in production.

Seeding is repeatable: re-running it replaces the demo clinic and demo user.

---

# VERIFY END TO END

With a migrated and seeded database and `AI_MODE=mock`:

npm run verify:e2e

That script drives the same service functions the server actions call and checks the whole core
workflow against the real database: public lead submission, AI qualification, appearance in the CRM,
lead detail with the AI recommendation, status change, internal note, activity timeline, tenant
isolation between clinics, and idempotent AI retry. It cleans up the records it creates.

---

# AUTHENTICATION

Set:

BETTER_AUTH_SECRET

BETTER_AUTH_URL

For local development:

BETTER_AUTH_URL="http://localhost:3000"

Generate a strong secret for:

BETTER_AUTH_SECRET

Never commit the real secret.

---

# AI DEVELOPMENT MODE

The recommended mode while building the application is:

AI_MODE="mock"

This allows the CRM to generate deterministic test analysis without spending AI API credits.

No external AI connection is required while AI_MODE is mock.

---

# LIVE AI MODE

To enable runtime AI:

AI_MODE="live"

Then configure:

AI_BASE_URL

AI_API_KEY

AI_MODEL

Example:

AI_BASE_URL="https://provider.example/v1"

AI_API_KEY="your-real-secret"

AI_MODEL="provider-model-name"

The exact values depend on the AI provider selected.

Do not hard-code a provider into unrelated application code.

---

# RUN DEVELOPMENT SERVER

Run:

npm run dev

Then open:

http://localhost:3000

---

# IMPORTANT ROUTES

Public lead form:

/c/[clinicSlug]

Example:

/c/bright-smile-dental

Protected CRM:

/dashboard

Lead list:

/leads

Lead detail:

/leads/[leadId]

Authentication:

/login

Actual routes may be adjusted slightly during implementation if required.

---

# DEVELOPMENT VERIFICATION

Use:

npm run lint

TypeScript:

npx tsc --noEmit

Production build:

npm run build

During development, use focused verification where practical instead of repeatedly running the full build after tiny changes.

Before deployment, the full quality gate should pass.

---

# DEEPSEEK / FREEBUFF WORKFLOW

The project is designed for one-hour Freebuff DeepSeek V4 Flash sessions.

At the beginning of every new session, give DeepSeek this prompt:

You are continuing development of the AI Dental Lead CRM.

Work autonomously for the entire available coding session.

Before making changes:

1. Read AI_CONTEXT.md completely.
2. Read TASKS.md completely.
3. Read ARCHITECTURE.md completely.
4. Read DECISIONS.md completely.
5. Inspect the current repository.
6. Inspect git status.

TASKS.md is the authoritative execution queue.

Find the first TODO task whose dependencies are satisfied.

For every task:

- mark it IN_PROGRESS
- implement only its defined scope
- follow AI_CONTEXT.md
- follow ARCHITECTURE.md
- respect DECISIONS.md
- run the appropriate verification
- fix errors caused by your changes
- confirm acceptance criteria
- mark it DONE
- update CURRENT EXECUTION in TASKS.md
- immediately begin the next eligible TODO task

DO NOT stop after completing one task.

DO NOT ask whether you should continue.

Continue sequentially through TASKS.md for as much of the coding session as possible.

If a task is blocked:

1. Mark it BLOCKED.
2. Record the exact blocker.
3. Record the minimum manual action required.
4. Continue with another independent unblocked task.

Do not perform unrelated refactors.

Do not redesign working architecture without a concrete technical reason.

Do not expose or commit secrets.

Before the session ends, make sure TASKS.md accurately represents the current repository state.

Begin immediately with the first eligible task.

---

# WHY TASKS.md MUST BE UPDATED

Each Freebuff coding session may start with a new AI context.

TASKS.md preserves:

- current phase
- current task
- completed tasks
- blockers
- next task
- verification status

This allows the next DeepSeek session to continue without the user manually explaining previous work.

---

# DEPLOYMENT

The intended production platform is Vercel.

Before deploying:

Run:

npm run lint

npx tsc --noEmit

npm run build

All should pass.

---

# VERCEL ENVIRONMENT VARIABLES

Do not upload .env.local.

Instead:

Open the Vercel project.

Go to:

Settings

→ Environment Variables

Add the real values required by the application.

Typical variables include:

DATABASE_URL

NEXT_PUBLIC_APP_URL

BETTER_AUTH_SECRET

BETTER_AUTH_URL

AI_MODE

AI_BASE_URL

AI_API_KEY

AI_MODEL

Production URLs should use the real Vercel domain rather than localhost.

---

# ENVIRONMENT FILE RULES

.env.example

Safe template committed to Git.

.env.local

Real local secrets.

Do not commit.

Vercel Environment Variables

Real production secrets.

The deployed application reads these from Vercel.

---

# MVP STATUS

Development progress is tracked exclusively in:

TASKS.md

Do not rely on this README for live completion status.

---

# MVP DEFINITION OF DONE

The MVP should not be considered complete until:

- authentication works
- clinic tenancy works
- public lead capture works
- database persistence works
- AI qualification works
- mock AI works
- live AI is configurable
- dashboard works
- lead list works
- lead detail works
- statuses work
- notes work
- activity timeline works
- AI retry works
- mobile layout works
- tenant security has been reviewed
- lint passes
- TypeScript passes
- production build passes
- deployment configuration is ready
- documentation reflects the final implementation

---

# FUTURE FEATURES

Possible post-MVP features include:

- email automation
- Resend integration
- SMS integration
- appointment scheduling
- Google Calendar
- automated follow-up sequences
- pipeline analytics
- conversion analytics
- lead source attribution
- clinic branding controls
- subscription billing
- additional AI workflows

These should not distract from completing the initial MVP.

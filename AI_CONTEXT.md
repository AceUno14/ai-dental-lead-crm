# AI Dental Lead CRM — AI Context

## PROJECT NAME

AI Dental Lead CRM

## PROJECT PURPOSE

Build a production-style AI-powered lead qualification CRM for dental clinics.

The application captures prospective dental leads, stores them in a clinic-scoped CRM, analyzes them using AI, assigns a lead score and priority, recommends the next action, and generates a draft reply for dental staff to review.

The product is a lead-management and sales-support system.

It is NOT a medical diagnosis system.

Do not build features that diagnose dental conditions, prescribe treatment, or replace a licensed dental professional.

---

## CORE WORKFLOW

Public Dental Lead Form
→ Lead Created
→ PostgreSQL Database
→ AI Qualification
→ Structured AI Analysis
→ Lead Score
→ Priority
→ Urgency
→ Treatment Interest / Value
→ Pain / Need
→ Appointment Intent
→ Patient-reported Insurance / Payment Preference (explicit form answers)
→ Insurance / Payment Readiness (AI interpretation)
→ Recommended Action
→ Follow-up Task (AI-recommended, idempotent)
→ Email Alert (HOT / IMMEDIATE, best-effort)
→ Staff Dashboard
→ Human Review
→ Contact Lead
→ Appointment Set / Won / Lost

Failure invariants: the lead is persisted FIRST; AI, follow-up task and email failures are
recorded on the timeline and never lose a lead; nothing is sent to a patient automatically.

Example:

A visitor submits:

"I broke a tooth today and need an appointment as soon as possible."

The application may produce:

Lead Score: 96/100

Priority: HOT

Urgency: IMMEDIATE

Intent: HIGH

Service Category: EMERGENCY

Summary:
Potential patient reports a broken tooth and is looking for an urgent appointment.

Recommended Action:
Call within 5 minutes and offer the earliest available appointment.

Draft Reply:
Generate a professional response that clinic staff can review before sending.

---

## MVP GOALS

The MVP must allow a dental clinic to:

1. Capture leads from a public form.
2. Store leads in PostgreSQL.
3. Separate data by dental clinic/workspace.
4. Authenticate clinic staff.
5. Automatically analyze new leads using AI.
6. Score leads from 0 to 100.
7. Categorize leads as HOT, WARM, or COLD.
8. Determine lead urgency.
9. Identify likely dental service interest.
10. Determine lead intent.
11. Generate a concise summary.
12. Generate a recommended follow-up action.
13. Generate a draft reply.
14. View leads inside a protected CRM dashboard.
15. Open individual lead details.
16. Change lead status.
17. Add internal notes.
18. View an activity timeline.
19. Retry failed AI analysis.
20. Run locally.
21. Deploy to Vercel.

---

## MVP BOUNDARIES

Do NOT add these unless every MVP task is complete:

- Stripe
- subscriptions
- billing
- SMS sending
- WhatsApp integration
- full appointment scheduling
- Google Calendar integration
- advanced analytics
- complicated permission systems
- native mobile application
- AI chatbot widget
- electronic health records
- patient medical charts
- insurance verification
- medical documents
- diagnosis
- treatment recommendations
- unnecessary microservices
- unnecessary background infrastructure

Keep the MVP focused on:

Lead Capture
→ AI Qualification
→ CRM Management
→ Follow-up

---

## TECH STACK

Use:

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- PostgreSQL
- Neon PostgreSQL
- Prisma ORM
- Better Auth
- Zod
- Vercel
- OpenAI-compatible runtime AI API

Prefer Server Components where appropriate.

Use Client Components only when interactivity requires them.

Do not replace the selected stack without a genuine technical blocker.

---

## CODING AI

Primary coding agent:

DeepSeek V4 Flash through Freebuff.

DeepSeek is the development agent.

Freebuff is NOT assumed to be the runtime AI provider used by the deployed application.

---

## RUNTIME AI

The application must use a provider-agnostic AI layer.

Use these environment variables:

AI_MODE
AI_BASE_URL
AI_API_KEY
AI_MODEL

Supported modes:

AI_MODE=mock

AI_MODE=live

When AI_MODE=mock:

Use deterministic development data.

Do not make an external AI API call.

When AI_MODE=live:

Use AI_BASE_URL, AI_API_KEY, and AI_MODEL.

Keep provider-specific code inside the AI service layer.

Do not hard-code DeepSeek, OpenAI, OpenRouter, or another provider throughout the application.

---

## AI STRUCTURED OUTPUT

The AI must return structured data containing:

leadScore  (1-100)

priority  (HOT/WARM/COLD)

urgency  (EMERGENCY/IMMEDIATE/TODAY/THIS_WEEK/SOON/FLEXIBLE/UNKNOWN — "how fast should staff respond?")

intent  (HIGH/MEDIUM/LOW/UNKNOWN — appointment intent)

serviceCategory  (treatment interest, incl. CROWNS/VENEERS)

treatmentValuePotential  (LOW/MEDIUM/HIGH/PREMIUM/UNKNOWN — business value band, never a price)

painNeedLevel  (HIGH/MEDIUM/LOW/UNKNOWN — strength of stated need, not a diagnosis)

insuranceStatus  (HAS_INSURANCE/NO_INSURANCE/UNKNOWN — never guessed)

paymentReadiness  (READY/NEEDS_OPTIONS/PRICE_SENSITIVE/UNKNOWN)

The AI also receives two patient-reported inputs that are NOT AI output and are stored on the lead:

patientInsuranceStatus  (YES/NO/UNKNOWN — the patient's own answer, unverified)

paymentPreference  (INSURANCE/SELF_PAY/FINANCING/UNKNOWN — how the patient expects to pay)

An explicit answer is stronger evidence than free-text inference (YES → HAS_INSURANCE,
NO → NO_INSURANCE, SELF_PAY → READY, FINANCING/INSURANCE → NEEDS_OPTIONS), but it never verifies
eligibility, benefits, coverage, deductibles or authorisation. Payment preference is a different
concept from paymentReadiness and the two are shown separately in the CRM.

followUpPriority  (IMMEDIATE/HIGH/NORMAL/LOW)

recommendedFollowUpMinutes  (5-4320)

summary

recommendedAction

draftReply

Scoring weights and bands are defined in lib/ai/scoring.ts (see DECISIONS.md D-044).
A patient is never penalised for lacking insurance; lack of insurance changes the follow-up
strategy (financing information), not the priority.

Example:

{
"leadScore": 94,
"priority": "HOT",
"urgency": "IMMEDIATE",
"intent": "HIGH",
"serviceCategory": "EMERGENCY",
"summary": "Potential patient reports a broken tooth and wants an urgent appointment.",
"recommendedAction": "Call within 5 minutes and offer the earliest available appointment.",
"draftReply": "Hi Sarah, thanks for contacting us. We would be happy to help you find the earliest available appointment."
}

Validate AI responses using Zod before saving them.

Never trust raw AI output.

If AI analysis fails:

1. Keep the Lead.
2. Do not delete the submission.
3. Record the failure.
4. Allow staff to retry AI analysis.
5. Do not expose internal AI errors to public users.

---

## LEAD SCORE

Score range:

0 to 100

Recommended categories:

80–100 = HOT

50–79 = WARM

0–49 = COLD

Possible scoring factors:

- urgency
- clear appointment intent
- specific service interest
- requested timeline
- willingness to be contacted
- clarity of inquiry

Do not infer protected characteristics.

Do not diagnose medical conditions.

---

## PRIORITY VALUES

HOT

WARM

COLD

---

## URGENCY VALUES

IMMEDIATE

TODAY

THIS_WEEK

FLEXIBLE

UNKNOWN

---

## INTENT VALUES

HIGH

MEDIUM

LOW

UNKNOWN

---

## SERVICE CATEGORIES

EMERGENCY

GENERAL_DENTISTRY

CLEANING

COSMETIC

IMPLANTS

ORTHODONTICS

ROOT_CANAL

EXTRACTION

WHITENING

DENTURES

OTHER

UNKNOWN

---

## LEAD STATUSES

NEW

CONTACTED

APPOINTMENT_SET

WON

LOST

---

## MEMBERSHIP ROLES

OWNER

ADMIN

STAFF

OWNER:
Full clinic access.

ADMIN:
Manage leads and normal clinic CRM operations.

STAFF:
View and update clinic leads.

Do not build an unnecessarily complicated permissions engine.

---

## CORE DATA ENTITIES

Clinic

User

Membership

Lead

LeadAnalysis

LeadActivity

LeadNote

---

## MULTI-TENANCY

Clinic is the tenant boundary.

Every protected clinic resource must be scoped to clinicId.

Never trust a clinicId sent from the browser as authorization.

Resolve the authenticated user's authorized clinic server-side.

Every database operation involving clinic data must enforce workspace isolation.

Clinic A must never be able to access Clinic B records.

---

## PUBLIC LEAD FORM

Preferred route:

/c/[clinicSlug]

Example:

/c/bright-smile-dental

Collect:

- Name
- Email
- Phone
- Service Interest
- Preferred Contact Method
- Urgency
- Do you have dental insurance? (optional; YES / NO / Not sure)
- How are you planning to pay? (optional; Insurance / Self-pay / Financing / Not sure)
- Message
- Consent

The two insurance/payment questions are OPTIONAL and patient-reported. They are stored on Lead as
`patientInsuranceStatus` and `paymentPreference` and are deliberately separate from the AI's
`insuranceStatus` / `paymentReadiness`. Nothing about coverage is verified, and the AI must not
claim it is. See DECISIONS.md D-047.

Do not collect unnecessary medical history.

---

## DASHBOARD

Dashboard should show useful sales information.

Recommended metrics:

- Total Leads
- New Leads
- Hot Leads
- Appointments Set
- Recent Leads

Lead list should display:

- Name
- Service
- Score
- Priority
- Urgency
- Status
- Created Date

Support basic filtering.

Do not build advanced business intelligence during the MVP.

---

## LEAD DETAIL PAGE

Display:

- Name
- Email
- Phone
- Original Inquiry
- Service Interest
- Status
- Lead Score
- Priority
- Urgency
- Intent
- Service Category
- AI Summary
- Recommended Action
- Draft Reply
- Internal Notes
- Activity Timeline

Actions:

- Change lead status
- Add note
- Retry AI analysis

---

## HUMAN REVIEW

AI-generated responses are suggestions.

Do not automatically send AI-generated messages in the MVP.

Staff must review generated content.

Clearly label AI-generated content.

---

## ACTIVITY TYPES

Recommended activity types:

LEAD_CREATED

AI_ANALYSIS_STARTED

AI_ANALYSIS_COMPLETED

AI_ANALYSIS_FAILED

STATUS_CHANGED

NOTE_ADDED

CONTACT_ATTEMPTED

APPOINTMENT_SET

LEAD_WON

LEAD_LOST

FOLLOW_UP_CREATED

FOLLOW_UP_COMPLETED

EMAIL_ALERT_SENT

EMAIL_ALERT_FAILED

## FOLLOW-UP TASKS

AI qualification upserts ONE open AI-sourced FollowUpTask per lead (idempotent on retries;
completed AI tasks are never resurrected). Staff can mark completed, cancel, or reopen. All task
queries are clinic-scoped server-side. See DECISIONS.md D-045.

## EMAIL ALERTS (OPTIONAL)

Environment variables (placeholders only in .env.example):

EMAIL_MODE  (mock = default, no network; live = Resend)

RESEND_API_KEY  (live mode only)

ALERT_FROM_EMAIL  (optional display sender)

ALERT_RECIPIENT_EMAIL  (clinic staff mailbox; unset = alerts skipped)

Alerts fire for HOT leads and/or IMMEDIATE follow-up priority. Email failure never fails lead
capture, analysis, or task creation; results are recorded as EMAIL_ALERT_SENT/FAILED.

---

## DEVELOPMENT PRINCIPLES

Prefer:

- simple implementations
- small components
- correct TypeScript
- reusable business logic
- server-side authorization
- clear naming
- minimal dependencies
- maintainable architecture

Avoid:

- giant files
- unnecessary abstractions
- premature optimization
- speculative features
- unrelated refactors
- duplicated business logic
- hard-coded credentials

---

## SECURITY

Never commit real credentials.

Never put secrets inside:

- README.md
- AI_CONTEXT.md
- TASKS.md
- ARCHITECTURE.md
- DECISIONS.md
- source code
- .env.example

Real development secrets belong in:

.env.local

Production secrets belong in:

Vercel Environment Variables

.env.local must stay ignored by git.

---

## PRIVACY

Treat lead contact information as private data.

Avoid unnecessary logging of:

- phone numbers
- emails
- complete lead messages

Do not claim the application is HIPAA compliant unless this has actually been established through appropriate technical and organizational measures.

This MVP is a lead-management CRM.

It is not an electronic health record.

---

## ERROR HANDLING

Do not expose:

- API keys
- database credentials
- internal stack traces
- raw provider responses containing sensitive data

AI failure must not prevent successful lead persistence.

---

## UI DIRECTION

The interface should feel like a premium modern dental business application.

Prefer:

- professional design
- clean spacing
- light surfaces
- strong typography
- subtle borders
- readable dashboard
- responsive layouts
- accessible forms

Avoid:

- futuristic AI graphics
- excessive gradients
- gaming design
- excessive animation
- crypto-style design
- unnecessary visual clutter

---

## CODE ORGANIZATION

Preferred logical structure:

app/

components/

lib/

lib/db/

lib/auth/

lib/ai/

lib/services/

lib/validation/

prisma/

types/

Do not create unnecessary empty directories.

---

## DATABASE RULES

Use Prisma.

After Prisma schema changes:

1. Run Prisma format.
2. Validate schema.
3. Generate Prisma Client.
4. Create migrations when database access is available.
5. Verify affected functionality.

Do not manually modify production database structure.

---

## VERIFICATION

Do not waste large portions of a Freebuff session repeatedly running full builds after tiny changes.

Use focused verification during implementation.

After meaningful batches use:

npm run lint

npx tsc --noEmit

Before major milestones and deployment use:

npm run build

Do not mark a task DONE when its relevant verification fails because of that task.

---

# CONTINUOUS TASK EXECUTION SYSTEM

TASKS.md is the authoritative execution queue.

At the beginning of EVERY coding session:

1. Read AI_CONTEXT.md completely.
2. Read TASKS.md completely.
3. Read ARCHITECTURE.md.
4. Read DECISIONS.md.
5. Inspect the repository.
6. Inspect git status.
7. Find the first eligible TODO task.

For EVERY task:

1. Confirm dependencies are DONE.
2. Change status to IN_PROGRESS.
3. Implement the defined scope.
4. Do not perform unrelated refactors.
5. Run appropriate verification.
6. Fix errors caused by the implementation.
7. Confirm acceptance criteria.
8. Change task status to DONE.
9. Update CURRENT EXECUTION in TASKS.md.
10. Add concise implementation notes when useful.
11. Immediately begin the next eligible TODO task.

DO NOT STOP AFTER ONE TASK.

Do not ask:

"Would you like me to continue?"

"Should I continue?"

"Should I start the next task?"

"Would you like me to implement this?"

Continue automatically.

Use as much of the available Freebuff coding session as possible.

---

## BLOCKED TASK BEHAVIOR

A task may genuinely require:

- DATABASE_URL
- API credential
- Vercel authorization
- Neon setup
- external account action
- important user business decision

If blocked:

1. Mark it BLOCKED.
2. Write the exact blocker in TASKS.md.
3. Write the minimum user action required.
4. Do not keep retrying the same impossible operation.
5. Continue with another independent TODO task.

One blocked task must not stop the entire coding session.

---

## COMPLETED TASK RULE

Do not rewrite completed functionality merely because another implementation is possible.

If a genuine defect is found:

1. Make the smallest necessary correction.
2. Verify the fix.
3. Record an implementation note if important.
4. Continue executing TASKS.md.

---

## SESSION CONTEXT PRESERVATION

Before stopping for any reason, update TASKS.md.

It must accurately contain:

Current Phase

Current Task

Last Completed Task

Blocked Tasks

Next Eligible Task

Last Verification

If a task is partially implemented, leave it IN_PROGRESS and add a concise note describing exactly what remains.

Do not make the next DeepSeek session guess.

---

## AUTONOMOUS SESSION RULE

DeepSeek should operate as an autonomous coding agent.

The user should normally need to provide only one master prompt when starting a new one-hour Freebuff session.

Continue executing TASKS.md until:

- the session ends
- the MVP is complete
- or all remaining tasks are genuinely blocked

Spend the majority of the session implementing, testing, fixing, and progressing through tasks instead of explaining what you intend to do.

---

## SOURCE OF TRUTH PRIORITY

If instructions conflict, follow:

1. Current explicit user instruction
2. AI_CONTEXT.md
3. TASKS.md
4. ARCHITECTURE.md
5. DECISIONS.md
6. Existing implementation

Investigate documentation/repository inconsistencies before destructive changes.

---

## MVP DEFINITION OF DONE

MVP is complete when:

- application runs locally
- authentication works
- clinic membership protection works
- public lead form works
- leads persist to PostgreSQL
- mock AI analysis works
- live AI mode is configurable
- structured AI validation works
- CRM dashboard works
- lead list works
- lead detail works
- statuses work
- notes work
- activity timeline works
- retry analysis works
- responsive design works
- tenant isolation has been reviewed
- lint passes
- TypeScript passes
- production build passes
- environment configuration is documented
- Vercel deployment is ready
- README is accurate

---

# FINAL RULE

TASKS.md drives development.

WHEN A TASK IS COMPLETE:

UPDATE TASKS.md AND IMMEDIATELY START THE NEXT ELIGIBLE TASK.

DO NOT END THE CODING SESSION JUST BECAUSE ONE TASK WAS COMPLETED.

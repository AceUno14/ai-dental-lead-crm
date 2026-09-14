# AI Dental Lead CRM — Architecture

## PURPOSE

This document defines the technical architecture for the AI Dental Lead CRM MVP.

The application should remain simple enough for fast AI-assisted development while using patterns appropriate for a portfolio-quality full-stack application.

---

# SYSTEM FLOW

Public Dental Lead Form

→ Next.js Server

→ Zod Validation

→ Resolve Clinic

→ PostgreSQL

→ Create Lead  (persistence ALWAYS happens first)

→ AI Qualification

→ Validate Structured AI Output

→ Save LeadAnalysis (dental qualification fields)

→ Scoring: 1-100 + HOT/WARM/COLD

→ Recommended Action

→ Follow-up Task (AI-recommended, idempotent)

→ Email Alert (HOT / IMMEDIATE, best-effort)

→ Protected CRM

→ Human Staff Review

→ Follow-up

→ Appointment / Won / Lost

FAILURE ISOLATION (mandatory invariants):

- Lead persistence NEVER depends on AI, tasks, or email succeeding.
- AI failure: lead remains, AI_ANALYSIS_FAILED recorded, staff can retry.
- Follow-up task failure: lead AND analysis remain, failure logged.
- Email failure: lead, analysis and task all remain, EMAIL_ALERT_FAILED recorded.
- Nothing is ever sent to a patient automatically.

---

# TECHNOLOGY

Framework:

Next.js App Router

Language:

TypeScript

UI:

React + Tailwind CSS

Database:

PostgreSQL

Database Provider:

Neon

ORM:

Prisma

Authentication:

Better Auth

Validation:

Zod

Runtime AI:

OpenAI-compatible provider abstraction

Deployment:

Vercel

---

# DEPLOYMENT ARCHITECTURE

Use one full-stack Next.js repository.

Browser

→ Vercel / Next.js

→ Neon PostgreSQL

→ External AI Provider

Do not create separate frontend and backend repositories for the MVP.

---

# RECOMMENDED PROJECT STRUCTURE

app/
(auth)/
(dashboard)/
api/
c/

components/
ui/
dashboard/
leads/
forms/

lib/
ai/
auth/
db/
services/
validation/

prisma/

types/

Only create directories when they are needed.

---

# ROUTES

Public:

/

Optional portfolio/demo landing page.

/login

Authentication.

/c/[clinicSlug]

Public dental lead form.

Protected:

/dashboard

CRM overview.

/leads

Lead list.

/leads/[leadId]

Lead detail page.

---

# PUBLIC LEAD SUBMISSION

Input:

clinicSlug

name

email

phone

serviceInterest

preferredContactMethod

urgency

patientInsuranceStatus  (optional; missing/invalid -> UNKNOWN)

paymentPreference  (optional; missing/invalid -> UNKNOWN)

message

consent

Server workflow:

1. Receive request.
2. Validate with Zod.
3. Resolve Clinic using clinicSlug.
4. Reject invalid clinic safely.
5. Create Lead.
6. Create LEAD_CREATED activity.
7. Trigger AI qualification.
8. Return safe response.

Never trust a browser-provided clinicId as authorization or tenant identity.

---

# DATABASE MODEL

## Clinic

Represents one dental clinic/workspace.

Suggested fields:

id

name

slug

createdAt

updatedAt

Relationships:

memberships

leads

---

## User

Authenticated CRM user.

Authentication-specific fields should follow Better Auth requirements.

Relationships:

memberships

notes authored

activities where useful

---

## Membership

Connects users to clinics.

Suggested fields:

id

userId

clinicId

role

createdAt

updatedAt

Unique constraint:

userId + clinicId

Roles:

OWNER

ADMIN

STAFF

---

## Lead

Represents a prospective dental customer.

Suggested fields:

id

clinicId

name

email

phone

serviceInterest

preferredContactMethod

submittedUrgency

message

consent

patientInsuranceStatus  (PatientInsuranceStatus, default UNKNOWN — patient-reported)

paymentPreference  (PaymentPreference, default UNKNOWN — patient-reported)

status

createdAt

updatedAt

Statuses:

NEW

CONTACTED

APPOINTMENT_SET

WON

LOST

Recommended indexes:

clinicId

clinicId + createdAt

clinicId + status

---

## LeadAnalysis

Stores structured AI qualification.

Suggested fields:

id

clinicId

leadId

leadScore

priority

urgency

intent

serviceCategory

summary

recommendedAction

draftReply

model

createdAt

updatedAt

For the MVP, maintaining the latest/current analysis is sufficient.

Historical versions may be added later if genuinely useful.

---

## LeadNote

Internal clinic note.

Suggested fields:

id

clinicId

leadId

authorUserId

body

createdAt

updatedAt

---

## LeadActivity

Stores important CRM events.

Suggested fields:

id

clinicId

leadId

actorUserId optional

type

description

metadata optional

createdAt

Possible types:

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

---

## FollowUpTask

A concrete, mutable staff follow-up attached to one lead (activities are an immutable log; tasks
are work state).

Fields:

id

clinicId  (tenant boundary)

leadId

title

description

dueAt

status  (OPEN / COMPLETED / CANCELLED)

priority  (FollowUpPriority)

source  (AI / STAFF / SYSTEM)

createdById

completedAt

createdAt / updatedAt

Indexes: (clinicId, status, dueAt), (leadId, status).

Relations: two named foreign keys on leadId — follow_up_task_lead_fkey → lead and
follow_up_task_analysis_fkey → lead_analysis (explicit map names prevent a constraint-name
collision; see DECISIONS.md D-045).

AI behavior: one OPEN AI-sourced task per lead, upserted idempotently on every analysis run.
Completed AI tasks are never resurrected. Staff control completion/cancel/reopen through
clinic-scoped server actions. See DECISIONS.md D-045.

---

# EMAIL ALERT LAYER

Provider abstraction in lib/email/email.ts (mock | live via EMAIL_MODE, Resend in live mode).
lib/services/lead-alerts.ts fires an alert when a lead is HOT or its follow-up priority is
IMMEDIATE. Alerts carry operational CRM data only. Every failure path resolves without throwing
and is recorded as EMAIL_ALERT_FAILED; with no ALERT_RECIPIENT_EMAIL the alert is skipped.
See DECISIONS.md D-046.

---

# LEAD ANALYSIS — DENTAL QUALIFICATION FIELDS

In addition to leadScore, priority, urgency, intent and serviceCategory, LeadAnalysis stores:

treatmentValuePotential  (LOW/MEDIUM/HIGH/PREMIUM/UNKNOWN — business value band, never a price)

painNeedLevel  (HIGH/MEDIUM/LOW/UNKNOWN — strength of the stated need, not a diagnosis)

insuranceStatus  (HAS_INSURANCE/NO_INSURANCE/UNKNOWN)

paymentReadiness  (READY/NEEDS_OPTIONS/PRICE_SENSITIVE/UNKNOWN)

followUpPriority  (IMMEDIATE/HIGH/NORMAL/LOW)

recommendedFollowUpMinutes  (5-4320; drives the follow-up task dueAt)

Scoring weights and bands live in lib/ai/scoring.ts (DECISIONS.md D-044): urgency 25,
appointment intent 20, treatment value 20, pain/need 15, payment readiness 10,
responsiveness 10; HOT ≥ 80, WARM ≥ 50, COLD < 50; score clamped 1-100.

---

# PATIENT-REPORTED INSURANCE AND PAYMENT PREFERENCE

The public enquiry form asks two OPTIONAL structured questions, stored on Lead (not LeadAnalysis)
because the patient supplies them:

PatientInsuranceStatus  (YES / NO / UNKNOWN)  -> Lead.patientInsuranceStatus

PaymentPreference  (INSURANCE / SELF_PAY / FINANCING / UNKNOWN)  -> Lead.paymentPreference

These are deliberately distinct from the AI interpretations:

Patient-reported insurance (Lead)   !=  insuranceStatus (LeadAnalysis, AI interpretation)
Payment preference (Lead)           !=  paymentReadiness (LeadAnalysis, AI interpretation)

Both columns are NOT NULL DEFAULT UNKNOWN, so existing leads remain valid without a backfill and
the migration is additive. Validation accepts only the supported enum values; an omitted, empty or
null answer becomes UNKNOWN server-side.

The explicit answers are passed to the analyzer through LeadPromptInput and rendered in the user
prompt as unverified patient-reported facts. The prompt treats them as stronger evidence than
free-text inference (YES -> HAS_INSURANCE, NO -> NO_INSURANCE, SELF_PAY -> READY,
FINANCING/INSURANCE -> NEEDS_OPTIONS) but forbids claiming that eligibility, benefits, coverage,
deductibles or authorisation were verified.

Scoring is unchanged (D-044): the answers influence scoring only through insuranceStatus and
paymentReadiness, so urgency and appointment intent stay dominant. Insurance is never required for
a HOT lead and FINANCING is never treated as a penalty.

The CRM shows the two patient answers under "Original enquiry" as "Patient input (unverified)",
visually separate from the AI qualification panel. See DECISIONS.md D-047.

---

# TENANT SECURITY

Clinic is the tenant boundary.

For protected data:

Authenticated User

→ Membership

→ Authorized clinicId

→ Clinic-scoped query

Example concept:

Do NOT:

Find Lead by leadId and assume access.

Instead:

Find Lead where:

id = requestedLeadId

AND

clinicId = authorizedClinicId

Apply the same pattern to:

Lead

LeadAnalysis

LeadNote

LeadActivity

Dashboard metrics

Mutations

---

# AUTHENTICATION VS AUTHORIZATION

Better Auth answers:

Who is the user?

Application authorization answers:

Which clinic can the user access?

Both checks are necessary.

---

# AI ARCHITECTURE

Keep runtime AI logic under:

lib/ai/

Possible structure:

client.ts

schema.ts

prompt.ts

mock.ts

analyze-lead.ts

The exact filenames may evolve.

Business code should call a central service such as:

analyzeLead()

Do not call a specific AI provider directly from page components.

---

# AI CONFIGURATION

Environment:

AI_MODE

AI_BASE_URL

AI_API_KEY

AI_MODEL

AI_MODE=mock:

Use deterministic local analysis.

AI_MODE=live:

Call configured OpenAI-compatible provider.

---

# AI ANALYSIS FLOW

1. Lead already exists.
2. Add AI_ANALYSIS_STARTED activity.
3. Build safe AI input.
4. Call provider or mock analyzer.
5. Parse response.
6. Validate using Zod.
7. Save LeadAnalysis.
8. Add AI_ANALYSIS_COMPLETED.

If failure:

1. Preserve Lead.
2. Add AI_ANALYSIS_FAILED.
3. Store/log safe error information.
4. Allow authorized retry.

---

# AI RESPONSE CONTRACT

leadScore:

Integer 0–100

priority:

HOT

WARM

COLD

urgency:

IMMEDIATE

TODAY

THIS_WEEK

FLEXIBLE

UNKNOWN

intent:

HIGH

MEDIUM

LOW

UNKNOWN

serviceCategory:

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

summary:

Short factual lead summary.

recommendedAction:

Specific staff follow-up recommendation.

draftReply:

Professional staff-reviewable draft.

---

# AI SAFETY

The runtime AI performs:

- lead qualification
- intent detection
- urgency routing
- service-interest categorization
- lead summarization
- follow-up recommendations
- draft communication

It does NOT:

- diagnose
- prescribe
- recommend treatment
- claim a medical condition
- provide clinical certainty

---

# DASHBOARD

Recommended metrics:

Total Leads

New Leads

Hot Leads

Appointments Set

Recent Leads

Queries must always be clinic-scoped.

---

# LEAD LIST

Default:

Newest first.

Columns:

Name

Service

Score

Priority

Urgency

Status

Created

Filters:

Status

Priority

Optional:

Simple name/email/phone search.

Do not build complex search infrastructure for MVP.

---

# LEAD DETAIL

Load:

Lead

LeadAnalysis

LeadNotes

LeadActivities

Every entity must belong to the authorized clinic.

---

# STATUS WORKFLOW

Normal flow:

NEW

→ CONTACTED

→ APPOINTMENT_SET

→ WON

Alternative terminal state:

LOST

Do not over-engineer state-machine restrictions.

---

# VALIDATION

Use Zod at runtime boundaries.

Validate:

- public lead input
- protected mutation input
- AI response
- useful environment configuration

TypeScript alone is not runtime validation.

---

# SERVER COMPONENTS

Prefer Server Components for:

- dashboard
- lead listing
- lead detail data retrieval
- authenticated page rendering

Use Client Components for:

- interactive forms
- filters
- mobile navigation
- dynamic controls

Avoid making whole pages client-side unnecessarily.

---

# SECURITY PRINCIPLES

Never hard-code secrets.

Never trust client clinicId.

Never expose raw database errors.

Never expose AI credentials.

Never automatically send AI-generated replies during MVP.

Never log full private lead data unless genuinely necessary.

---

# ERROR HANDLING

Public errors:

Short, safe, understandable.

Authenticated errors:

Actionable but not internally revealing.

Server diagnostics:

Technical details may be logged, but secrets and unnecessary private lead content must be excluded.

---

# PERFORMANCE

MVP does not require advanced caching.

Prefer:

- indexed database queries
- sensible selections
- server rendering
- reasonable query patterns

Pagination may be added if necessary.

Do not prematurely introduce Redis, queues, or microservices.

---

# LOCAL DEVELOPMENT

Use:

.env.local

Recommended:

AI_MODE=mock

This allows the full CRM to be developed without a paid runtime AI provider.

---

# PRODUCTION

Use:

Vercel

Neon PostgreSQL

Vercel Environment Variables

Live AI provider when configured.

Do not upload .env.local to production.

---

# CORE ARCHITECTURAL PRINCIPLE

The entire architecture should support one valuable business workflow:

Lead Capture

→ Persistence

→ AI Qualification

→ Staff Review

→ Follow-up

→ Conversion

Anything unrelated to this workflow is lower priority than completing the MVP.

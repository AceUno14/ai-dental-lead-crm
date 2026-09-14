/**
 * End-to-end verification of the core CRM workflow (T-041).
 *
 * Exercises the exact service functions the server actions call, against the
 * real database, with AI_MODE=mock:
 *
 *   visitor submits a lead
 *     -> lead persists (before any AI work)
 *     -> AI qualifies the lead
 *     -> lead appears in the CRM list/dashboard
 *     -> staff opens the lead and sees the AI recommendation
 *     -> staff updates the status
 *     -> staff adds a note
 *     -> the activity timeline reflects every step
 *
 * Also asserts tenant isolation for the lead detail query.
 *
 * Section 14 covers the CRM cleanup workflow with its own generated fixtures:
 * archive (reversible, non-destructive), restore, the archived-lead list /
 * dashboard / follow-up behaviour, cross-clinic rejection, and the OWNER-only
 * permanent deletion including the verified ON DELETE CASCADE behaviour.
 *
 * Run: npx tsx scripts/verify-e2e.mts
 * The script cleans up the records it creates.
 *
 * SAFETY: this script reads and writes a real database, so it refuses to start
 * unless DATABASE_URL is the development branch.
 */
import { createHash } from "node:crypto";

import { config as loadEnv } from "dotenv";

/**
 * The two environments are told apart by a fingerprint of the connection string
 * itself, never by printing it. DEVELOPMENT is the only database this script may
 * touch; PRODUCTION is the inherited-environment trap on this machine.
 */
const DEVELOPMENT_DATABASE_FINGERPRINT: string = "24ea81a95814";
const PRODUCTION_DATABASE_FINGERPRINT: string = "46bfa2c59fb1";

function databaseFingerprint(connectionString: string): string {
  return createHash("sha256").update(connectionString).digest("hex").slice(0, 12);
}

function isDevelopmentDatabase(connectionString: string | undefined): boolean {
  return (
    typeof connectionString === "string" &&
    databaseFingerprint(connectionString) === DEVELOPMENT_DATABASE_FINGERPRINT
  );
}

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }

  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  loadEnv({ path: ".env", quiet: true });

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured. Add it to .env.local first.");
  }

  // Hard stop before a single query runs: this script writes to the database,
  // and an inherited DATABASE_URL on this machine may point at production.
  if (!isDevelopmentDatabase(databaseUrl)) {
    throw new Error(
      `Refusing to run against a non-development database (fingerprint ${databaseFingerprint(
        databaseUrl,
      )}, expected ${DEVELOPMENT_DATABASE_FINGERPRINT}). No query was executed.`,
    );
  }

  console.log(`   database fingerprint: ${databaseFingerprint(databaseUrl)} (development)`);

  // Imported dynamically so the Prisma singleton is created after env loading.
  const { prisma } = await import("@/lib/db/prisma");
  const { findPublicClinicBySlug } = await import("@/lib/services/clinics");
  const { createPublicLead, getClinicLeadDetail, listClinicLeads, getDashboardData } = await import(
    "@/lib/services/leads"
  );
  const { runLeadAnalysis } = await import("@/lib/services/lead-analysis");
  const {
    addLeadNote,
    archiveLead,
    permanentlyDeleteLead,
    restoreLead,
    updateLeadStatus,
  } = await import("@/lib/services/lead-workflow");
  const { listClinicFollowUps, setFollowUpTaskStatus } = await import(
    "@/lib/services/follow-up-tasks"
  );
  const { publicLeadSchema } = await import("@/lib/validation/lead");
  // The public Server Action itself, so the submission contract (not just the
  // services it calls) is exercised end to end.
  const { submitLeadAction } = await import("@/app/c/[clinicSlug]/actions");

  const marker = Date.now().toString(36);
  let leadId: string | null = null;
  let tempClinicId: string | null = null;
  // Leads created by the patient-answer matrix below, cleaned up in `finally`.
  const extraLeadIds: string[] = [];
  let answerCaseCounter = 0;
  // Clinics created by the archive/delete section, cleaned up in `finally` (the
  // delete cascades their leads, analyses, tasks, notes and activities).
  const archiveClinicIds: string[] = [];

  // Snapshot of everything that already exists before this run creates anything:
  // the polished demo leads. Section 14 asserts none of them was archived,
  // deleted or otherwise changed by the test run.
  const baselineLeads = await prisma.lead.findMany({
    select: { id: true, archivedAt: true },
  });

  try {
    console.log("\n0. Database identity is the development branch");

    check(
      "this run is pinned to the development database (fingerprint 24ea81a95814)",
      isDevelopmentDatabase(databaseUrl),
      databaseFingerprint(databaseUrl),
    );
    check(
      "the guard rejects a missing connection string",
      !isDevelopmentDatabase(undefined) && !isDevelopmentDatabase(""),
    );
    check(
      "the production fingerprint is not accepted by the guard",
      PRODUCTION_DATABASE_FINGERPRINT !== DEVELOPMENT_DATABASE_FINGERPRINT &&
        !isDevelopmentDatabase(
          // Any string that is not the development connection string is refused;
          // the real production URL is never needed (or printed) here.
          "postgresql://e2e-guard:redacted@example.invalid/neondb?sslmode=require",
        ),
    );

    console.log("\n1. Visitor submits the public enquiry form");

    const clinic = await findPublicClinicBySlug("bright-smile-dental");
    check("public clinic slug resolves", clinic !== null);

    if (!clinic) {
      return;
    }

    const submission = publicLeadSchema.safeParse({
      name: "E2E Verification Patient",
      email: `e2e-${marker}@example.test`,
      phone: "555-0100",
      serviceInterest: "dental_emergency",
      preferredContactMethod: "PHONE",
      urgency: "IMMEDIATE",
      // The optional patient-reported answers are included in the main flow.
      patientInsuranceStatus: "YES",
      paymentPreference: "SELF_PAY",
      message: "I have severe tooth pain that started last night and my face is swollen.",
      consent: true,
    });
    check("submission passes Zod validation", submission.success);

    if (!submission.success) {
      return;
    }

    const lead = await createPublicLead({ clinicId: clinic.id, data: submission.data });
    leadId = lead.id;
    check("lead is persisted", typeof lead.id === "string" && lead.id.length > 0);

    console.log("\n2. AI qualification runs");

    const analysis = await runLeadAnalysis(lead);
    check("analysis reports success", analysis.ok, analysis.ok ? undefined : analysis.error);

    const stored = await prisma.leadAnalysis.findUnique({ where: { leadId: lead.id } });
    check("LeadAnalysis row exists", stored !== null);
    check(
      "lead score is within 1-100",
      !!stored && stored.leadScore >= 1 && stored.leadScore <= 100,
      stored ? `score=${stored.leadScore}` : undefined,
    );
    check(
      "priority is HOT/WARM/COLD",
      !!stored && ["HOT", "WARM", "COLD"].includes(stored.priority),
      stored?.priority,
    );
    check(
      "summary, recommended action and draft reply are populated",
      !!stored && stored.summary.length > 0 && stored.recommendedAction.length > 0 && stored.draftReply.length > 0,
    );
    check("analysis records the model name", !!stored?.model);

    console.log("\n2b. Dental qualification fields");

    check(
      "treatment value potential is a valid band",
      !!stored && ["LOW", "MEDIUM", "HIGH", "PREMIUM", "UNKNOWN"].includes(stored.treatmentValuePotential),
      stored?.treatmentValuePotential,
    );
    check(
      "urgency is a supported dental urgency",
      !!stored && ["EMERGENCY", "IMMEDIATE", "TODAY", "THIS_WEEK", "SOON", "FLEXIBLE", "UNKNOWN"].includes(stored.urgency),
      stored?.urgency,
    );
    check(
      "pain/need level is valid",
      !!stored && ["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(stored.painNeedLevel),
      stored?.painNeedLevel,
    );
    check(
      "insurance status is valid",
      !!stored && ["HAS_INSURANCE", "NO_INSURANCE", "UNKNOWN"].includes(stored.insuranceStatus),
      stored?.insuranceStatus,
    );
    check(
      "payment readiness is valid",
      !!stored && ["READY", "NEEDS_OPTIONS", "PRICE_SENSITIVE", "UNKNOWN"].includes(stored.paymentReadiness),
      stored?.paymentReadiness,
    );
    check(
      "follow-up priority is valid",
      !!stored && ["IMMEDIATE", "HIGH", "NORMAL", "LOW"].includes(stored.followUpPriority),
      stored?.followUpPriority,
    );
    check(
      "recommended follow-up minutes is sane (5-4320)",
      !!stored && stored.recommendedFollowUpMinutes >= 5 && stored.recommendedFollowUpMinutes <= 4320,
      stored ? `minutes=${stored.recommendedFollowUpMinutes}` : undefined,
    );
    check(
      "emergency enquiry scores HOT or has immediate follow-up",
      !!stored && (stored.priority === "HOT" || stored.followUpPriority === "IMMEDIATE"),
      stored ? `priority=${stored.priority} followUp=${stored.followUpPriority}` : undefined,
    );

    console.log("\n2c. Patient-reported insurance and payment preference");

    /** Submits one extra enquiry through the real schema + service. */
    const submitAnswerCase = async (overrides: Record<string, unknown>) => {
      answerCaseCounter += 1;
      const parsed = publicLeadSchema.safeParse({
        name: "E2E Patient Answer Case",
        email: `e2e-answers-${marker}-${answerCaseCounter}@example.test`,
        phone: "555-0101",
        serviceInterest: "cleaning",
        preferredContactMethod: "EMAIL",
        urgency: "THIS_WEEK",
        message: "I would like to book a routine hygiene appointment sometime soon.",
        consent: true,
        ...overrides,
      });

      if (!parsed.success) {
        return { ok: false as const, error: "schema rejected the submission" };
      }

      const created = await createPublicLead({ clinicId: clinic.id, data: parsed.data });
      extraLeadIds.push(created.id);
      return { ok: true as const, lead: created };
    };

    check(
      "insurance YES persists on the lead",
      lead.patientInsuranceStatus === "YES",
      lead.patientInsuranceStatus,
    );
    check(
      "payment preference SELF_PAY persists on the lead",
      lead.paymentPreference === "SELF_PAY",
      lead.paymentPreference,
    );
    check(
      "explicit insurance YES reaches the AI as HAS_INSURANCE",
      stored?.insuranceStatus === "HAS_INSURANCE",
      stored?.insuranceStatus,
    );
    check(
      "SELF_PAY preference reaches the AI as READY readiness",
      stored?.paymentReadiness === "READY",
      stored?.paymentReadiness,
    );

    const insuranceNo = await submitAnswerCase({ patientInsuranceStatus: "NO" });
    check(
      "insurance NO persists on the lead",
      insuranceNo.ok && insuranceNo.lead.patientInsuranceStatus === "NO",
      insuranceNo.ok ? insuranceNo.lead.patientInsuranceStatus : insuranceNo.error,
    );

    if (insuranceNo.ok) {
      await runLeadAnalysis(insuranceNo.lead);
      const noAnalysis = await prisma.leadAnalysis.findUnique({
        where: { leadId: insuranceNo.lead.id },
      });
      check(
        "explicit insurance NO reaches the AI as NO_INSURANCE",
        noAnalysis?.insuranceStatus === "NO_INSURANCE",
        noAnalysis?.insuranceStatus,
      );
    }

    const answersOmitted = await submitAnswerCase({});
    check(
      "omitted insurance becomes UNKNOWN",
      answersOmitted.ok && answersOmitted.lead.patientInsuranceStatus === "UNKNOWN",
      answersOmitted.ok ? answersOmitted.lead.patientInsuranceStatus : answersOmitted.error,
    );
    check(
      "omitted payment preference becomes UNKNOWN",
      answersOmitted.ok && answersOmitted.lead.paymentPreference === "UNKNOWN",
      answersOmitted.ok ? answersOmitted.lead.paymentPreference : answersOmitted.error,
    );
    check(
      "a submission without the new fields stays valid (existing clients)",
      answersOmitted.ok,
      answersOmitted.ok ? undefined : answersOmitted.error,
    );

    const urgentFinancing = await submitAnswerCase({
      patientInsuranceStatus: "NO",
      paymentPreference: "FINANCING",
      serviceInterest: "dental_emergency",
      urgency: "IMMEDIATE",
      message:
        "I have severe tooth pain and swelling and need to be seen today. I would need a payment plan.",
    });
    check(
      "payment preference FINANCING persists on the lead",
      urgentFinancing.ok && urgentFinancing.lead.paymentPreference === "FINANCING",
      urgentFinancing.ok ? urgentFinancing.lead.paymentPreference : urgentFinancing.error,
    );

    if (urgentFinancing.ok) {
      const run = await runLeadAnalysis(urgentFinancing.lead);
      const urgentAnalysis = await prisma.leadAnalysis.findUnique({
        where: { leadId: urgentFinancing.lead.id },
      });

      check("financing lead still qualifies", run.ok, run.ok ? undefined : run.error);
      check(
        "FINANCING maps to payment readiness needs-options",
        urgentAnalysis?.paymentReadiness === "NEEDS_OPTIONS",
        urgentAnalysis?.paymentReadiness,
      );
      check(
        "financing never forces an urgent high-intent lead to COLD",
        urgentAnalysis !== null && urgentAnalysis.priority !== "COLD",
        urgentAnalysis?.priority,
      );
      check(
        "urgent financing lead keeps an immediate/high follow-up",
        urgentAnalysis !== null &&
          ["IMMEDIATE", "HIGH"].includes(urgentAnalysis.followUpPriority),
        urgentAnalysis?.followUpPriority,
      );
    }

    console.log("\n3. Lead appears in the CRM");

    const list = await listClinicLeads(clinic.id);
    check("lead is listed for the clinic", list.some((item) => item.id === lead.id));
    check(
      "list carries the AI priority",
      list.some((item) => item.id === lead.id && item.analysis?.priority === stored?.priority),
    );

    const dashboard = await getDashboardData(clinic.id);
    check("dashboard counts the lead", dashboard.metrics.totalLeads > 0);
    check(
      "dashboard surfaces it in recent leads",
      dashboard.recentLeads.some((item) => item.id === lead.id),
    );

    console.log("\n4. Staff opens the lead");

    const detail = await getClinicLeadDetail(clinic.id, lead.id);
    check("detail loads for the owning clinic", detail !== null);
    check("AI recommendation is visible on the detail", detail?.analysis !== null);

    console.log("\n5. Tenant isolation");

    // A second clinic is enough to prove the scoping; it needs no members.
    tempClinicId = (
      await prisma.clinic.create({
        data: { name: `E2E Isolation Clinic ${marker}`, slug: `e2e-isolation-${marker}` },
        select: { id: true },
      })
    ).id;
    const otherClinicDetail = await getClinicLeadDetail(tempClinicId, lead.id);
    check("another clinic cannot read this lead", otherClinicDetail === null);
    const otherClinicList = await listClinicLeads(tempClinicId);
    check("another clinic's lead list is scoped", otherClinicList.length === 0);

    console.log("\n6. Staff updates the status and adds a note");

    const owner = await prisma.membership.findFirst({
      where: { clinicId: clinic.id },
      select: { userId: true },
    });
    check("clinic has a member to act as staff", owner !== null);

    if (!owner) {
      return;
    }

    const statusResult = await updateLeadStatus({
      clinicId: clinic.id,
      leadId: lead.id,
      status: "APPOINTMENT_SET",
      actorUserId: owner.userId,
    });
    check("status update succeeds", statusResult.ok);

    const afterStatus = await prisma.lead.findUnique({ where: { id: lead.id } });
    check("status is persisted", afterStatus?.status === "APPOINTMENT_SET", afterStatus?.status);

    const noteResult = await addLeadNote({
      clinicId: clinic.id,
      leadId: lead.id,
      authorUserId: owner.userId,
      body: `Called the patient and booked an emergency slot (${marker}).`,
    });
    check("note is added", noteResult.ok);

    console.log("\n7. Activity timeline reflects every step");

    const finalDetail = await getClinicLeadDetail(clinic.id, lead.id);
    const types = new Set(finalDetail?.activities.map((activity) => activity.type) ?? []);

    check("LEAD_CREATED recorded", types.has("LEAD_CREATED"));
    check("AI_ANALYSIS_STARTED recorded", types.has("AI_ANALYSIS_STARTED"));
    check("AI_ANALYSIS_COMPLETED recorded", types.has("AI_ANALYSIS_COMPLETED"));
    check("STATUS_CHANGED recorded", types.has("STATUS_CHANGED"));
    check("APPOINTMENT_SET milestone recorded", types.has("APPOINTMENT_SET"));
    check("NOTE_ADDED recorded", types.has("NOTE_ADDED"));
    check("note is rendered on the detail", (finalDetail?.notes.length ?? 0) === 1);

    const ordered = finalDetail?.activities.map((activity) => activity.createdAt.getTime()) ?? [];
    check(
      "timeline is chronologically ordered",
      ordered.every((value, index) => index === 0 || value <= ordered[index - 1]!),
    );

    console.log("\n8. Analysis retry is idempotent");

    const retry = await runLeadAnalysis(lead);
    check("retry succeeds", retry.ok);
    const afterRetry = await prisma.leadAnalysis.count({ where: { leadId: lead.id } });
    check("retry upserts instead of duplicating", afterRetry === 1, `rows=${afterRetry}`);

    console.log("\n9. AI follow-up task is created and idempotent");

    const openAiTasksAfterFirst = await prisma.followUpTask.count({
      where: { leadId: lead.id, source: "AI", status: "OPEN" },
    });
    check("exactly one open AI task after analysis", openAiTasksAfterFirst === 1, `count=${openAiTasksAfterFirst}`);

    const secondRetry = await runLeadAnalysis(lead);
    check("retry with task refresh succeeds", secondRetry.ok);

    const openAiTasksAfterRetry = await prisma.followUpTask.count({
      where: { leadId: lead.id, source: "AI", status: "OPEN" },
    });
    check(
      "retry does not duplicate the AI task",
      openAiTasksAfterRetry === 1,
      `count=${openAiTasksAfterRetry}`,
    );

    const aiTask = await prisma.followUpTask.findFirst({
      where: { leadId: lead.id, source: "AI", status: "OPEN" },
    });
    check("AI task is titled as a recommendation", !!aiTask?.title.startsWith("AI recommendation:"), aiTask?.title);
    check(
      "AI task due date follows the analysis",
      !!aiTask && !!stored && aiTask.dueAt.getTime() > Date.now() - 60_000,
    );

    console.log("\n10. Staff completes the AI task");

    const staffMember = await prisma.membership.findFirst({
      where: { clinicId: clinic.id },
      select: { userId: true },
    });
    check("clinic has a member for task completion", staffMember !== null);

    if (staffMember && aiTask) {
      const complete = await setFollowUpTaskStatus({
        clinicId: clinic.id,
        leadId: lead.id,
        taskId: aiTask.id,
        actorUserId: staffMember.userId,
        status: "COMPLETED",
      });
      check("task completion succeeds", complete.ok);

      const completedTask = await prisma.followUpTask.findUnique({ where: { id: aiTask.id } });
      check(
        "task is completed with a timestamp",
        completedTask?.status === "COMPLETED" && completedTask.completedAt !== null,
      );

      // Re-running the analysis must NOT resurrect a completed AI task.
      const thirdRun = await runLeadAnalysis(lead);
      check("analysis re-run after completion succeeds", thirdRun.ok);
      const resurrected = await prisma.followUpTask.count({
        where: { leadId: lead.id, source: "AI" },
      });
      check(
        "completed AI task is not resurrected or duplicated",
        resurrected === 1,
        `count=${resurrected}`,
      );
    }

    console.log("\n11. Email alert decisioning (mock mode)");

    const { shouldSendLeadAlert, buildLeadAlertEmail } = await import("@/lib/services/lead-alerts");
    check(
      "HOT lead triggers an alert",
      shouldSendLeadAlert({ priority: "HOT", followUpPriority: "NORMAL" }),
    );
    check(
      "IMMEDIATE follow-up triggers an alert even when WARM",
      shouldSendLeadAlert({ priority: "WARM", followUpPriority: "IMMEDIATE" }),
    );
    check(
      "COLD lead does not trigger an alert",
      !shouldSendLeadAlert({ priority: "COLD", followUpPriority: "LOW" }),
    );

    if (stored) {
      const email = buildLeadAlertEmail({
        lead: { id: lead.id, name: lead.name, clinicId: clinic.id },
        analysis: stored,
        leadUrl: "https://example.test/leads/abc",
      });
      check("alert subject mentions priority", email.subject.includes(stored.priority));
      check(
        "alert body carries score, treatment and action",
        email.text.includes(`${stored.leadScore}/100`) &&
          email.text.includes(stored.recommendedAction),
      );
      check(
        "alert body does not leak the full enquiry message",
        !email.text.includes(lead.message),
      );
    }

    const alertActivities = await prisma.leadActivity.count({
      where: { leadId: lead.id, type: { in: ["EMAIL_ALERT_SENT", "EMAIL_ALERT_FAILED"] } },
    });
    check(
      "no alert activity recorded without a configured recipient",
      alertActivities === 0,
      `count=${alertActivities}`,
    );

    console.log("\n12. Timeline records follow-up workflow events");

    const finalTypes = new Set(
      (
        await prisma.leadActivity.findMany({
          where: { leadId: lead.id },
          select: { type: true },
        })
      ).map((activity) => activity.type),
    );
    check("FOLLOW_UP_CREATED recorded", finalTypes.has("FOLLOW_UP_CREATED"));
    check("FOLLOW_UP_COMPLETED recorded", finalTypes.has("FOLLOW_UP_COMPLETED"));

    const dashboardAfter = await getDashboardData(clinic.id);
    check(
      "dashboard exposes followUpsDue metric",
      typeof dashboardAfter.metrics.followUpsDue === "number",
      `followUpsDue=${dashboardAfter.metrics.followUpsDue}`,
    );

    console.log("\n13. Public submission survives a post-persistence failure (regression)");

    // The invariant under test: once the enquiry is stored, nothing downstream
    // may tell the visitor it failed. `getServerEnv()` is reached only by the
    // public action, and only after the lead and its analysis exist, so an
    // invalid NEXT_PUBLIC_APP_URL reproduces a post-persistence failure without
    // touching the database. Before the fix this returned the generic failure
    // message while the lead had in fact been created, and the next attempt
    // only appeared to work because duplicate detection returned the
    // already-stored enquiry.
    const publicMarker = `${marker}p`;
    const publicEmail = `e2e-public-${publicMarker}@example.test`;
    const aiOutageEmail = `e2e-public-ai-${publicMarker}@example.test`;

    const buildPublicSubmission = (email: string) => {
      const data = new FormData();
      data.set("clinicSlug", "bright-smile-dental");
      data.set("name", "E2E Public Patient");
      data.set("email", email);
      data.set("phone", "555-0198");
      data.set("serviceInterest", "general_checkup");
      data.set("preferredContactMethod", "EMAIL");
      data.set("urgency", "THIS_WEEK");
      data.set("patientInsuranceStatus", "NO");
      data.set("paymentPreference", "FINANCING");
      data.set("message", "Regression enquiry: a loose filling and sore gums on the left side.");
      data.set("consent", "on");
      return data;
    };

    // A rejected submission must still echo everything the visitor entered, so
    // the form can restore it after React's post-action reset.
    const invalidSubmission = buildPublicSubmission(publicEmail);
    invalidSubmission.set("message", "too short");
    const rejected = await submitLeadAction({ status: "idle" }, invalidSubmission);
    check(
      "an invalid submission is rejected with field errors",
      rejected.status === "error" && Boolean(rejected.fieldErrors?.message),
      rejected.status,
    );
    check(
      "a rejected submission echoes every entered field back",
      rejected.values?.name === "E2E Public Patient" &&
        rejected.values?.email === publicEmail &&
        rejected.values?.patientInsuranceStatus === "NO" &&
        rejected.values?.paymentPreference === "FINANCING" &&
        rejected.values?.consent === "on",
    );

    const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const previousAiMode = process.env.AI_MODE;
    const previousAiKey = process.env.AI_API_KEY;

    try {
      process.env.NEXT_PUBLIC_APP_URL = "not-a-url";

      const firstAttempt = await submitLeadAction(
        { status: "idle" },
        buildPublicSubmission(publicEmail),
      );
      check(
        "a failure after persistence still reports the enquiry as received",
        firstAttempt.status === "success",
        `status=${firstAttempt.status} message=${firstAttempt.message ?? ""}`,
      );

      const storedPublic = await prisma.lead.findFirst({ where: { email: publicEmail } });
      if (storedPublic) {
        extraLeadIds.push(storedPublic.id);
      }
      check("the enquiry is persisted before that failure", storedPublic !== null);
      check(
        "the patient-reported answers are stored with it",
        storedPublic?.patientInsuranceStatus === "NO" &&
          storedPublic?.paymentPreference === "FINANCING",
      );
      const publicAnalysis = storedPublic
        ? await prisma.leadAnalysis.findUnique({ where: { leadId: storedPublic.id } })
        : null;
      check("AI qualification still runs for it", publicAnalysis !== null);

      const retry = await submitLeadAction(
        { status: "idle" },
        buildPublicSubmission(publicEmail),
      );
      check(
        "an immediate retry reports success too",
        retry.status === "success",
        `status=${retry.status} message=${retry.message ?? ""}`,
      );
      const duplicates = await prisma.lead.count({ where: { email: publicEmail } });
      check(
        "duplicate protection stays intact (exactly one lead)",
        duplicates === 1,
        `count=${duplicates}`,
      );

      // An AI outage after persistence must not reject the stored lead either.
      process.env.AI_MODE = "live";
      delete process.env.AI_API_KEY;

      const aiOutage = await submitLeadAction(
        { status: "idle" },
        buildPublicSubmission(aiOutageEmail),
      );
      check(
        "an AI outage after persistence still reports success",
        aiOutage.status === "success",
        `status=${aiOutage.status} message=${aiOutage.message ?? ""}`,
      );

      const aiLead = await prisma.lead.findFirst({ where: { email: aiOutageEmail } });
      if (aiLead) {
        extraLeadIds.push(aiLead.id);
      }
      check("the lead survives the AI outage", aiLead !== null);

      if (aiLead) {
        const failureRecorded = await prisma.leadActivity.findFirst({
          where: { leadId: aiLead.id, type: "AI_ANALYSIS_FAILED" },
        });
        check("the AI failure is recorded on the lead", failureRecorded !== null);
      }
    } finally {
      if (previousAppUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
      }

      if (previousAiMode === undefined) {
        delete process.env.AI_MODE;
      } else {
        process.env.AI_MODE = previousAiMode;
      }

      if (previousAiKey === undefined) {
        delete process.env.AI_API_KEY;
      } else {
        process.env.AI_API_KEY = previousAiKey;
      }
    }

    console.log("\n14. Lead archive / restore / permanent delete (owner only)");

    // Every fixture in this section is generated here (own clinics, own users,
    // own leads), so the polished demo leads are never archived or deleted.
    const archiveClinic = await prisma.clinic.create({
      data: { name: `E2E Archive Clinic ${marker}`, slug: `e2e-archive-${marker}` },
      select: { id: true },
    });
    const secondClinic = await prisma.clinic.create({
      data: { name: `E2E Archive Clinic B ${marker}`, slug: `e2e-archive-b-${marker}` },
      select: { id: true },
    });
    archiveClinicIds.push(archiveClinic.id, secondClinic.id);

    const archiveOwner = await prisma.user.create({
      data: {
        name: "E2E Archive Owner",
        email: `e2e-archive-owner-${marker}@example.test`,
        emailVerified: true,
      },
      select: { id: true },
    });
    const archiveAdmin = await prisma.user.create({
      data: {
        name: "E2E Archive Admin",
        email: `e2e-archive-admin-${marker}@example.test`,
        emailVerified: true,
      },
      select: { id: true },
    });
    const archiveStaff = await prisma.user.create({
      data: {
        name: "E2E Archive Staff",
        email: `e2e-archive-staff-${marker}@example.test`,
        emailVerified: true,
      },
      select: { id: true },
    });

    await prisma.membership.createMany({
      data: [
        { clinicId: archiveClinic.id, userId: archiveOwner.id, role: "OWNER" },
        { clinicId: archiveClinic.id, userId: archiveAdmin.id, role: "ADMIN" },
        { clinicId: archiveClinic.id, userId: archiveStaff.id, role: "STAFF" },
        { clinicId: secondClinic.id, userId: archiveOwner.id, role: "OWNER" },
      ],
    });

    /** One fully populated lead: analysis + AI follow-up task + note + activity. */
    const createArchiveFixture = async (clinicId: string, label: string) => {
      const parsed = publicLeadSchema.safeParse({
        name: `E2E Archive ${label}`,
        email: `e2e-archive-${label.toLowerCase()}-${marker}@example.test`,
        phone: "555-0177",
        serviceInterest: "dental_emergency",
        preferredContactMethod: "PHONE",
        urgency: "IMMEDIATE",
        patientInsuranceStatus: "YES",
        paymentPreference: "FINANCING",
        message:
          "Fixture enquiry used to verify archive, restore and permanent deletion behaviour end to end.",
        consent: true,
      });

      if (!parsed.success) {
        throw new Error("archive fixture failed public lead validation");
      }

      const created = await createPublicLead({ clinicId, data: parsed.data });
      await runLeadAnalysis(created);
      await addLeadNote({
        clinicId,
        leadId: created.id,
        authorUserId: archiveOwner.id,
        body: `Archive fixture note (${label}).`,
      });
      return created;
    };

    const targetLead = await createArchiveFixture(archiveClinic.id, "Target");
    const controlLead = await createArchiveFixture(archiveClinic.id, "Control");
    const otherClinicLead = await createArchiveFixture(secondClinic.id, "OtherClinic");

    const countDependents = async (id: string) => ({
      analyses: await prisma.leadAnalysis.count({ where: { leadId: id } }),
      tasks: await prisma.followUpTask.count({ where: { leadId: id } }),
      notes: await prisma.leadNote.count({ where: { leadId: id } }),
      activities: await prisma.leadActivity.count({ where: { leadId: id } }),
    });

    console.log("\n14a. Cascade behaviour is verified before any delete");

    // Read the live constraints rather than trusting the schema file. This is
    // what makes "one delete removes everything" a verified claim: every table
    // that references a lead must do so with ON DELETE CASCADE, otherwise a
    // permanent delete would fail or leave orphans behind.
    const cascadeConstraints = new Map(
      (
        await prisma.$queryRaw<Array<{ name: string; definition: string }>>`
          SELECT conname AS name, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conname IN (
            'lead_analysis_leadId_fkey',
            'lead_note_leadId_fkey',
            'lead_activity_leadId_fkey',
            'follow_up_task_lead_fkey',
            'follow_up_task_analysis_fkey'
          )
        `
      ).map((row) => [row.name, row.definition] as const),
    );

    const expectCascade = (conname: string) => {
      const definition = cascadeConstraints.get(conname);
      check(
        `verified before any delete: ${conname} is ON DELETE CASCADE`,
        Boolean(definition?.includes("ON DELETE CASCADE")),
        definition ?? "constraint not found",
      );
    };

    expectCascade("lead_analysis_leadId_fkey");
    expectCascade("lead_note_leadId_fkey");
    expectCascade("lead_activity_leadId_fkey");
    expectCascade("follow_up_task_lead_fkey");
    expectCascade("follow_up_task_analysis_fkey");

    console.log("\n14b. Archive is reversible and deletes nothing");

    const dependentsBefore = await countDependents(targetLead.id);
    check(
      "the fixture has an analysis, an AI task, a note and activity history",
      dependentsBefore.analyses === 1 &&
        dependentsBefore.tasks >= 1 &&
        dependentsBefore.notes === 1 &&
        dependentsBefore.activities >= 3,
      JSON.stringify(dependentsBefore),
    );

    const dashboardBefore = await getDashboardData(archiveClinic.id);
    check(
      "dashboard counts both active fixture leads",
      dashboardBefore.metrics.totalLeads === 2,
      `totalLeads=${dashboardBefore.metrics.totalLeads}`,
    );

    const archiveResult = await archiveLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
    });
    check(
      "the owning clinic can archive its lead",
      archiveResult.ok,
      archiveResult.ok ? undefined : archiveResult.error,
    );

    const archivedRow = await prisma.lead.findUnique({ where: { id: targetLead.id } });
    check("the archived lead still exists", archivedRow !== null);
    check("archivedAt is set", archivedRow?.archivedAt instanceof Date);
    check(
      "archiving leaves the CRM status untouched",
      archivedRow?.status === targetLead.status,
      archivedRow?.status,
    );

    const dependentsAfterArchive = await countDependents(targetLead.id);
    check(
      "archiving preserves the AI analysis",
      dependentsAfterArchive.analyses === dependentsBefore.analyses,
    );
    check(
      "archiving preserves the follow-up tasks",
      dependentsAfterArchive.tasks === dependentsBefore.tasks,
    );
    check(
      "archiving preserves the internal notes",
      dependentsAfterArchive.notes === dependentsBefore.notes,
    );
    check(
      "archiving deletes no activity history",
      dependentsAfterArchive.activities >= dependentsBefore.activities,
    );

    const archiveActivity = await prisma.leadActivity.findFirst({
      where: { leadId: targetLead.id, type: "LEAD_ARCHIVED" },
    });
    check(
      "the archive is recorded on the activity timeline with its actor",
      archiveActivity?.actorUserId === archiveOwner.id,
      archiveActivity?.description,
    );

    const reArchive = await archiveLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
    });
    const archiveActivityCount = await prisma.leadActivity.count({
      where: { leadId: targetLead.id, type: "LEAD_ARCHIVED" },
    });
    check(
      "re-archiving is a no-op with one timeline entry",
      reArchive.ok && archiveActivityCount === 1,
      `count=${archiveActivityCount}`,
    );

    console.log("\n14c. Archived leads leave the working views");

    const defaultList = await listClinicLeads(archiveClinic.id);
    check(
      "the archived lead disappears from the default leads list",
      !defaultList.some((item) => item.id === targetLead.id),
    );
    check(
      "the active control lead is still listed",
      defaultList.some((item) => item.id === controlLead.id),
    );

    const archivedList = await listClinicLeads(archiveClinic.id, { archived: "archived" });
    check(
      "the Archived filter finds the archived lead",
      archivedList.some((item) => item.id === targetLead.id),
    );
    check(
      "the Archived filter excludes active leads",
      !archivedList.some((item) => item.id === controlLead.id),
    );

    const allList = await listClinicLeads(archiveClinic.id, { archived: "all" });
    check(
      "the All leads filter shows active and archived leads",
      allList.some((item) => item.id === targetLead.id) &&
        allList.some((item) => item.id === controlLead.id),
    );

    const bogusList = await listClinicLeads(archiveClinic.id, { archived: "bogus" });
    check(
      "an unrecognised archive filter falls back to active-only",
      !bogusList.some((item) => item.id === targetLead.id),
    );

    const dashboardAfterArchive = await getDashboardData(archiveClinic.id);
    check(
      "dashboard metrics exclude the archived lead",
      dashboardAfterArchive.metrics.totalLeads === dashboardBefore.metrics.totalLeads - 1,
      `totalLeads=${dashboardAfterArchive.metrics.totalLeads}`,
    );
    check(
      "recent leads exclude the archived lead",
      !dashboardAfterArchive.recentLeads.some((item) => item.id === targetLead.id),
    );
    check(
      "recent leads still include the active control lead",
      dashboardAfterArchive.recentLeads.some((item) => item.id === controlLead.id),
    );

    const openFollowUps = await listClinicFollowUps(archiveClinic.id);
    check(
      "open follow-ups exclude tasks of archived leads",
      !openFollowUps.some((task) => task.lead.id === targetLead.id),
    );
    check(
      "open follow-ups still include tasks of active leads",
      openFollowUps.some((task) => task.lead.id === controlLead.id),
    );

    const archivedTaskRows = await prisma.followUpTask.count({ where: { leadId: targetLead.id } });
    check(
      "the archived lead's task rows were kept, not deleted",
      archivedTaskRows >= 1,
      `count=${archivedTaskRows}`,
    );

    console.log("\n14d. Archive and restore stay clinic-scoped");

    const crossClinicArchive = await archiveLead({
      clinicId: secondClinic.id,
      leadId: controlLead.id,
      actorUserId: archiveOwner.id,
    });
    check(
      "another clinic cannot archive this clinic's lead",
      !crossClinicArchive.ok,
      crossClinicArchive.ok ? "unexpectedly succeeded" : crossClinicArchive.error,
    );
    const controlAfterCrossArchive = await prisma.lead.findUnique({
      where: { id: controlLead.id },
    });
    check(
      "the rejected cross-clinic archive changed nothing",
      controlAfterCrossArchive?.archivedAt === null,
    );

    const crossClinicRestore = await restoreLead({
      clinicId: secondClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
    });
    check(
      "another clinic cannot restore this clinic's archived lead",
      !crossClinicRestore.ok,
      crossClinicRestore.ok ? "unexpectedly succeeded" : crossClinicRestore.error,
    );
    const targetAfterCrossRestore = await prisma.lead.findUnique({
      where: { id: targetLead.id },
    });
    check(
      "the archived lead stays archived after the rejected restore",
      targetAfterCrossRestore?.archivedAt instanceof Date,
    );

    const ownClinicArchive = await archiveLead({
      clinicId: secondClinic.id,
      leadId: otherClinicLead.id,
      actorUserId: archiveOwner.id,
    });
    check(
      "archive works inside the lead's own clinic",
      ownClinicArchive.ok,
      ownClinicArchive.ok ? undefined : ownClinicArchive.error,
    );
    const secondClinicActive = await listClinicLeads(secondClinic.id);
    check(
      "that archive affects only its own clinic's list",
      secondClinicActive.length === 0,
      `count=${secondClinicActive.length}`,
    );
    check(
      "the first clinic's list is unaffected by the second clinic",
      (await listClinicLeads(archiveClinic.id)).some((item) => item.id === controlLead.id),
    );

    console.log("\n14e. Restore returns the lead to normal visibility");

    const restoreResult = await restoreLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
    });
    check(
      "the owning clinic can restore its archived lead",
      restoreResult.ok,
      restoreResult.ok ? undefined : restoreResult.error,
    );

    const restoredRow = await prisma.lead.findUnique({ where: { id: targetLead.id } });
    check("restoring clears archivedAt", restoredRow?.archivedAt === null);

    const restoreActivity = await prisma.leadActivity.findFirst({
      where: { leadId: targetLead.id, type: "LEAD_RESTORED" },
    });
    check(
      "the restore is recorded on the activity timeline",
      restoreActivity?.actorUserId === archiveOwner.id,
    );

    const listAfterRestore = await listClinicLeads(archiveClinic.id);
    check(
      "the restored lead is visible in the default list again",
      listAfterRestore.some((item) => item.id === targetLead.id),
    );

    const dashboardAfterRestore = await getDashboardData(archiveClinic.id);
    check(
      "dashboard metrics count it again",
      dashboardAfterRestore.metrics.totalLeads === dashboardBefore.metrics.totalLeads,
      `totalLeads=${dashboardAfterRestore.metrics.totalLeads}`,
    );

    const dependentsAfterRestore = await countDependents(targetLead.id);
    check(
      "the archive/restore round trip preserves analysis, tasks and notes",
      dependentsAfterRestore.analyses === dependentsBefore.analyses &&
        dependentsAfterRestore.tasks === dependentsBefore.tasks &&
        dependentsAfterRestore.notes === dependentsBefore.notes,
      JSON.stringify(dependentsAfterRestore),
    );

    console.log("\n14f. Permanent deletion is OWNER only");

    const staffDelete = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveStaff.id,
      confirmation: "DELETE",
    });
    check(
      "a STAFF member cannot permanently delete a lead",
      !staffDelete.ok,
      staffDelete.ok ? "unexpectedly succeeded" : staffDelete.error,
    );

    const adminDelete = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveAdmin.id,
      confirmation: "DELETE",
    });
    check(
      "an ADMIN cannot permanently delete a lead either",
      !adminDelete.ok,
      adminDelete.ok ? "unexpectedly succeeded" : adminDelete.error,
    );

    check(
      "the refused deletes left the lead and its dependents intact",
      (await prisma.lead.count({ where: { id: targetLead.id } })) === 1 &&
        (await countDependents(targetLead.id)).analyses === 1,
    );

    const wrongConfirmation = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
      confirmation: "delete",
    });
    check(
      "even the owner needs the exact confirmation value",
      !wrongConfirmation.ok,
      wrongConfirmation.ok ? "unexpectedly succeeded" : wrongConfirmation.error,
    );
    check(
      "the lead survives a mistyped confirmation",
      (await prisma.lead.count({ where: { id: targetLead.id } })) === 1,
    );

    const crossClinicDelete = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: otherClinicLead.id,
      actorUserId: archiveOwner.id,
      confirmation: otherClinicLead.name,
    });
    check(
      "a clinic cannot permanently delete another clinic's lead",
      !crossClinicDelete.ok,
      crossClinicDelete.ok ? "unexpectedly succeeded" : crossClinicDelete.error,
    );
    check(
      "the cross-clinic delete attempt left the other clinic's lead intact",
      (await prisma.lead.count({ where: { id: otherClinicLead.id } })) === 1,
    );

    console.log("\n14g. Owner deletes a lead and the cascades do the rest");

    const deleted = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: targetLead.id,
      actorUserId: archiveOwner.id,
      confirmation: targetLead.name,
    });
    check(
      "the owner can permanently delete the lead by typing its name",
      deleted.ok,
      deleted.ok ? undefined : deleted.error,
    );

    check(
      "the lead row is gone",
      (await prisma.lead.count({ where: { id: targetLead.id } })) === 0,
    );

    const dependentsAfterDelete = await countDependents(targetLead.id);
    check(
      "the cascade removed the AI analysis",
      dependentsAfterDelete.analyses === 0,
      `count=${dependentsAfterDelete.analyses}`,
    );
    check(
      "the cascade removed the follow-up tasks",
      dependentsAfterDelete.tasks === 0,
      `count=${dependentsAfterDelete.tasks}`,
    );
    check(
      "the cascade removed the internal notes",
      dependentsAfterDelete.notes === 0,
      `count=${dependentsAfterDelete.notes}`,
    );
    check(
      "the cascade removed the activity history",
      dependentsAfterDelete.activities === 0,
      `count=${dependentsAfterDelete.activities}`,
    );

    const siblingDependents = await countDependents(controlLead.id);
    check(
      "the sibling lead in the same clinic keeps its records",
      siblingDependents.analyses === 1 &&
        siblingDependents.tasks >= 1 &&
        siblingDependents.notes === 1 &&
        siblingDependents.activities >= 3,
      JSON.stringify(siblingDependents),
    );
    check(
      "the other clinic's lead is unaffected",
      (await prisma.lead.count({ where: { id: otherClinicLead.id } })) === 1,
    );

    // The confirmation word works on an archived lead too.
    await archiveLead({
      clinicId: archiveClinic.id,
      leadId: controlLead.id,
      actorUserId: archiveOwner.id,
    });
    const deletedArchived = await permanentlyDeleteLead({
      clinicId: archiveClinic.id,
      leadId: controlLead.id,
      actorUserId: archiveOwner.id,
      confirmation: "DELETE",
    });
    check(
      "an archived lead can be permanently deleted with DELETE",
      deletedArchived.ok,
      deletedArchived.ok ? undefined : deletedArchived.error,
    );
    check(
      "the archived lead's dependents cascade away as well",
      Object.values(await countDependents(controlLead.id)).every((count) => count === 0),
    );

    console.log("\n14h. The polished demo leads are untouched");

    const currentLeads = await prisma.lead.findMany({ select: { id: true, archivedAt: true } });
    const currentById = new Map(
      currentLeads.map((lead) => [lead.id, lead.archivedAt?.getTime() ?? null]),
    );

    check(
      "every lead that existed before this run is still present",
      baselineLeads.every((lead) => currentById.has(lead.id)),
      `baseline=${baselineLeads.length} present=${currentLeads.length}`,
    );
    check(
      `all ${baselineLeads.length} pre-existing (demo) leads are unarchived and unchanged`,
      baselineLeads.every((lead) => currentById.get(lead.id) === (lead.archivedAt?.getTime() ?? null)),
    );
  } finally {
    // Keep the development database clean: the seed owns the demo data.
    if (leadId) {
      await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});
    }
    for (const extraId of extraLeadIds) {
      await prisma.lead.delete({ where: { id: extraId } }).catch(() => {});
    }
    if (tempClinicId) {
      await prisma.clinic.delete({ where: { id: tempClinicId } }).catch(() => {});
    }
    for (const clinicId of archiveClinicIds) {
      await prisma.clinic.delete({ where: { id: clinicId } }).catch(() => {});
    }
    await prisma.lead
      .deleteMany({ where: { email: { contains: "e2e-public-" } } })
      .catch(() => {});
    await prisma.user.deleteMany({ where: { email: { contains: "e2e-" } } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\nE2E verification FAILED (${failures} check(s)).`);
      process.exit(1);
    }
    console.log("\nE2E verification PASSED — full core workflow works.");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("\nE2E verification errored:", error instanceof Error ? error.message : error);
    process.exit(1);
  });

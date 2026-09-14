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
 * Run: npx tsx scripts/verify-e2e.mts
 * The script cleans up the records it creates.
 */
import { config as loadEnv } from "dotenv";

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

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add it to .env.local first.");
  }

  // Imported dynamically so the Prisma singleton is created after env loading.
  const { prisma } = await import("@/lib/db/prisma");
  const { findPublicClinicBySlug } = await import("@/lib/services/clinics");
  const { createPublicLead, getClinicLeadDetail, listClinicLeads, getDashboardData } = await import(
    "@/lib/services/leads"
  );
  const { runLeadAnalysis } = await import("@/lib/services/lead-analysis");
  const { addLeadNote, updateLeadStatus } = await import("@/lib/services/lead-workflow");
  const { setFollowUpTaskStatus } = await import("@/lib/services/follow-up-tasks");
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

  try {
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

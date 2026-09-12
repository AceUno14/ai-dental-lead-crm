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

  const marker = Date.now().toString(36);
  let leadId: string | null = null;
  let tempClinicId: string | null = null;

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
  } finally {
    // Keep the development database clean: the seed owns the demo data.
    if (leadId) {
      await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});
    }
    if (tempClinicId) {
      await prisma.clinic.delete({ where: { id: tempClinicId } }).catch(() => {});
    }
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

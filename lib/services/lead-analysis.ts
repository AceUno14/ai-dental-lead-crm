import { prisma } from "@/lib/db/prisma";
import { analyzeLead } from "@/lib/ai/analyze-lead";
import { recordActivity } from "@/lib/services/activities";
import { upsertAiFollowUpTask } from "@/lib/services/follow-up-tasks";
import { ActivityType } from "@/lib/generated/prisma/enums";
import type { Lead } from "@/lib/generated/prisma/client";

export type AnalysisRunResult =
  | { ok: true; leadScore: number; priority: string; model: string }
  | { ok: false; error: string };

export type AnalysisLeadInput = Pick<
  Lead,
  | "id"
  | "clinicId"
  | "name"
  | "serviceInterest"
  | "preferredContactMethod"
  | "submittedUrgency"
  | "message"
  | "patientInsuranceStatus"
  | "paymentPreference"
>;

/**
 * Runs AI qualification for an existing lead.
 *
 * Workflow:
 *   AI_ANALYSIS_STARTED → analyzer → validate → LeadAnalysis → AI_ANALYSIS_COMPLETED
 * Failure:
 *   AI_ANALYSIS_FAILED (the lead itself is never modified or deleted)
 */
export async function runLeadAnalysis(
  lead: AnalysisLeadInput,
  options: { actorUserId?: string | null } = {},
): Promise<AnalysisRunResult> {
  // Recording the start marker is best effort. A timeline write must never be
  // the reason an already-persisted lead looks like a failed operation.
  try {
    await recordActivity({
      clinicId: lead.clinicId,
      leadId: lead.id,
      type: ActivityType.AI_ANALYSIS_STARTED,
      description: "AI qualification started.",
      actorUserId: options.actorUserId ?? null,
    });
  } catch (error) {
    console.error("[lead-analysis] could not record the analysis start", {
      leadId: lead.id,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  try {
    const { result, model } = await analyzeLead({
      name: lead.name,
      serviceInterest: lead.serviceInterest,
      preferredContactMethod: lead.preferredContactMethod,
      submittedUrgency: lead.submittedUrgency,
      message: lead.message,
      // The patient's own explicit answers are passed through so the AI uses
      // them instead of having to infer from free text.
      patientInsuranceStatus: lead.patientInsuranceStatus,
      paymentPreference: lead.paymentPreference,
    });

    await prisma.$transaction(async (tx) => {
      await tx.leadAnalysis.upsert({
        where: { leadId: lead.id },
        create: {
          clinicId: lead.clinicId,
          leadId: lead.id,
          leadScore: result.leadScore,
          priority: result.priority,
          urgency: result.urgency,
          intent: result.intent,
          serviceCategory: result.serviceCategory,
          treatmentValuePotential: result.treatmentValuePotential,
          painNeedLevel: result.painNeedLevel,
          insuranceStatus: result.insuranceStatus,
          paymentReadiness: result.paymentReadiness,
          followUpPriority: result.followUpPriority,
          recommendedFollowUpMinutes: result.recommendedFollowUpMinutes,
          summary: result.summary,
          recommendedAction: result.recommendedAction,
          draftReply: result.draftReply,
          model,
        },
        update: {
          leadScore: result.leadScore,
          priority: result.priority,
          urgency: result.urgency,
          intent: result.intent,
          serviceCategory: result.serviceCategory,
          treatmentValuePotential: result.treatmentValuePotential,
          painNeedLevel: result.painNeedLevel,
          insuranceStatus: result.insuranceStatus,
          paymentReadiness: result.paymentReadiness,
          followUpPriority: result.followUpPriority,
          recommendedFollowUpMinutes: result.recommendedFollowUpMinutes,
          summary: result.summary,
          recommendedAction: result.recommendedAction,
          draftReply: result.draftReply,
          model,
        },
      });

      await upsertAiFollowUpTask({
        client: tx,
        clinicId: lead.clinicId,
        leadId: lead.id,
        leadName: lead.name,
        analysis: {
          followUpPriority: result.followUpPriority,
          recommendedFollowUpMinutes: result.recommendedFollowUpMinutes,
          recommendedAction: result.recommendedAction,
        },
        diagnostic: process.env.E2E_DB_DIAGNOSTIC === "true",
      });
    });

    // The analysis row and the AI follow-up task are written. The timeline
    // marker is best effort: a write failure here must not downgrade an
    // analysis that has already been stored.
    try {
      await recordActivity({
        clinicId: lead.clinicId,
        leadId: lead.id,
        type: ActivityType.AI_ANALYSIS_COMPLETED,
        description: `AI qualification completed with a score of ${result.leadScore}/100 (${result.priority}).`,
        actorUserId: options.actorUserId ?? null,
        metadata: {
          leadScore: result.leadScore,
          priority: result.priority,
          urgency: result.urgency,
          model,
        },
      });
    } catch (error) {
      console.error("[lead-analysis] could not record the analysis completion", {
        leadId: lead.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    return {
      ok: true,
      leadScore: result.leadScore,
      priority: result.priority,
      model,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown AI analysis error";

    // Only safe, non-private diagnostics are recorded or logged.
    console.error("[lead-analysis] analysis failed", { leadId: lead.id, reason });

    // Recording the failure is best effort as well: the failure result must be
    // returned even when the timeline write fails, so the caller learns that
    // the lead itself was untouched.
    await recordActivity({
      clinicId: lead.clinicId,
      leadId: lead.id,
      type: ActivityType.AI_ANALYSIS_FAILED,
      description: "AI qualification failed. Staff can retry the analysis.",
      actorUserId: options.actorUserId ?? null,
      metadata: { reason },
    }).catch((recordError: unknown) => {
      console.error("[lead-analysis] could not record the analysis failure", {
        leadId: lead.id,
        reason: recordError instanceof Error ? recordError.message : "unknown",
      });
    });

    return { ok: false, error: reason };
  }
}

/**
 * Runs analysis for a lead after verifying it belongs to the clinic.
 * Used by the lead submission flow and by manual retries.
 */
export async function runLeadAnalysisForClinic(
  clinicId: string,
  leadId: string,
  options: { actorUserId?: string | null } = {},
): Promise<AnalysisRunResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, clinicId },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  return runLeadAnalysis(lead, options);
}

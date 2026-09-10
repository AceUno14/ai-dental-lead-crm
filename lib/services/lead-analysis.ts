import { prisma } from "@/lib/db/prisma";
import { analyzeLead } from "@/lib/ai/analyze-lead";
import { recordActivity } from "@/lib/services/activities";
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
  await recordActivity({
    clinicId: lead.clinicId,
    leadId: lead.id,
    type: ActivityType.AI_ANALYSIS_STARTED,
    description: "AI qualification started.",
    actorUserId: options.actorUserId ?? null,
  });

  try {
    const { result, model } = await analyzeLead({
      name: lead.name,
      serviceInterest: lead.serviceInterest,
      preferredContactMethod: lead.preferredContactMethod,
      submittedUrgency: lead.submittedUrgency,
      message: lead.message,
    });

    await prisma.leadAnalysis.upsert({
      where: { leadId: lead.id },
      create: {
        clinicId: lead.clinicId,
        leadId: lead.id,
        leadScore: result.leadScore,
        priority: result.priority,
        urgency: result.urgency,
        intent: result.intent,
        serviceCategory: result.serviceCategory,
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
        summary: result.summary,
        recommendedAction: result.recommendedAction,
        draftReply: result.draftReply,
        model,
      },
    });

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

    await recordActivity({
      clinicId: lead.clinicId,
      leadId: lead.id,
      type: ActivityType.AI_ANALYSIS_FAILED,
      description: "AI qualification failed. Staff can retry the analysis.",
      actorUserId: options.actorUserId ?? null,
      metadata: { reason },
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

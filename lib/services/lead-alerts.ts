import { getEmailMode, getAlertRecipient, sendEmail } from "@/lib/email/email";
import { recordActivity } from "@/lib/services/activities";
import { ActivityType, LeadPriority, FollowUpPriority } from "@/lib/generated/prisma/enums";
import type { LeadAnalysis } from "@/lib/generated/prisma/client";
import { URGENCY_LABELS } from "@/lib/ai/scoring";

/**
 * Staff email alerts for important leads (DC-009).
 *
 * An alert fires when a lead is HOT and/or its follow-up priority is
 * IMMEDIATE. Alerts are strictly best-effort:
 *   - no recipient configured  -> skipped silently (no failure noise)
 *   - send fails               -> recorded as EMAIL_ALERT_FAILED, never thrown
 *   - send succeeds            -> recorded as EMAIL_ALERT_SENT
 *
 * The email carries operational CRM information only: no medical history, no
 * diagnosis, no message body, no contact details beyond the patient name.
 */

export type AlertLead = {
  id: string;
  name: string;
  clinicId: string;
};

export type AlertDecision =
  | { send: false; reason: "not_important" | "no_recipient" }
  | { send: true; subject: string; text: string };

export function shouldSendLeadAlert(analysis: {
  priority: string;
  followUpPriority: string;
}): boolean {
  return analysis.priority === LeadPriority.HOT || analysis.followUpPriority === FollowUpPriority.IMMEDIATE;
}

export function buildLeadAlertEmail(input: {
  lead: AlertLead;
  analysis: Pick<
    LeadAnalysis,
    "leadScore" | "priority" | "urgency" | "serviceCategory" | "recommendedAction" | "followUpPriority"
  >;
  leadUrl: string;
}): { subject: string; text: string } {
  const { lead, analysis, leadUrl } = input;
  const category = analysis.serviceCategory.toLowerCase().replace(/_/g, " ");
  const urgency = URGENCY_LABELS[analysis.urgency] ?? analysis.urgency;

  // The subject must always name the actual priority so staff can triage from
  // the inbox (a WARM lead can alert when its follow-up priority is IMMEDIATE).
  const subject = `${analysis.priority} dental lead — ${category} enquiry (${analysis.leadScore}/100)`;

  const text = [
    `Patient: ${lead.name}`,
    `Priority: ${analysis.priority}`,
    `Score: ${analysis.leadScore}/100`,
    `Treatment: ${category}`,
    `Urgency: ${urgency}`,
    `Follow-up: ${analysis.followUpPriority}`,
    "",
    "Recommended action:",
    analysis.recommendedAction,
    "",
    `Open lead: ${leadUrl}`,
    "",
    "AI-generated recommendation — review before acting. This is a lead qualification notice, not medical advice.",
  ].join("\n");

  return { subject, text };
}

/**
 * Decides, builds, sends and records the alert for a freshly analysed lead.
 * Never throws: every failure path resolves so the caller's lead pipeline
 * keeps running.
 */
export async function sendLeadAlertIfNeeded(input: {
  lead: AlertLead;
  analysis: LeadAnalysis;
  appUrl: string;
}): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  try {
    if (!shouldSendLeadAlert(input.analysis)) {
      return { sent: false, skipped: true };
    }

    const recipient = getAlertRecipient();

    if (!recipient) {
      return { sent: false, skipped: true };
    }

    const leadUrl = `${input.appUrl.replace(/\/+$/, "")}/leads/${input.lead.id}`;
    const { subject, text } = buildLeadAlertEmail({
      lead: input.lead,
      analysis: input.analysis,
      leadUrl,
    });

    const result = await sendEmail({ to: recipient, subject, text });

    if (result.ok) {
      await recordActivity({
        clinicId: input.lead.clinicId,
        leadId: input.lead.id,
        type: ActivityType.EMAIL_ALERT_SENT,
        description: `Lead alert email sent to clinic staff (${getEmailMode()} mode).`,
        metadata: { messageId: result.messageId, mode: result.mode, subject },
      });

      return { sent: true, skipped: false };
    }

    await recordActivity({
      clinicId: input.lead.clinicId,
      leadId: input.lead.id,
      type: ActivityType.EMAIL_ALERT_FAILED,
      description: "Lead alert email could not be sent. The lead is unaffected.",
      metadata: { mode: result.mode, reason: result.error },
    });

    return { sent: false, skipped: false, error: result.error };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown alert error";

    await recordActivity({
      clinicId: input.lead.clinicId,
      leadId: input.lead.id,
      type: ActivityType.EMAIL_ALERT_FAILED,
      description: "Lead alert email could not be sent. The lead is unaffected.",
      metadata: { reason },
    }).catch(() => {});

    return { sent: false, skipped: false, error: reason };
  }
}

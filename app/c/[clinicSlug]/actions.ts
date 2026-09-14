"use server";

import { findPublicClinicBySlug } from "@/lib/services/clinics";
import { createPublicLead, findRecentDuplicateLead } from "@/lib/services/leads";
import { runLeadAnalysis } from "@/lib/services/lead-analysis";
import { sendLeadAlertIfNeeded } from "@/lib/services/lead-alerts";
import { getServerEnv } from "@/lib/validation/env";
import { prisma } from "@/lib/db/prisma";
import { clinicSlugSchema, publicLeadSchema } from "@/lib/validation/lead";
import type { ActionState } from "@/types";

const SAFE_ERROR =
  "We could not submit your enquiry right now. Please try again, or call the clinic directly.";

const SUCCESS_MESSAGE =
  "Thank you — your enquiry has been received and the clinic will contact you.";

const ALREADY_RECEIVED_MESSAGE = "Your enquiry has already been received.";

/** A safe, non-identifying reason for a server log line. */
function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

/**
 * Returns the visitor's own input so a failed submission does not lose their
 * enquiry text. Only the public form fields are echoed back, and the echoed
 * values are never used for authorization or validation.
 */
function submittedValues(formData: FormData): Record<string, string> {
  const fields = [
    "name",
    "email",
    "phone",
    "serviceInterest",
    "preferredContactMethod",
    "urgency",
    "patientInsuranceStatus",
    "paymentPreference",
    "message",
    // The consent checkbox is echoed back too so a failed submission does not
    // silently uncheck an answer the visitor already gave. The server still
    // requires fresh consent on the next submission.
    "consent",
  ];
  const values: Record<string, string> = {};

  for (const field of fields) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }

  return values;
}

type PersistedLead = Awaited<ReturnType<typeof createPublicLead>>;

/**
 * Best-effort work that runs AFTER the enquiry is safely stored.
 *
 * Architectural invariant: the lead is persisted before any AI work, so this
 * function must never throw — an AI outage, an alert failure or an invalid
 * environment value may never be turned into a failed submission for the
 * visitor. Every failure is logged (without lead content) and, where possible,
 * recorded on the lead by the analysis service so staff can retry from the CRM.
 */
async function qualifyAndAlert(lead: PersistedLead): Promise<void> {
  try {
    const analysisResult = await runLeadAnalysis(lead);

    if (!analysisResult.ok) {
      // Already recorded as AI_ANALYSIS_FAILED on the lead; nothing more to do.
      return;
    }

    const analysis = await prisma.leadAnalysis.findUnique({ where: { leadId: lead.id } });

    if (!analysis) {
      return;
    }

    // Staff email alert for important leads. Best effort: skipped entirely when
    // no recipient is configured, and every failure is recorded on the timeline.
    const alertOutcome = await sendLeadAlertIfNeeded({
      lead,
      analysis,
      appUrl: getServerEnv().NEXT_PUBLIC_APP_URL,
    });

    if (alertOutcome.error) {
      console.error("[public-lead] alert email failed", { leadId: lead.id });
    }
  } catch (error) {
    console.error("[public-lead] post-persistence step failed; the enquiry is stored", {
      stage: "post-persist",
      leadId: lead.id,
      reason: failureReason(error),
    });
  }
}

/**
 * Public lead submission.
 *
 * The clinic is resolved from the public slug on the server; a browser-supplied
 * clinic identifier is never used as tenant identity.
 *
 * Two distinct phases, deliberately:
 *   1. persist  — a failure here means nothing was stored, so the visitor may
 *                 safely be asked to try again.
 *   2. everything after persistence (AI qualification, staff alert, environment
 *      lookups) is best effort and can never change the visitor's result.
 */
export async function submitLeadAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = clinicSlugSchema.safeParse(formData.get("clinicSlug"));

  if (!slug.success) {
    return { status: "error", message: SAFE_ERROR };
  }

  const parsed = publicLeadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    serviceInterest: formData.get("serviceInterest"),
    preferredContactMethod: formData.get("preferredContactMethod"),
    urgency: formData.get("urgency"),
    // Optional patient-reported answers: an empty selection is normalised to
    // UNKNOWN by the schema, never rejected.
    patientInsuranceStatus: formData.get("patientInsuranceStatus"),
    paymentPreference: formData.get("paymentPreference"),
    message: formData.get("message"),
    consent: formData.get("consent") === "on" || formData.get("consent") === "true",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values: submittedValues(formData),
    };
  }

  try {
    const clinic = await findPublicClinicBySlug(slug.data);

    if (!clinic) {
      return { status: "error", message: SAFE_ERROR };
    }

    const duplicate = await findRecentDuplicateLead({
      clinicId: clinic.id,
      email: parsed.data.email,
      message: parsed.data.message,
    });

    if (duplicate) {
      // Treat an accidental double submit as success instead of storing a
      // duplicate enquiry.
      return { status: "success", message: ALREADY_RECEIVED_MESSAGE };
    }

    // The lead is persisted first: an AI outage must never lose an enquiry.
    const lead = await createPublicLead({ clinicId: clinic.id, data: parsed.data });

    // The enquiry exists from here on, so nothing below may report a failure.
    await qualifyAndAlert(lead);

    return { status: "success", message: SUCCESS_MESSAGE };
  } catch (error) {
    console.error("[public-lead] could not persist the enquiry", {
      stage: "persist",
      reason: failureReason(error),
    });

    return {
      status: "error",
      message: SAFE_ERROR,
      values: submittedValues(formData),
    };
  }
}

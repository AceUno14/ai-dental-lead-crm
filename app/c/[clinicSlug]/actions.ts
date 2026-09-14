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

/**
 * Returns the visitor's own input so a failed submission does not lose their
 * enquiry text. Only the public form fields are echoed back.
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
  ];
  const values: Record<string, string> = {};

  for (const field of fields) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }

  return values;
}

/**
 * Public lead submission.
 *
 * The clinic is resolved from the public slug on the server; a browser-supplied
 * clinic identifier is never used as tenant identity.
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

  const clinic = await findPublicClinicBySlug(slug.data);

  if (!clinic) {
    return { status: "error", message: SAFE_ERROR };
  }

  try {
    const duplicate = await findRecentDuplicateLead({
      clinicId: clinic.id,
      email: parsed.data.email,
      message: parsed.data.message,
    });

    if (duplicate) {
      // Treat an accidental double submit as success instead of storing a
      // duplicate enquiry.
      return { status: "success", message: "Your enquiry has already been received." };
    }

    // 1. The lead is persisted first: an AI outage must never lose an enquiry.
    const lead = await createPublicLead({ clinicId: clinic.id, data: parsed.data });

    // 2. AI qualification runs afterwards and failures are recorded on the lead.
    const analysisResult = await runLeadAnalysis(lead);

    // 3. Best-effort staff email alert for important leads (HOT / IMMEDIATE).
    //    Every failure path inside is recorded on the timeline and never thrown,
    //    so the visitor still gets the success confirmation.
    if (analysisResult.ok) {
      const analysis = await prisma.leadAnalysis.findUnique({ where: { leadId: lead.id } });

      if (analysis) {
        const alertOutcome = await sendLeadAlertIfNeeded({
          lead,
          analysis,
          appUrl: getServerEnv().NEXT_PUBLIC_APP_URL,
        });

        if (alertOutcome.error) {
          console.error("[public-lead] alert email failed", { leadId: lead.id });
        }
      }
    }

    return {
      status: "success",
      message: "Thank you — your enquiry has been received and the clinic will contact you.",
    };
  } catch (error) {
    console.error("[public-lead] submission failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    return {
      status: "error",
      message: SAFE_ERROR,
      values: submittedValues(formData),
    };
  }
}

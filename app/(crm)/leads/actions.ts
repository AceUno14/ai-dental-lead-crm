"use server";

import { revalidatePath } from "next/cache";

import { requireClinicContext } from "@/lib/auth/clinic";
import { runLeadAnalysisForClinic } from "@/lib/services/lead-analysis";
import { addLeadNote, updateLeadStatus } from "@/lib/services/lead-workflow";
import {
  createLeadNoteSchema,
  retryAnalysisSchema,
  updateLeadStatusSchema,
} from "@/lib/validation/lead-actions";
import type { ActionState } from "@/types";

function revalidateLead(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function updateLeadStatusAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = updateLeadStatusSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { status: "error", message: "That status update was not valid." };
  }

  const result = await updateLeadStatus({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    status: parsed.data.status,
    actorUserId: context.userId,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Lead status updated." };
}

export async function addLeadNoteAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = createLeadNoteSchema.safeParse({
    leadId: formData.get("leadId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please write a note before saving.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await addLeadNote({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    authorUserId: context.userId,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Note added." };
}

export async function retryLeadAnalysisAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = retryAnalysisSchema.safeParse({ leadId: formData.get("leadId") });

  if (!parsed.success) {
    return { status: "error", message: "That analysis request was not valid." };
  }

  const result = await runLeadAnalysisForClinic(context.clinic.id, parsed.data.leadId, {
    actorUserId: context.userId,
  });

  revalidateLead(parsed.data.leadId);

  if (!result.ok) {
    return {
      status: "error",
      message: "AI analysis could not be completed. The lead was kept — you can retry.",
    };
  }

  return {
    status: "success",
    message: `Analysis complete: ${result.leadScore}/100 (${result.priority}).`,
  };
}

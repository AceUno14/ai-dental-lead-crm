"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isClinicOwner, requireClinicContext } from "@/lib/auth/clinic";
import { runLeadAnalysisForClinic } from "@/lib/services/lead-analysis";
import {
  OWNER_ONLY_DELETE_ERROR,
  addLeadNote,
  archiveLead,
  permanentlyDeleteLead,
  restoreLead,
  updateLeadStatus,
} from "@/lib/services/lead-workflow";
import { setFollowUpTaskStatus } from "@/lib/services/follow-up-tasks";
import {
  archiveLeadSchema,
  createLeadNoteSchema,
  deleteLeadSchema,
  restoreLeadSchema,
  retryAnalysisSchema,
  updateFollowUpTaskSchema,
  updateLeadStatusSchema,
} from "@/lib/validation/lead-actions";
import type { ActionState } from "@/types";

function revalidateLead(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

/**
 * Archives a lead. Reversible, non-destructive cleanup: the lead and all of its
 * dependent records stay in the database and it can be restored at any time.
 */
export async function archiveLeadAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = archiveLeadSchema.safeParse({ leadId: formData.get("leadId") });

  if (!parsed.success) {
    return { status: "error", message: "That lead request was not valid." };
  }

  const result = await archiveLead({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    actorUserId: context.userId,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidateLead(parsed.data.leadId);
  return {
    status: "success",
    message: "Lead archived. Nothing was deleted — you can restore it any time.",
  };
}

/**
 * Restores an archived lead so it is visible in the lead list, the dashboard
 * metrics and the open follow-up queue again.
 */
export async function restoreLeadAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = restoreLeadSchema.safeParse({ leadId: formData.get("leadId") });

  if (!parsed.success) {
    return { status: "error", message: "That lead request was not valid." };
  }

  const result = await restoreLead({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    actorUserId: context.userId,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidateLead(parsed.data.leadId);
  return { status: "success", message: "Lead restored and visible again." };
}

/**
 * Permanently deletes one clinic-owned lead, together with its AI analysis,
 * follow-up tasks, notes and activity history (removed by the database's own
 * cascade constraints).
 *
 * OWNER only. The role is taken from the membership resolved server-side by
 * `requireClinicContext` — a role from the browser is never read — and the
 * service layer independently re-checks the OWNER membership against the
 * database before it deletes anything. The confirmation value is never logged.
 */
export async function deleteLeadAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  if (!isClinicOwner(context.role)) {
    return { status: "error", message: OWNER_ONLY_DELETE_ERROR };
  }

  const parsed = deleteLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    confirmation: formData.get("confirmation"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Type DELETE to confirm permanent deletion.",
    };
  }

  const result = await permanentlyDeleteLead({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    actorUserId: context.userId,
    confirmation: parsed.data.confirmation,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  // The lead no longer exists, so its detail page cannot be revalidated.
  revalidatePath("/leads");
  revalidatePath("/dashboard");

  redirect("/leads");
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

export async function updateFollowUpTaskAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireClinicContext();

  const parsed = updateFollowUpTaskSchema.safeParse({
    leadId: formData.get("leadId"),
    taskId: formData.get("taskId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { status: "error", message: "That task update was not valid." };
  }

  const result = await setFollowUpTaskStatus({
    clinicId: context.clinic.id,
    leadId: parsed.data.leadId,
    taskId: parsed.data.taskId,
    actorUserId: context.userId,
    status: parsed.data.status,
  });

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  revalidateLead(parsed.data.leadId);

  return {
    status: "success",
    message:
      parsed.data.status === "COMPLETED"
        ? "Follow-up marked completed."
        : parsed.data.status === "CANCELLED"
          ? "Follow-up cancelled."
          : "Follow-up re-opened.",
  };
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

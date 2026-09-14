import { prisma } from "@/lib/db/prisma";
import { LEAD_STATUS_LABELS } from "@/lib/lead-labels";
import { recordActivity } from "@/lib/services/activities";
import { ActivityType } from "@/lib/generated/prisma/enums";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import { STATUS_ACTIVITY_TYPES } from "@/lib/validation/lead-actions";

export type WorkflowResult = { ok: true } | { ok: false; error: string };

/**
 * Shown whenever a permanent deletion is attempted by someone who is not the
 * clinic's owner. The role is always re-resolved from the Membership row, never
 * taken from a form field, an action argument or the browser.
 */
export const OWNER_ONLY_DELETE_ERROR =
  "Only a clinic owner can permanently delete a lead.";

/**
 * The word a user must type to confirm a permanent deletion. The lead's own
 * name is accepted as an alternative so the confirmation can never be passed by
 * accident (see `permanentlyDeleteLead`).
 */
export const DELETE_CONFIRMATION_WORD = "DELETE";

/**
 * Updates a lead status inside the authorized clinic and records the change.
 */
export async function updateLeadStatus(input: {
  clinicId: string;
  leadId: string;
  status: LeadStatus;
  actorUserId: string;
}): Promise<WorkflowResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, clinicId: input.clinicId },
    select: { id: true, status: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  if (lead.status === input.status) {
    return { ok: true };
  }

  const fromLabel = LEAD_STATUS_LABELS[lead.status];
  const toLabel = LEAD_STATUS_LABELS[input.status];

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: input.status },
    });

    await recordActivity(
      {
        clinicId: input.clinicId,
        leadId: lead.id,
        type: ActivityType.STATUS_CHANGED,
        description: `Status changed from ${fromLabel} to ${toLabel}.`,
        actorUserId: input.actorUserId,
        metadata: { from: lead.status, to: input.status },
      },
      tx,
    );

    const milestoneType = STATUS_ACTIVITY_TYPES[input.status];

    if (milestoneType) {
      await recordActivity(
        {
          clinicId: input.clinicId,
          leadId: lead.id,
          type: milestoneType,
          description: `Lead marked as ${toLabel}.`,
          actorUserId: input.actorUserId,
        },
        tx,
      );
    }
  });

  return { ok: true };
}

/**
 * Adds an internal note authored by an authorized clinic user.
 */
export async function addLeadNote(input: {
  clinicId: string;
  leadId: string;
  authorUserId: string;
  body: string;
}): Promise<WorkflowResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, clinicId: input.clinicId },
    select: { id: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.leadNote.create({
      data: {
        clinicId: input.clinicId,
        leadId: lead.id,
        authorUserId: input.authorUserId,
        body: input.body,
      },
    });

    await recordActivity(
      {
        clinicId: input.clinicId,
        leadId: lead.id,
        type: ActivityType.NOTE_ADDED,
        description: "Internal note added.",
        actorUserId: input.authorUserId,
      },
      tx,
    );
  });

  return { ok: true };
}

/**
 * Archives a lead: the reversible cleanup action.
 *
 * Archiving only sets `Lead.archivedAt`. It never deletes the lead or any of
 * its dependent records (analysis, follow-up tasks, notes, activity) and it
 * never touches `Lead.status` — being filed away is not a sales stage. The
 * archived lead drops out of the active list, the dashboard metrics and the
 * open follow-up queue, and can be restored at any time.
 *
 * Scoped to the authorized clinic, like every other mutation in this module.
 */
export async function archiveLead(input: {
  clinicId: string;
  leadId: string;
  actorUserId: string;
}): Promise<WorkflowResult> {
  return setLeadArchivedState(input, true);
}

/**
 * Restores an archived lead: clears the archive state so the lead returns to
 * the normal lead list, dashboard metrics and open follow-up queue.
 *
 * Scoped to the authorized clinic, like every other mutation in this module.
 */
export async function restoreLead(input: {
  clinicId: string;
  leadId: string;
  actorUserId: string;
}): Promise<WorkflowResult> {
  return setLeadArchivedState(input, false);
}

/**
 * Shared implementation for archive/restore.
 *
 * The lead is looked up by BOTH lead id and clinic id, so a lead belonging to
 * another clinic is indistinguishable from a missing one. The write itself is a
 * guarded `updateMany` (the current archive state is part of the WHERE clause),
 * which makes a repeated archive/restore a no-op instead of appending a
 * duplicate timeline entry.
 */
async function setLeadArchivedState(
  input: { clinicId: string; leadId: string; actorUserId: string },
  archived: boolean,
): Promise<WorkflowResult> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, clinicId: input.clinicId },
    select: { id: true, archivedAt: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  const alreadyInState = archived ? lead.archivedAt !== null : lead.archivedAt === null;

  if (alreadyInState) {
    return { ok: true };
  }

  const archivedAt = archived ? new Date() : null;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.updateMany({
      where: {
        id: lead.id,
        clinicId: input.clinicId,
        archivedAt: archived ? null : { not: null },
      },
      data: { archivedAt },
    });

    if (updated.count === 0) {
      // Another request changed the state first; the outcome is already correct.
      return;
    }

    await recordActivity(
      {
        clinicId: input.clinicId,
        leadId: lead.id,
        type: archived ? ActivityType.LEAD_ARCHIVED : ActivityType.LEAD_RESTORED,
        description: archived
          ? "Lead archived. It is hidden from the active lead list, dashboard metrics and open follow-ups. Nothing was deleted and it can be restored."
          : "Lead restored. It is visible in the lead list and dashboard again.",
        actorUserId: input.actorUserId,
      },
      tx,
    );
  });

  return { ok: true };
}

/**
 * Permanently deletes one clinic-owned lead and everything attached to it.
 *
 * This is the only destructive lead operation in the product, so it is
 * guarded in three independent ways, all server-side:
 *
 * 1. OWNER only. The caller's role is re-read from the `membership` table for
 *    this exact clinic — an action argument, form field or cookie claiming a
 *    role is never trusted.
 * 2. Tenant isolation. The lead is resolved by lead id AND clinic id, and the
 *    delete itself is a clinic-scoped `deleteMany`, so a lead from another
 *    clinic can never be reached.
 * 3. Explicit confirmation. The caller must send `DELETE` (or the lead's own
 *    name), so a stray click or repeated request cannot destroy a lead.
 *
 * Dependent rows are removed by the database's own ON DELETE CASCADE
 * constraints (verified against the live schema), so this stays a single-row
 * delete instead of a hand-written multi-table delete that could drift out of
 * sync with the constraints. Nothing about the deleted lead is logged: no name,
 * email, phone or message content.
 */
export async function permanentlyDeleteLead(input: {
  clinicId: string;
  leadId: string;
  actorUserId: string;
  confirmation: string;
}): Promise<WorkflowResult> {
  const ownerMembership = await prisma.membership.findFirst({
    where: { userId: input.actorUserId, clinicId: input.clinicId, role: "OWNER" },
    select: { id: true },
  });

  if (!ownerMembership) {
    return { ok: false, error: OWNER_ONLY_DELETE_ERROR };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, clinicId: input.clinicId },
    select: { id: true, name: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  const confirmation = input.confirmation.trim();

  if (confirmation !== DELETE_CONFIRMATION_WORD && confirmation !== lead.name.trim()) {
    return {
      ok: false,
      error: `Type ${DELETE_CONFIRMATION_WORD} (or the lead's name) to confirm permanent deletion.`,
    };
  }

  const deleted = await prisma.lead.deleteMany({
    where: { id: lead.id, clinicId: input.clinicId },
  });

  if (deleted.count === 0) {
    return { ok: false, error: "Lead not found." };
  }

  return { ok: true };
}

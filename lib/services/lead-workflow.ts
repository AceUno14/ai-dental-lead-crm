import { prisma } from "@/lib/db/prisma";
import { LEAD_STATUS_LABELS } from "@/lib/lead-labels";
import { recordActivity } from "@/lib/services/activities";
import { ActivityType } from "@/lib/generated/prisma/enums";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import { STATUS_ACTIVITY_TYPES } from "@/lib/validation/lead-actions";

export type WorkflowResult = { ok: true } | { ok: false; error: string };

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

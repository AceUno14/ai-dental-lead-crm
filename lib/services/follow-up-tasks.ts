import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "@/lib/services/activities";
import { ActivityType, FollowUpPriority, FollowUpTaskSource, FollowUpTaskStatus } from "@/lib/generated/prisma/enums";
import type { FollowUpTask, Prisma } from "@/lib/generated/prisma/client";

export type WorkflowResult = { ok: true } | { ok: false; error: string };

export type FollowUpTaskWithLead = FollowUpTask & {
  lead: { id: string; name: string };
};

// Both the shared client and the interactive transaction client the analysis
// path runs inside satisfy these slices. They are taken from
// `Prisma.TransactionClient`, whose members are the real model delegates: a
// nested `Pick<typeof prisma, "lead">` would instead describe `{ lead: … }`, so
// `.findUnique` would not exist on it.
type FollowUpTaskClient = Pick<Prisma.TransactionClient, "followUpTask" | "leadActivity">;

type FollowUpTaskDiagnosticClient = FollowUpTaskClient &
  Pick<Prisma.TransactionClient, "lead" | "leadAnalysis" | "$queryRaw">;

const AI_TASK_SOURCE = FollowUpTaskSource.AI;

/**
 * Creates or refreshes the single OPEN AI-recommended follow-up task for a
 * lead. Idempotent: retrying an analysis moves the existing open AI task to
 * the new due date instead of piling up duplicates. A task a staff member has
 * already completed is never resurrected — a fresh recommendation is created
 * only if no open or completed AI task exists.
 *
 * Returns null when the lead has no analysis (task timing is derived from it).
 */
export async function upsertAiFollowUpTask(input: {
  clinicId: string;
  leadId: string;
  leadName: string;
  analysis: {
    followUpPriority: keyof typeof FollowUpPriority;
    recommendedFollowUpMinutes: number;
    recommendedAction: string;
    treatmentCategoryLabel?: string;
  };
  now?: Date;
  client?: FollowUpTaskDiagnosticClient;
  diagnostic?: boolean;
}): Promise<FollowUpTask | null> {
  const now = input.now ?? new Date();
  const client: FollowUpTaskDiagnosticClient = input.client ?? prisma;
  const dueAt = new Date(now.getTime() + input.analysis.recommendedFollowUpMinutes * 60 * 1000);

  if (input.diagnostic) {
    const [leadRow, analysisRow, constraints] = await Promise.all([
      client.lead.findUnique({ where: { id: input.leadId }, select: { id: true } }),
      client.leadAnalysis.findUnique({
        where: { leadId: input.leadId },
        select: { id: true, leadId: true },
      }),
      client.$queryRaw<Array<{ name: string; definition: string }>>`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('follow_up_task_analysis_fkey', 'follow_up_task_lead_fkey') ORDER BY conname`,
    ]);
    console.log("[e2e-db-diagnostic] follow-up invariant", {
      leadId: input.leadId,
      leadRowId: leadRow?.id ?? null,
      analysisId: analysisRow?.id ?? null,
      analysisLeadId: analysisRow?.leadId ?? null,
      constraints,
    });
  }

  const existing = await client.followUpTask.findFirst({
    where: {
      clinicId: input.clinicId,
      leadId: input.leadId,
      source: AI_TASK_SOURCE,
      status: { in: [FollowUpTaskStatus.OPEN, FollowUpTaskStatus.COMPLETED] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.status === FollowUpTaskStatus.OPEN) {
    // Refresh the existing open AI task; do not create a duplicate.
    return client.followUpTask.update({
      where: { id: existing.id },
      data: {
        dueAt,
        priority: input.analysis.followUpPriority,
        description: input.analysis.recommendedAction,
      },
    });
  }

  if (existing?.status === FollowUpTaskStatus.COMPLETED) {
    // Staff already handled the AI recommendation. Never resurrect it and
    // never pile on new AI recommendations on later analysis retries.
    return existing;
  }

  const task = await client.followUpTask.create({
    data: {
      clinicId: input.clinicId,
      leadId: input.leadId,
      title: `AI recommendation: follow up with ${input.leadName}`,
      description: input.analysis.recommendedAction,
      dueAt,
      priority: input.analysis.followUpPriority,
      source: AI_TASK_SOURCE,
    },
  });

  await recordActivity(
    {
      clinicId: input.clinicId,
      leadId: input.leadId,
      type: ActivityType.FOLLOW_UP_CREATED,
      description: `AI-recommended follow-up task created — due ${dueAt.toISOString()}.`,
      metadata: { taskId: task.id, source: "AI", dueAt: dueAt.toISOString() },
    },
    client,
  );

  return task;
}

/**
 * Loads the tasks for a lead detail view, newest due first.
 */
export async function listLeadFollowUpTasks(
  clinicId: string,
  leadId: string,
): Promise<FollowUpTask[]> {
  return prisma.followUpTask.findMany({
    where: { clinicId, leadId },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 20,
  });
}

/**
 * Marks a task completed (or re-opens/cancels it) inside the authorized
 * clinic. Task completion is always a human decision.
 */
export async function setFollowUpTaskStatus(input: {
  clinicId: string;
  leadId: string;
  taskId: string;
  actorUserId: string;
  status: FollowUpTaskStatus;
}): Promise<WorkflowResult> {
  const task = await prisma.followUpTask.findFirst({
    where: {
      id: input.taskId,
      leadId: input.leadId,
      clinicId: input.clinicId,
    },
    select: { id: true, status: true, lead: { select: { name: true } } },
  });

  if (!task) {
    return { ok: false, error: "Follow-up task not found." };
  }

  if (task.status === input.status) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.followUpTask.update({
      where: { id: task.id },
      data: {
        status: input.status,
        completedAt: input.status === FollowUpTaskStatus.COMPLETED ? new Date() : null,
      },
    });

    if (input.status === FollowUpTaskStatus.COMPLETED) {
      await recordActivity(
        {
          clinicId: input.clinicId,
          leadId: input.leadId,
          type: ActivityType.FOLLOW_UP_COMPLETED,
          description: `Follow-up task completed for ${task.lead.name}.`,
          actorUserId: input.actorUserId,
          metadata: { taskId: task.id },
        },
        tx,
      );
    }
  });

  return { ok: true };
}

/**
 * Open tasks across the clinic, due-soonest first. Powers the dashboard's
 * "follow-ups due" card.
 */
export async function listClinicFollowUps(clinicId: string) {
  return prisma.followUpTask.findMany({
    where: { clinicId, status: FollowUpTaskStatus.OPEN },
    orderBy: { dueAt: "asc" },
    take: 20,
    select: {
      id: true,
      title: true,
      dueAt: true,
      priority: true,
      source: true,
      lead: { select: { id: true, name: true } },
    },
  });
}

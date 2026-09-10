import type { ActivityType } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type ActivityClient = Pick<typeof prisma, "leadActivity">;

export type RecordActivityInput = {
  clinicId: string;
  leadId: string;
  type: ActivityType;
  description: string;
  actorUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Appends an entry to a lead's activity timeline.
 * Activities are always attached to the lead's own clinic.
 */
export async function recordActivity(
  input: RecordActivityInput,
  client: ActivityClient = prisma,
): Promise<void> {
  await client.leadActivity.create({
    data: {
      clinicId: input.clinicId,
      leadId: input.leadId,
      type: input.type,
      description: input.description,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata,
    },
  });
}

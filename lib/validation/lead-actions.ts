import { z } from "zod";

import { ActivityType, LeadStatus } from "@/lib/generated/prisma/enums";

export const updateLeadStatusSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum([
    LeadStatus.NEW,
    LeadStatus.CONTACTED,
    LeadStatus.APPOINTMENT_SET,
    LeadStatus.WON,
    LeadStatus.LOST,
  ]),
});

export const createLeadNoteSchema = z.object({
  leadId: z.string().min(1),
  body: z
    .string()
    .trim()
    .min(1, "Note cannot be empty.")
    .max(2000, "Note must be 2000 characters or fewer."),
});

export const retryAnalysisSchema = z.object({
  leadId: z.string().min(1),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type CreateLeadNoteInput = z.infer<typeof createLeadNoteSchema>;

/**
 * Activity types that can be produced by a status change.
 */
export const STATUS_ACTIVITY_TYPES: Partial<Record<LeadStatus, ActivityType>> = {
  [LeadStatus.APPOINTMENT_SET]: ActivityType.APPOINTMENT_SET,
  [LeadStatus.WON]: ActivityType.LEAD_WON,
  [LeadStatus.LOST]: ActivityType.LEAD_LOST,
};

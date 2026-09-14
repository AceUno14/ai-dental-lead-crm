import { z } from "zod";

import {
  ActivityType,
  FollowUpTaskStatus,
  LeadStatus,
} from "@/lib/generated/prisma/enums";

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

/**
 * Archiving and restoring only need a lead id: both are reversible and are
 * always scoped to the authorized clinic inside the service layer.
 */
export const archiveLeadSchema = z.object({
  leadId: z.string().min(1),
});

export const restoreLeadSchema = z.object({
  leadId: z.string().min(1),
});

/**
 * Permanent deletion requires an explicit typed confirmation. Only the shape of
 * the value is validated here; whether it matches `DELETE` or the lead's name is
 * decided server-side in `permanentlyDeleteLead`, where the lead's name is known.
 * The value is never logged.
 */
export const deleteLeadSchema = z.object({
  leadId: z.string().min(1),
  confirmation: z
    .string()
    .trim()
    .min(1, "Type DELETE to confirm.")
    .max(120, "That confirmation is too long."),
});

export const updateFollowUpTaskSchema = z.object({
  leadId: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum([FollowUpTaskStatus.COMPLETED, FollowUpTaskStatus.OPEN, FollowUpTaskStatus.CANCELLED]),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
export type CreateLeadNoteInput = z.infer<typeof createLeadNoteSchema>;
export type UpdateFollowUpTaskInput = z.infer<typeof updateFollowUpTaskSchema>;
export type DeleteLeadInput = z.infer<typeof deleteLeadSchema>;

/**
 * Activity types that can be produced by a status change.
 */
export const STATUS_ACTIVITY_TYPES: Partial<Record<LeadStatus, ActivityType>> = {
  [LeadStatus.APPOINTMENT_SET]: ActivityType.APPOINTMENT_SET,
  [LeadStatus.WON]: ActivityType.LEAD_WON,
  [LeadStatus.LOST]: ActivityType.LEAD_LOST,
};

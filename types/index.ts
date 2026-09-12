export {
  ActivityType,
  ContactMethod,
  FollowUpPriority,
  FollowUpTaskSource,
  FollowUpTaskStatus,
  InsuranceStatus,
  LeadIntent,
  LeadPriority,
  LeadStatus,
  LeadUrgency,
  MembershipRole,
  PainNeedLevel,
  PaymentReadiness,
  ServiceCategory,
  TreatmentValuePotential,
} from "@/lib/generated/prisma/enums";

export type DashboardMetrics = {
  totalLeads: number;
  newLeads: number;
  hotLeads: number;
  appointmentsSet: number;
  followUpsDue: number;
};

export type LeadListFilters = {
  status?: string;
  priority?: string;
  search?: string;
};

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /**
   * Values echoed back after a failed submission so a form can be re-rendered
   * with the input the user already provided. Never used for authorization.
   */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };

export const updateFollowUpTaskSchemaValues = ["COMPLETED", "OPEN", "CANCELLED"] as const;

import type { LeadStatus } from "@/lib/generated/prisma/enums";

/**
 * Presentation-only labels shared by server and client components.
 * This module must stay free of database imports so it can be bundled
 * into client components safely.
 */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  APPOINTMENT_SET: "Appointment set",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "APPOINTMENT_SET",
  "WON",
  "LOST",
];

import type { LeadAnalysisResult } from "@/lib/ai/schema";

/**
 * Shared dental scoring model.
 *
 * Single source of truth for:
 *   - the component weights that build the 1-100 lead score
 *   - the score -> HOT/WARM/COLD bands
 *   - the follow-up priority and timing derived from urgency/intent
 *
 * The live AI prompt teaches the same weighting, and mock mode computes the
 * score with exactly these tables, so both modes stay consistent and the
 * behaviour is unit-testable without any AI call.
 *
 * This is sales prioritisation only. Nothing here is a clinical judgement.
 */

// Component weights (sum to 100).
export const SCORE_WEIGHTS = {
  urgency: 25,
  appointmentIntent: 20,
  treatmentValue: 20,
  painNeed: 15,
  paymentReadiness: 10,
  responsiveness: 10,
} as const;

export type Urgency = LeadAnalysisResult["urgency"];
export type Intent = LeadAnalysisResult["intent"];
export type Priority = LeadAnalysisResult["priority"];
export type FollowUpPriority = LeadAnalysisResult["followUpPriority"];

export const URGENCY_POINTS: Record<Urgency, number> = {
  EMERGENCY: 25,
  IMMEDIATE: 22,
  TODAY: 16,
  THIS_WEEK: 10,
  SOON: 6,
  FLEXIBLE: 2,
  UNKNOWN: 0,
};

export const INTENT_POINTS: Record<Intent, number> = {
  HIGH: 20,
  MEDIUM: 12,
  LOW: 5,
  UNKNOWN: 0,
};

export const TREATMENT_VALUE_POINTS: Record<
  LeadAnalysisResult["treatmentValuePotential"],
  number
> = {
  PREMIUM: 20,
  HIGH: 15,
  MEDIUM: 10,
  LOW: 4,
  UNKNOWN: 0,
};

export const PAIN_NEED_POINTS: Record<LeadAnalysisResult["painNeedLevel"], number> = {
  HIGH: 15,
  MEDIUM: 9,
  LOW: 3,
  UNKNOWN: 0,
};

/**
 * Payment readiness contributes to the score, but never punishes a patient
 * for lacking insurance: NO_INSURANCE with READY intent still scores well and
 * routes to a financing-first follow-up instead of a lower priority.
 */
export const PAYMENT_READINESS_POINTS: Record<
  LeadAnalysisResult["paymentReadiness"],
  number
> = {
  READY: 10,
  NEEDS_OPTIONS: 6,
  PRICE_SENSITIVE: 2,
  UNKNOWN: 0,
};

export const RESPONSIVENESS_POINTS: Record<LeadAnalysisResult["insuranceStatus"], number> = {
  HAS_INSURANCE: 6,
  NO_INSURANCE: 5,
  UNKNOWN: 3,
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  EMERGENCY: "Emergency",
  IMMEDIATE: "Immediate",
  TODAY: "Today",
  THIS_WEEK: "This week",
  SOON: "Soon",
  FLEXIBLE: "Flexible",
  UNKNOWN: "Unknown",
};

/** HOT >= 80, WARM >= 50, COLD otherwise. */
export function priorityFromScore(score: number): Priority {
  return score >= 80 ? "HOT" : score >= 50 ? "WARM" : "COLD";
}

export type FollowUpTiming = {
  followUpPriority: FollowUpPriority;
  recommendedFollowUpMinutes: number;
};

/**
 * Operational follow-up routing. Times are deliberately conservative: the
 * wording shown to staff never promises medical response, only contact.
 */
export function followUpTiming(input: {
  urgency: Urgency;
  intent: Intent;
}): FollowUpTiming {
  const { urgency, intent } = input;

  if (urgency === "EMERGENCY") {
    return { followUpPriority: "IMMEDIATE", recommendedFollowUpMinutes: 5 };
  }

  if (urgency === "IMMEDIATE") {
    return { followUpPriority: "IMMEDIATE", recommendedFollowUpMinutes: 10 };
  }

  if (urgency === "TODAY" && intent === "HIGH") {
    return { followUpPriority: "HIGH", recommendedFollowUpMinutes: 15 };
  }

  if (urgency === "TODAY") {
    return { followUpPriority: "HIGH", recommendedFollowUpMinutes: 60 };
  }

  if (intent === "HIGH") {
    return { followUpPriority: "HIGH", recommendedFollowUpMinutes: 120 };
  }

  if (urgency === "THIS_WEEK" || urgency === "SOON") {
    return { followUpPriority: "NORMAL", recommendedFollowUpMinutes: 240 };
  }

  if (urgency === "FLEXIBLE") {
    return { followUpPriority: "LOW", recommendedFollowUpMinutes: 1440 };
  }

  return { followUpPriority: "LOW", recommendedFollowUpMinutes: 2880 };
}

/** Full deterministic scoring pipeline used by mock mode and by tests. */
export function scoreDentalLead(input: {
  urgency: Urgency;
  intent: Intent;
  treatmentValuePotential: LeadAnalysisResult["treatmentValuePotential"];
  painNeedLevel: LeadAnalysisResult["painNeedLevel"];
  insuranceStatus: LeadAnalysisResult["insuranceStatus"];
  paymentReadiness: LeadAnalysisResult["paymentReadiness"];
}): { leadScore: number; priority: Priority } & FollowUpTiming {
  const points =
    URGENCY_POINTS[input.urgency] +
    INTENT_POINTS[input.intent] +
    TREATMENT_VALUE_POINTS[input.treatmentValuePotential] +
    PAIN_NEED_POINTS[input.painNeedLevel] +
    PAYMENT_READINESS_POINTS[input.paymentReadiness] +
    RESPONSIVENESS_POINTS[input.insuranceStatus];

  // A completely unknown enquiry must still land inside the documented 1-100
  // range rather than scoring zero.
  const leadScore = Math.min(100, Math.max(1, points));
  const priority = priorityFromScore(leadScore);
  const timing = followUpTiming({ urgency: input.urgency, intent: input.intent });

  return { leadScore, priority, ...timing };
}

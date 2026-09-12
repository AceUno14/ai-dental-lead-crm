import type { LeadAnalysisResult } from "@/lib/ai/schema";
import type { LeadPromptInput } from "@/lib/ai/prompt";
import { scoreDentalLead, followUpTiming, URGENCY_LABELS, type Urgency, type Intent } from "@/lib/ai/scoring";

/**
 * Deterministic development analyzer.
 *
 * Mock mode never performs a network request and always returns a result that
 * satisfies the AI response schema. All scoring flows through the shared
 * lib/ai/scoring model so mock and live behaviour stay consistent and unit
 * testable.
 */
const EMERGENCY_KEYWORDS = [
  "broke",
  "broken",
  "emergency",
  "urgent",
  "asap",
  "severe",
  "excruciating",
  "unbearable",
  "pain",
  "painful",
  "hurts",
  "hurting",
  "bleeding",
  "swelling",
  "swollen",
  "abscess",
  "toothache",
  "knocked out",
  "chipped",
  "cracked",
  "infected",
  "trauma",
  "can't sleep",
  "cannot sleep",
  "can t sleep",
];

const HIGH_INTENT_KEYWORDS = [
  "appointment",
  "book",
  "booking",
  "schedule",
  "come in",
  "come tomorrow",
  "earliest",
  "as soon as possible",
  "see a dentist",
  "call me to schedule",
  "please call me",
];

const MEDIUM_INTENT_KEYWORDS = [
  "available",
  "availability",
  "consultation",
  "visit",
  "how soon",
  "opening",
];

const FINANCE_KEYWORDS = [
  "insurance",
  "insured",
  "cover",
  "covered",
  "financing",
  "finance",
  "payment plan",
  "payment plans",
  "installment",
  "self-pay",
  "self pay",
  "out of pocket",
];

const PRICE_KEYWORDS = ["price", "prices", "cost", "quote", "how much", "pricing"];

const SERVICE_CATEGORY_MAP: Record<string, LeadAnalysisResult["serviceCategory"]> = {
  dental_emergency: "EMERGENCY",
  general_checkup: "GENERAL_DENTISTRY",
  cleaning: "CLEANING",
  cosmetic_consult: "COSMETIC",
  veneers: "VENEERS",
  whitening: "WHITENING",
  implants: "IMPLANTS",
  orthodontics: "ORTHODONTICS",
  root_canal: "ROOT_CANAL",
  extraction: "EXTRACTION",
  crowns: "CROWNS",
  dentures: "DENTURES",
  other: "OTHER",
};

/** Rough commercial value band per treatment interest. */
const TREATMENT_VALUE_MAP: Record<
  LeadAnalysisResult["serviceCategory"],
  LeadAnalysisResult["treatmentValuePotential"]
> = {
  EMERGENCY: "MEDIUM",
  GENERAL_DENTISTRY: "LOW",
  CLEANING: "LOW",
  COSMETIC: "HIGH",
  IMPLANTS: "PREMIUM",
  ORTHODONTICS: "PREMIUM",
  ROOT_CANAL: "HIGH",
  EXTRACTION: "MEDIUM",
  CROWNS: "HIGH",
  VENEERS: "PREMIUM",
  WHITENING: "MEDIUM",
  DENTURES: "HIGH",
  OTHER: "UNKNOWN",
  UNKNOWN: "UNKNOWN",
};

function matchesAny(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

function normaliseUrgency(value: string, emergencyHits: string[]): Urgency {
  switch (value) {
    case "IMMEDIATE":
      // Distinguish an explicitly urgent enquiry from emergency signals.
      return emergencyHits.length > 0 ? "EMERGENCY" : "IMMEDIATE";
    case "TODAY":
      return emergencyHits.length > 0 ? "EMERGENCY" : "TODAY";
    case "THIS_WEEK":
      return "THIS_WEEK";
    case "FLEXIBLE":
      return "FLEXIBLE";
    default:
      return emergencyHits.length > 0 ? "EMERGENCY" : "UNKNOWN";
  }
}

function deriveIntent(haystack: string): Intent {
  if (matchesAny(haystack, HIGH_INTENT_KEYWORDS).length > 0) {
    return "HIGH";
  }

  if (matchesAny(haystack, MEDIUM_INTENT_KEYWORDS).length > 0) {
    return "MEDIUM";
  }

  return "LOW";
}

function derivePainNeed(haystack: string, emergencyHits: string[]): LeadAnalysisResult["painNeedLevel"] {
  if (emergencyHits.length > 0) {
    return "HIGH";
  }

  if (
    matchesAny(haystack, [
      "discomfort",
      "worse",
      "worsening",
      "sensitive",
      "throbbing",
      "aching",
      "consultation",
      "replacement",
    ]).length > 0
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function deriveInsurance(haystack: string): LeadAnalysisResult["insuranceStatus"] {
  if (matchesAny(haystack, ["i have insurance", "my insurance", "we have insurance", "i'm insured", "i am insured", "covered by"]).length > 0) {
    return "HAS_INSURANCE";
  }

  if (matchesAny(haystack, ["no insurance", "don't have insurance", "do not have insurance", "without insurance", "self-pay", "self pay", "self funding", "cash"]).length > 0) {
    return "NO_INSURANCE";
  }

  return "UNKNOWN";
}

function derivePaymentReadiness(
  haystack: string,
  insuranceStatus: LeadAnalysisResult["insuranceStatus"],
): LeadAnalysisResult["paymentReadiness"] {
  if (matchesAny(haystack, ["ready to proceed", "ready to book", "ready to go ahead", "let's book", "lets book", "i want to book", "book me in"]).length > 0) {
    return "READY";
  }

  if (matchesAny(haystack, FINANCE_KEYWORDS).length > 0) {
    return "NEEDS_OPTIONS";
  }

  if (matchesAny(haystack, PRICE_KEYWORDS).length > 0) {
    return "PRICE_SENSITIVE";
  }

  // A lead whose insurance is confirmed is treated as payment-ready even
  // without an explicit payment statement.
  return insuranceStatus === "HAS_INSURANCE" ? "NEEDS_OPTIONS" : "UNKNOWN";
}

export function generateMockAnalysis(lead: LeadPromptInput): LeadAnalysisResult {
  const haystack = `${lead.message} ${lead.serviceInterest}`.toLowerCase();

  const emergencyHits = matchesAny(haystack, EMERGENCY_KEYWORDS);
  const urgency = normaliseUrgency(lead.submittedUrgency, emergencyHits);
  const intent = deriveIntent(haystack);
  const serviceCategory =
    emergencyHits.length > 0
      ? "EMERGENCY"
      : (SERVICE_CATEGORY_MAP[lead.serviceInterest] ?? "UNKNOWN");
  const treatmentValuePotential =
    serviceCategory === "EMERGENCY" && emergencyHits.length > 0
      ? "MEDIUM"
      : (TREATMENT_VALUE_MAP[serviceCategory] ?? "UNKNOWN");
  const painNeedLevel = derivePainNeed(haystack, emergencyHits);
  const insuranceStatus = deriveInsurance(haystack);
  const paymentReadiness = derivePaymentReadiness(haystack, insuranceStatus);

  const { leadScore, priority, followUpPriority, recommendedFollowUpMinutes } =
    scoreDentalLead({
      urgency,
      intent,
      treatmentValuePotential,
      painNeedLevel,
      insuranceStatus,
      paymentReadiness,
    });

  // A follow-up deadline is always derived so staff never see a missing one.
  const timing =
    followUpPriority === "LOW" || recommendedFollowUpMinutes === 0
      ? followUpTiming({ urgency, intent })
      : { followUpPriority, recommendedFollowUpMinutes };

  const summary = buildSummary({
    lead,
    urgency,
    intent,
    serviceCategory,
    treatmentValuePotential,
    painNeedLevel,
    insuranceStatus,
    paymentReadiness,
    emergencyHits,
  });
  const recommendedAction = buildRecommendedAction({
    urgency,
    intent,
    serviceCategory,
    paymentReadiness,
    recommendedFollowUpMinutes: timing.recommendedFollowUpMinutes,
  });

  return {
    leadScore,
    priority,
    urgency,
    intent,
    serviceCategory,
    treatmentValuePotential,
    painNeedLevel,
    insuranceStatus,
    paymentReadiness,
    followUpPriority: timing.followUpPriority,
    recommendedFollowUpMinutes: timing.recommendedFollowUpMinutes,
    summary,
    recommendedAction,
    draftReply: buildDraftReply(lead),
  };
}

function describePayment(
  insuranceStatus: LeadAnalysisResult["insuranceStatus"],
  paymentReadiness: LeadAnalysisResult["paymentReadiness"],
): string {
  if (paymentReadiness === "PRICE_SENSITIVE") {
    return " The enquiry asks about price, so lead with treatment options before costs.";
  }

  if (paymentReadiness === "NEEDS_OPTIONS") {
    return " The enquiry mentions insurance or financing, so have payment options ready.";
  }

  if (paymentReadiness === "READY") {
    return " The enquiry signals readiness to proceed without price discussion.";
  }

  if (insuranceStatus === "HAS_INSURANCE") {
    return " Insurance was mentioned; confirm coverage details on contact.";
  }

  return "";
}

function buildSummary(input: {
  lead: LeadPromptInput;
  urgency: Urgency;
  intent: Intent;
  serviceCategory: LeadAnalysisResult["serviceCategory"];
  treatmentValuePotential: LeadAnalysisResult["treatmentValuePotential"];
  painNeedLevel: LeadAnalysisResult["painNeedLevel"];
  insuranceStatus: LeadAnalysisResult["insuranceStatus"];
  paymentReadiness: LeadAnalysisResult["paymentReadiness"];
  emergencyHits: string[];
}): string {
  const {
    lead,
    urgency,
    intent,
    serviceCategory,
    treatmentValuePotential,
    painNeedLevel,
    emergencyHits,
  } = input;

  const urgencyText = URGENCY_LABELS[urgency].toLowerCase();
  const categoryText = serviceCategory.toLowerCase().replace(/_/g, " ");
  const intentText =
    intent === "HIGH"
      ? "and is ready to book an appointment"
      : intent === "MEDIUM"
        ? "and is open to booking a consultation"
        : "and is mainly gathering information";
  const painText =
    painNeedLevel === "HIGH"
      ? " The enquiry describes a strong immediate need that staff should clarify by phone."
      : painNeedLevel === "MEDIUM"
        ? " The enquiry mentions ongoing discomfort or a worsening concern."
        : "";

  return `Submitted enquiry (mock analysis) about ${categoryText} with ${urgencyText.toLowerCase()} response need, appointment intent ${intent.toLowerCase()}, and ${treatmentValuePotential.toLowerCase()} treatment value potential. The visitor ${urgencyText === "emergency" ? "needs urgent attention" : `wants contact ${urgencyText}`}${intentText}.${painText}${describePayment(input.insuranceStatus, input.paymentReadiness)}${
    lead.message.trim().length > 0 ? " Original message is available in the lead record." : ""
  }${emergencyHits.length > 0 ? " The enquiry contains emergency signals that staff should clarify by phone." : ""}`;
}

function buildRecommendedAction(input: {
  urgency: Urgency;
  intent: Intent;
  serviceCategory: LeadAnalysisResult["serviceCategory"];
  paymentReadiness: LeadAnalysisResult["paymentReadiness"];
  recommendedFollowUpMinutes: number;
}): string {
  const { urgency, intent, serviceCategory, paymentReadiness, recommendedFollowUpMinutes } = input;
  const categoryText = serviceCategory.toLowerCase().replace(/_/g, " ");

  if (urgency === "EMERGENCY") {
    const paymentNote =
      paymentReadiness === "NEEDS_OPTIONS"
        ? " and confirm any insurance details on the call"
        : "";

    return `Call within ${recommendedFollowUpMinutes} minutes and offer the earliest available emergency appointment${paymentNote}.`;
  }

  if (urgency === "IMMEDIATE") {
    return `Call within ${recommendedFollowUpMinutes} minutes to arrange the earliest suitable ${categoryText} appointment.`;
  }

  if (urgency === "TODAY" && intent === "HIGH") {
    return `Call within ${recommendedFollowUpMinutes} minutes and offer today's remaining ${categoryText} slots.`;
  }

  if (paymentReadiness === "PRICE_SENSITIVE") {
    return `Send a same-day message with ${categoryText} options and pricing guidance, then offer to book a consultation.`;
  }

  if (paymentReadiness === "NEEDS_OPTIONS") {
    return `Contact within ${Math.round(recommendedFollowUpMinutes / 60)} hours with ${categoryText} consultation availability and financing information.`;
  }

  if (urgency === "THIS_WEEK" || urgency === "SOON") {
    return `Contact the lead within ${Math.round(recommendedFollowUpMinutes / 60)} hours to discuss ${categoryText} availability.`;
  }

  return "Send a friendly follow-up message with general information and invite the lead to book when ready.";
}

function buildDraftReply(lead: LeadPromptInput): string {
  return [
    `Hello ${lead.name},`,
    "",
    "Thank you for contacting our dental clinic. We have received your enquiry and a member of our team will be in touch using your preferred contact method.",
    "",
    "If you would like to arrange an appointment, simply reply to this message with a couple of times that suit you and we will confirm the earliest available slot.",
    "",
    "Kind regards,",
    "The clinic team",
  ].join("\n");
}

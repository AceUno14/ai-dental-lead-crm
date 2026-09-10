import type { LeadAnalysisResult } from "@/lib/ai/schema";
import type { LeadPromptInput } from "@/lib/ai/prompt";

/**
 * Deterministic development analyzer.
 *
 * Mock mode never performs a network request and always returns a result that
 * satisfies the AI response schema.
 */
const EMERGENCY_KEYWORDS = [
  "broke",
  "broken",
  "emergency",
  "urgent",
  "asap",
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
];

const APPOINTMENT_KEYWORDS = [
  "appointment",
  "book",
  "booking",
  "schedule",
  "available",
  "availability",
  "come in",
  "visit",
  "see a dentist",
  "consultation",
];

const PRICE_KEYWORDS = ["price", "cost", "quote", "how much", "pricing", "payment plan"];

const SERVICE_CATEGORY_MAP: Record<string, LeadAnalysisResult["serviceCategory"]> = {
  dental_emergency: "EMERGENCY",
  general_checkup: "GENERAL_DENTISTRY",
  cleaning: "CLEANING",
  cosmetic_consult: "COSMETIC",
  whitening: "WHITENING",
  implants: "IMPLANTS",
  orthodontics: "ORTHODONTICS",
  root_canal: "ROOT_CANAL",
  extraction: "EXTRACTION",
  dentures: "DENTURES",
  other: "OTHER",
};

const URGENCY_SCORE: Record<string, number> = {
  IMMEDIATE: 30,
  TODAY: 20,
  THIS_WEEK: 12,
  FLEXIBLE: 4,
  UNKNOWN: 0,
};

function matchesAny(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

export function generateMockAnalysis(lead: LeadPromptInput): LeadAnalysisResult {
  const haystack = `${lead.message} ${lead.serviceInterest}`.toLowerCase();

  let score = 35;

  const urgency = normaliseUrgency(lead.submittedUrgency);
  score += URGENCY_SCORE[urgency] ?? 0;

  const emergencyHits = matchesAny(haystack, EMERGENCY_KEYWORDS);
  const appointmentHits = matchesAny(haystack, APPOINTMENT_KEYWORDS);
  const priceHits = matchesAny(haystack, PRICE_KEYWORDS);

  if (emergencyHits.length > 0) {
    score += 20;
  }

  if (appointmentHits.length > 0) {
    score += 10;
  }

  if (lead.message.trim().length >= 80) {
    score += 5;
  }

  if (priceHits.length > 0) {
    score -= 5;
  }

  if (emergencyHits.length === 0 && appointmentHits.length === 0) {
    score -= 10;
  }

  const leadScore = Math.max(0, Math.min(100, Math.round(score)));
  const priority: LeadAnalysisResult["priority"] =
    leadScore >= 80 ? "HOT" : leadScore >= 50 ? "WARM" : "COLD";

  const serviceCategory =
    emergencyHits.length > 0
      ? "EMERGENCY"
      : (SERVICE_CATEGORY_MAP[lead.serviceInterest] ?? "UNKNOWN");

  const intent: LeadAnalysisResult["intent"] =
    appointmentHits.length > 0
      ? "HIGH"
      : leadScore >= 60
        ? "MEDIUM"
        : leadScore >= 40
          ? "LOW"
          : "UNKNOWN";

  const summary = buildSummary({ lead, priority, urgency, serviceCategory, emergencyHits });
  const recommendedAction = buildRecommendedAction({ priority, urgency, serviceCategory });

  return {
    leadScore,
    priority,
    urgency,
    intent,
    serviceCategory,
    summary,
    recommendedAction,
    draftReply: buildDraftReply(lead),
  };
}

function normaliseUrgency(value: string): LeadAnalysisResult["urgency"] {
  switch (value) {
    case "IMMEDIATE":
    case "TODAY":
    case "THIS_WEEK":
    case "FLEXIBLE":
      return value;
    default:
      return "UNKNOWN";
  }
}

function buildSummary(input: {
  lead: LeadPromptInput;
  priority: LeadAnalysisResult["priority"];
  urgency: LeadAnalysisResult["urgency"];
  serviceCategory: LeadAnalysisResult["serviceCategory"];
  emergencyHits: string[];
}): string {
  const { lead, urgency, serviceCategory, emergencyHits } = input;

  const urgencyText =
    urgency === "IMMEDIATE"
      ? "reports an urgent need"
      : urgency === "TODAY"
        ? "would like to be seen within a day or two"
        : urgency === "THIS_WEEK"
          ? "would like an appointment this week"
          : "has a flexible timeframe";

  const categoryText = serviceCategory.toLowerCase().replace(/_/g, " ");
  const symptomText =
    emergencyHits.length > 0
      ? " The enquiry mentions symptoms that staff should clarify by phone."
      : "";

  return `Submitted enquiry (mock analysis) for the ${categoryText} service. The visitor ${urgencyText}.${
    lead.message.trim().length > 0 ? " Original message is available in the lead record." : ""
  }${symptomText}`;
}

function buildRecommendedAction(input: {
  priority: LeadAnalysisResult["priority"];
  urgency: LeadAnalysisResult["urgency"];
  serviceCategory: LeadAnalysisResult["serviceCategory"];
}): string {
  const { priority, urgency, serviceCategory } = input;

  if (priority === "HOT" && urgency === "IMMEDIATE") {
    return "Call the lead within 5 minutes and offer the earliest available appointment.";
  }

  if (priority === "HOT") {
    return "Call the lead today and confirm a suitable appointment time.";
  }

  if (priority === "WARM") {
    return `Call or message the lead within 24 hours to discuss the ${serviceCategory
      .toLowerCase()
      .replace(/_/g, " ")} enquiry and confirm availability.`;
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

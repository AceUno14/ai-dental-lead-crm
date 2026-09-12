import { z } from "zod";

/**
 * The AI response contract.
 *
 * Raw model output is never trusted: every response is parsed through this
 * schema before it is persisted as a LeadAnalysis row.
 *
 * Reused field equivalents (DC-001 audit):
 *   leadScore       -> score (1-100)
 *   priority        -> HOT/WARM/COLD priority
 *   urgency         -> "how quickly should staff respond?"
 *   intent          -> appointment intent (booking intent)
 *   serviceCategory -> treatment interest
 * New dental commercial dimensions:
 *   treatmentValuePotential, painNeedLevel, insuranceStatus, paymentReadiness,
 *   followUpPriority, recommendedFollowUpMinutes
 */
export const leadAnalysisSchema = z.object({
  leadScore: z
    .number()
    .int("leadScore must be a whole number.")
    .min(1, "leadScore must be between 1 and 100.")
    .max(100, "leadScore must be between 1 and 100."),
  priority: z.enum(["HOT", "WARM", "COLD"], {
    message: "priority must be HOT, WARM or COLD.",
  }),
  urgency: z.enum(
    ["EMERGENCY", "IMMEDIATE", "TODAY", "THIS_WEEK", "SOON", "FLEXIBLE", "UNKNOWN"],
    {
      message:
        "urgency must be EMERGENCY, IMMEDIATE, TODAY, THIS_WEEK, SOON, FLEXIBLE or UNKNOWN.",
    },
  ),
  intent: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"], {
    message: "intent must be HIGH, MEDIUM, LOW or UNKNOWN.",
  }),
  serviceCategory: z.enum(
    [
      "EMERGENCY",
      "GENERAL_DENTISTRY",
      "CLEANING",
      "COSMETIC",
      "IMPLANTS",
      "ORTHODONTICS",
      "ROOT_CANAL",
      "EXTRACTION",
      "CROWNS",
      "VENEERS",
      "WHITENING",
      "DENTURES",
      "OTHER",
      "UNKNOWN",
    ],
    { message: "serviceCategory must be a supported service category." },
  ),
  treatmentValuePotential: z.enum(
    ["LOW", "MEDIUM", "HIGH", "PREMIUM", "UNKNOWN"],
    {
      message: "treatmentValuePotential must be LOW, MEDIUM, HIGH, PREMIUM or UNKNOWN.",
    },
  ),
  painNeedLevel: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"], {
    message: "painNeedLevel must be HIGH, MEDIUM, LOW or UNKNOWN.",
  }),
  insuranceStatus: z.enum(["HAS_INSURANCE", "NO_INSURANCE", "UNKNOWN"], {
    message: "insuranceStatus must be HAS_INSURANCE, NO_INSURANCE or UNKNOWN.",
  }),
  paymentReadiness: z.enum(["READY", "NEEDS_OPTIONS", "PRICE_SENSITIVE", "UNKNOWN"], {
    message: "paymentReadiness must be READY, NEEDS_OPTIONS, PRICE_SENSITIVE or UNKNOWN.",
  }),
  followUpPriority: z.enum(["IMMEDIATE", "HIGH", "NORMAL", "LOW"], {
    message: "followUpPriority must be IMMEDIATE, HIGH, NORMAL or LOW.",
  }),
  recommendedFollowUpMinutes: z
    .number()
    .int("recommendedFollowUpMinutes must be a whole number.")
    .min(5, "recommendedFollowUpMinutes must be at least 5.")
    .max(4320, "recommendedFollowUpMinutes must be at most 4320 (3 days)."),
  summary: z
    .string()
    .trim()
    .min(10, "summary is too short.")
    .max(600, "summary is too long."),
  recommendedAction: z
    .string()
    .trim()
    .min(10, "recommendedAction is too short.")
    .max(600, "recommendedAction is too long."),
  draftReply: z
    .string()
    .trim()
    .min(10, "draftReply is too short.")
    .max(2000, "draftReply is too long."),
});

export type LeadAnalysisResult = z.infer<typeof leadAnalysisSchema>;

export type ParseAnalysisResult =
  | { success: true; data: LeadAnalysisResult }
  | { success: false; error: string };

/**
 * Extracts JSON from a model response and validates it.
 * Models occasionally wrap JSON in prose or code fences, so the first JSON
 * object is extracted before validation.
 */
export function parseLeadAnalysis(raw: unknown): ParseAnalysisResult {
  const candidate = typeof raw === "string" ? extractJsonObject(raw) : raw;

  if (candidate === null) {
    return { success: false, error: "AI response did not contain a JSON object." };
  }

  const parsed = leadAnalysisSchema.safeParse(candidate);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
      .join("; ");

    return { success: false, error: `AI response failed validation. ${issues}` };
  }

  return { success: true, data: parsed.data };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

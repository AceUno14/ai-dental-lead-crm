import { z } from "zod";

/**
 * The AI response contract.
 *
 * Raw model output is never trusted: every response is parsed through this
 * schema before it is persisted as a LeadAnalysis row.
 */
export const leadAnalysisSchema = z.object({
  leadScore: z
    .number()
    .int("leadScore must be a whole number.")
    .min(0, "leadScore must be between 0 and 100.")
    .max(100, "leadScore must be between 0 and 100."),
  priority: z.enum(["HOT", "WARM", "COLD"], {
    message: "priority must be HOT, WARM or COLD.",
  }),
  urgency: z.enum(["IMMEDIATE", "TODAY", "THIS_WEEK", "FLEXIBLE", "UNKNOWN"], {
    message: "urgency must be a supported urgency value.",
  }),
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
      "WHITENING",
      "DENTURES",
      "OTHER",
      "UNKNOWN",
    ],
    { message: "serviceCategory must be a supported service category." },
  ),
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

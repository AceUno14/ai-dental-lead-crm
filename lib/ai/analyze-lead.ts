import type { LeadPromptInput } from "@/lib/ai/prompt";
import { LEAD_ANALYSIS_SYSTEM_PROMPT, buildLeadUserPrompt } from "@/lib/ai/prompt";
import { generateMockAnalysis } from "@/lib/ai/mock";
import { getAiConfig, getAiMode, requestChatCompletion } from "@/lib/ai/client";
import { parseLeadAnalysis, type LeadAnalysisResult } from "@/lib/ai/schema";

export type AnalyzeLeadOutput = {
  result: LeadAnalysisResult;
  model: string;
};

export class LeadAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadAnalysisError";
  }
}

export const MOCK_MODEL_NAME = "mock-dental-qualifier-v1";

/**
 * Qualifies a single dental lead and returns a schema-validated result.
 *
 * mock mode: deterministic local analysis, no external request.
 * live mode: OpenAI-compatible provider, validated through the Zod contract.
 */
export async function analyzeLead(lead: LeadPromptInput): Promise<AnalyzeLeadOutput> {
  const mode = getAiMode();

  if (mode === "mock") {
    return {
      result: generateMockAnalysis(lead),
      model: MOCK_MODEL_NAME,
    };
  }

  const raw = await requestChatCompletion([
    { role: "system", content: LEAD_ANALYSIS_SYSTEM_PROMPT },
    { role: "user", content: buildLeadUserPrompt(lead) },
  ]);

  const parsed = parseLeadAnalysis(raw);

  if (!parsed.success) {
    throw new LeadAnalysisError(parsed.error);
  }

  return {
    result: parsed.data,
    model: getAiConfig().model ?? "unknown-model",
  };
}

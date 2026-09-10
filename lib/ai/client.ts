/**
 * Provider-agnostic runtime AI client.
 *
 * Every provider-specific detail lives in this module. Business code must not
 * import a vendor SDK directly — it calls the analysis service, which routes
 * through analyzeLead().
 *
 * Supported modes:
 *   AI_MODE=mock  deterministic local analysis, no network access
 *   AI_MODE=live  OpenAI-compatible chat completions endpoint
 */

export type AiMode = "mock" | "live";

export type AiConfig = {
  mode: AiMode;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

export function getAiMode(): AiMode {
  return process.env.AI_MODE === "live" ? "live" : "mock";
}

export function getAiConfig(): AiConfig {
  return {
    mode: getAiMode(),
    baseUrl: process.env.AI_BASE_URL?.trim() || undefined,
    apiKey: process.env.AI_API_KEY?.trim() || undefined,
    model: process.env.AI_MODEL?.trim() || undefined,
  };
}

/**
 * Live mode must fail safely when credentials are missing rather than
 * silently producing fabricated analysis.
 */
export function assertLiveConfig(config: AiConfig): Required<Omit<AiConfig, "mode">> {
  const missing: string[] = [];

  if (!config.baseUrl) missing.push("AI_BASE_URL");
  if (!config.apiKey) missing.push("AI_API_KEY");
  if (!config.model) missing.push("AI_MODEL");

  if (missing.length > 0 || !config.baseUrl || !config.apiKey || !config.model) {
    throw new AiConfigurationError(
      `Live AI mode is enabled but ${missing.join(", ")} is not configured.`,
    );
  }

  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  };
}

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

/**
 * Calls an OpenAI-compatible chat completions endpoint and returns the raw
 * assistant message content.
 */
export async function requestChatCompletion(
  messages: ChatMessage[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const config = getAiConfig();
  const { baseUrl, apiKey, model } = assertLiveConfig(config);

  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Never surface the provider response body: it may echo the API key or
      // private lead content.
      throw new AiRequestError(`AI provider request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      throw new AiRequestError("AI provider returned an empty response.");
    }

    return content;
  } catch (error) {
    if (error instanceof AiRequestError || error instanceof AiConfigurationError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRequestError("AI provider request timed out.");
    }

    throw new AiRequestError("AI provider request could not be completed.");
  } finally {
    clearTimeout(timeout);
  }
}

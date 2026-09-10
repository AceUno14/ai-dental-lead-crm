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
 *
 * `AI_BASE_URL` is the API root that already includes the provider's version
 * prefix, e.g. "https://openrouter.ai/api/v1". The client appends
 * "/chat/completions" exactly once — it tolerates a base URL that already ends
 * with "/chat/completions" so a pasted full endpoint cannot produce a doubled
 * path, and it never appends a second "/v1".
 */

export type AiMode = "mock" | "live";

export type AiConfig = {
  mode: AiMode;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
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

/** Path appended to AI_BASE_URL. Public so diagnostics can assert on it. */
export const CHAT_COMPLETIONS_PATH = "/chat/completions";

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_ERROR_BODY_CHARS = 8_192;
const MAX_PROVIDER_MESSAGE_CHARS = 300;

export function getAiMode(): AiMode {
  return process.env.AI_MODE === "live" ? "live" : "mock";
}

/**
 * Optional per-request timeout. The default is deliberately below the 60s
 * serverless function budget documented in README.md.
 */
export function getAiTimeoutMs(): number {
  const raw = process.env.AI_TIMEOUT_MS?.trim();

  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

export function getAiConfig(): AiConfig {
  return {
    mode: getAiMode(),
    baseUrl: process.env.AI_BASE_URL?.trim() || undefined,
    apiKey: process.env.AI_API_KEY?.trim() || undefined,
    model: process.env.AI_MODEL?.trim() || undefined,
    timeoutMs: getAiTimeoutMs(),
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
    timeoutMs: config.timeoutMs,
  };
}

/**
 * Builds the chat completions URL from the configured base URL.
 *
 * Idempotent and slash-tolerant: trailing slashes are removed and the
 * "/chat/completions" suffix is only added when it is not already present, so
 * neither a doubled suffix nor a doubled "/v1" can be produced.
 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");

  if (base === "") {
    throw new AiConfigurationError("AI_BASE_URL is empty.");
  }

  return base.endsWith(CHAT_COMPLETIONS_PATH) ? base : `${base}${CHAT_COMPLETIONS_PATH}`;
}

/**
 * Safe-to-log description of the provider endpoint.
 *
 * Query strings are dropped and only the host plus path are returned, so a
 * credential embedded in a query string can never reach the logs.
 */
export function describeProviderTarget(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return { host: "unparsable", path: "unparsable" };
  }
}

const SECRET_LIKE =
  /\b(?:sk|pk|rk|ak|api|key)[-_][A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/**
 * Reduces provider-supplied text to something safe to log and persist:
 * credential-shaped tokens are redacted, control characters collapsed and the
 * result truncated. Never pass lead content through here — provider error
 * bodies only.
 */
export function sanitizeProviderText(value: string, maxLength = MAX_PROVIDER_MESSAGE_CHARS): string {
  return value
    .replace(SECRET_LIKE, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export type AiProviderErrorDetails = {
  status: number;
  model: string;
  host: string;
  path: string;
  providerCode?: string | number;
  providerType?: string;
  providerMessage?: string;
};

export type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
};

type CompletionAttempt =
  | { ok: true; payload: ChatCompletionResponse }
  | { ok: false; response: Response };

/**
 * Reads a failed provider response into sanitized, diagnostic details.
 * The raw body is never surfaced verbatim.
 */
export async function readProviderErrorDetails(
  response: Response,
  model: string,
  url: string,
): Promise<AiProviderErrorDetails> {
  const { host, path } = describeProviderTarget(url);

  const details: AiProviderErrorDetails = {
    status: response.status,
    model,
    host,
    path,
  };

  let raw = "";

  try {
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);

    if (Number.isFinite(declaredLength) && declaredLength > MAX_ERROR_BODY_CHARS) {
      return details;
    }

    raw = await response.text();
  } catch {
    return details;
  }

  if (!raw) {
    return details;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.slice(0, MAX_ERROR_BODY_CHARS));
  } catch {
    details.providerMessage = sanitizeProviderText(raw);
    return details;
  }

  const error = (parsed as { error?: unknown } | null)?.error;

  if (typeof error === "string") {
    details.providerMessage = sanitizeProviderText(error);
    return details;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    if (typeof record.message === "string") {
      details.providerMessage = sanitizeProviderText(record.message);
    }

    if (typeof record.type === "string") {
      details.providerType = sanitizeProviderText(record.type, 60);
    }

    if (typeof record.code === "string" || typeof record.code === "number") {
      details.providerCode = sanitizeProviderText(String(record.code), 60);
    }

    return details;
  }

  details.providerMessage = sanitizeProviderText(raw);
  return details;
}

function providerStatusHint(status: number): string | null {
  switch (status) {
    case 400:
      return "the provider rejected the request body; check the model's supported parameters";
    case 401:
    case 403:
      return "the provider rejected the credentials in AI_API_KEY";
    case 404:
      return "the model name may not exist on this provider, or AI_BASE_URL may not be the provider's API root";
    case 429:
      return "the provider rate limited the request; retry later or use a different model";
    default:
      return null;
  }
}

/**
 * Builds the operator-facing failure message. It carries only non-sensitive
 * diagnostics: HTTP status, model name, endpoint host/path and the provider's
 * own sanitized error code/type/message.
 */
export function formatProviderErrorMessage(details: AiProviderErrorDetails): string {
  const parts = [
    `AI provider request failed with status ${details.status}.`,
    `model=${details.model}`,
    `endpoint=${details.host}${details.path}`,
  ];

  if (details.providerCode !== undefined) {
    parts.push(`providerCode=${details.providerCode}`);
  }

  if (details.providerType) {
    parts.push(`providerType=${details.providerType}`);
  }

  if (details.providerMessage) {
    parts.push(`providerMessage=${JSON.stringify(details.providerMessage)}`);
  }

  const hint = providerStatusHint(details.status);

  if (hint) {
    parts.push(`hint=${hint}`);
  }

  return parts.join(" ");
}

function readAssistantContent(payload: ChatCompletionResponse): string {
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;

  if (!content || typeof content !== "string" || content.trim() === "") {
    const finishReason = choice?.finish_reason;

    throw new AiRequestError(
      `AI provider returned an empty assistant message.${
        finishReason ? ` finish_reason=${sanitizeProviderText(finishReason, 60)}` : ""
      }`,
    );
  }

  return content;
}

/**
 * A single POST attempt. Returns the failed response instead of throwing so the
 * caller decides whether a fallback retry is worthwhile.
 */
async function postChatCompletion(input: {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CompletionAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const forwardAbort = () => controller.abort();

  if (input.signal) {
    if (input.signal.aborted) {
      controller.abort();
    } else {
      input.signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, response };
    }

    try {
      return { ok: true, payload: (await response.json()) as ChatCompletionResponse };
    } catch {
      throw new AiRequestError("AI provider returned a malformed JSON response.");
    }
  } catch (error) {
    if (error instanceof AiRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiRequestError(
        input.signal?.aborted
          ? "AI provider request was cancelled."
          : `AI provider request timed out after ${input.timeoutMs} ms.`,
      );
    }

    throw new AiRequestError("AI provider request could not be completed.");
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Some OpenAI-compatible providers reject `response_format`. The prompt already
 * requires JSON-only output and the parser tolerates prose or code fences, so a
 * single retry without it is safe and improves provider compatibility.
 */
function shouldRetryWithoutResponseFormat(details: AiProviderErrorDetails): boolean {
  if (details.status !== 400 && details.status !== 422) {
    return false;
  }

  const text = `${details.providerMessage ?? ""} ${details.providerType ?? ""}`.toLowerCase();

  return /response_format|json_object|structured|unsupported|not supported/.test(text);
}

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

  const url = resolveChatCompletionsUrl(baseUrl);
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  const first = await postChatCompletion({ url, apiKey, payload, timeoutMs, signal: options.signal });

  if (first.ok) {
    return readAssistantContent(first.payload);
  }

  const details = await readProviderErrorDetails(first.response, model, url);

  if (shouldRetryWithoutResponseFormat(details)) {
    // Same request minus response_format.
    const fallbackPayload: Record<string, unknown> = { model, messages, temperature: 0.2 };

    const second = await postChatCompletion({
      url,
      apiKey,
      payload: fallbackPayload,
      timeoutMs,
      signal: options.signal,
    });

    if (second.ok) {
      return readAssistantContent(second.payload);
    }

    throw new AiRequestError(
      formatProviderErrorMessage(
        await readProviderErrorDetails(second.response, model, url),
      ),
    );
  }

  throw new AiRequestError(formatProviderErrorMessage(details));
}

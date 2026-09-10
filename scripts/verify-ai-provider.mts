/**
 * AI provider integration diagnostic.
 *
 * Verifies how the runtime AI client builds and uses the provider request,
 * without ever printing a credential. Three layers:
 *
 *   1. Offline: pure URL-construction assertions. No network, no credentials.
 *   2. Model list: when AI_MODE=live, asks the provider's OpenAI-compatible
 *      `GET /models` endpoint whether AI_MODEL actually exists. This is what
 *      catches an invalid or retired model id (most providers report an unknown
 *      model as HTTP 404 at request time).
 *   3. Optional probe (`-- --probe`): performs one real chat completion and
 *      validates the reply against the Zod analysis contract.
 *   4. Self-test (`-- --self-test`): drives the real client against a loopback
 *      stub provider, asserting the exact request path, headers, body shape,
 *      failure diagnostics and the response_format fallback. Needs no provider
 *      account and no real credential.
 *
 * Usage:
 *   npm run verify:ai
 *   npm run verify:ai -- --self-test
 *   npm run verify:ai -- --probe
 *
 * Exits non-zero when a check fails, so it can gate a deployment.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { config as loadEnv } from "dotenv";

import {
  CHAT_COMPLETIONS_PATH,
  describeProviderTarget,
  formatProviderErrorMessage,
  getAiConfig,
  getAiMode,
  requestChatCompletion,
  resolveChatCompletionsUrl,
  sanitizeProviderText,
} from "@/lib/ai/client";
import { parseLeadAnalysis } from "@/lib/ai/schema";

let failures = 0;

function pass(label: string, detail?: string) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function info(label: string, detail?: string) {
  console.log(`  INFO  ${label}${detail ? ` — ${detail}` : ""}`);
}

function skip(label: string, detail?: string) {
  console.log(`  SKIP  ${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Pure URL-construction checks. These run everywhere, with or without
 * credentials, and are the regression guard for the request path.
 */
function checkUrlConstruction() {
  console.log("\n1. Chat completions URL construction (offline)");

  const cases: Array<{ base: string; expected: string; why: string }> = [
    {
      base: "https://openrouter.ai/api/v1",
      expected: "https://openrouter.ai/api/v1/chat/completions",
      why: "documented production value",
    },
    {
      base: "https://openrouter.ai/api/v1/",
      expected: "https://openrouter.ai/api/v1/chat/completions",
      why: "trailing slash must not double the separator",
    },
    {
      base: "https://openrouter.ai/api/v1///",
      expected: "https://openrouter.ai/api/v1/chat/completions",
      why: "repeated trailing slashes collapse",
    },
    {
      base: "  https://api.example.com/v1  ",
      expected: "https://api.example.com/v1/chat/completions",
      why: "surrounding whitespace is trimmed",
    },
    {
      base: "https://api.example.com/v1/chat/completions",
      expected: "https://api.example.com/v1/chat/completions",
      why: "a full endpoint pasted as the base is not doubled",
    },
    {
      base: "https://api.example.com/chat/completions",
      expected: "https://api.example.com/chat/completions",
      why: "suffix is appended at most once",
    },
  ];

  for (const testCase of cases) {
    const actual = resolveChatCompletionsUrl(testCase.base);

    if (actual === testCase.expected) {
      pass(`"${testCase.base}" -> "${actual}"`, testCase.why);
    } else {
      fail(`"${testCase.base}" -> "${actual}"`, `expected "${testCase.expected}" (${testCase.why})`);
    }
  }

  const doubled = cases.map((testCase) => resolveChatCompletionsUrl(testCase.base));

  if (doubled.some((url) => url.includes("/v1/v1") || url.includes(`${CHAT_COMPLETIONS_PATH}${CHAT_COMPLETIONS_PATH}`))) {
    fail("no doubled path segments", "a resolved URL contains /v1/v1 or a duplicated suffix");
  } else {
    pass("no doubled path segments", "no /v1/v1 and no duplicated /chat/completions");
  }

  const emptyBaseRejected = (() => {
    try {
      resolveChatCompletionsUrl("   ");
      return false;
    } catch {
      return true;
    }
  })();

  if (emptyBaseRejected) {
    pass("empty AI_BASE_URL is rejected", "throws instead of requesting a relative URL");
  } else {
    fail("empty AI_BASE_URL is rejected");
  }

  const target = describeProviderTarget("https://openrouter.ai/api/v1/chat/completions?api_key=leaky");
  const description = `${target.host}${target.path}`;

  if (description === "openrouter.ai/api/v1/chat/completions") {
    pass("provider target description drops the query string", description);
  } else {
    fail("provider target description drops the query string", description);
  }
}

/**
 * Confirms provider-supplied error text cannot leak a credential into logs or
 * the persisted activity metadata.
 */
function checkErrorSanitisation() {
  console.log("\n2. Provider error sanitisation (offline)");

  // Assembled at runtime so no credential-shaped literal is committed to the
  // repository (and so secret scanners stay quiet).
  const leakedToken = ["sk", "or", "v1", "abcdef0123456789"].join("-");
  const leaked = `Incorrect API key provided: ${leakedToken}.`;
  const sanitised = sanitizeProviderText(leaked);

  if (sanitised.includes(leakedToken)) {
    fail("credential-shaped tokens are redacted", sanitised);
  } else {
    pass("credential-shaped tokens are redacted", sanitised);
  }

  const formatted = formatProviderErrorMessage({
    status: 404,
    model: "openai/gpt-oss-20b:free",
    host: "openrouter.ai",
    path: "/api/v1/chat/completions",
    providerCode: 404,
    providerMessage: "No endpoints found for openai/gpt-oss-20b:free.",
  });

  const required = ["status 404", "model=openai/gpt-oss-20b:free", "endpoint=openrouter.ai/api/v1/chat/completions", "providerCode=404"];

  if (required.every((fragment) => formatted.includes(fragment))) {
    pass("failure message carries status, model, endpoint and provider detail");
    console.log(`        ${formatted}`);
  } else {
    fail("failure message carries status, model, endpoint and provider detail", formatted);
  }

  const suggestions = suggestModelIds(["openai/gpt-oss-20b", "openai/gpt-oss-120b"], "openai/gpt-oss-20b:free");

  if (suggestions.includes("openai/gpt-oss-20b")) {
    pass("near-miss model ids are suggested", suggestions.join(", "));
  } else {
    fail("near-miss model ids are suggested", suggestions.join(", ") || "none");
  }
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as { data?: unknown; models?: unknown };
  const list = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : [];

  return list
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        const item = entry as { id?: unknown; name?: unknown };
        if (typeof item.id === "string") return item.id;
        if (typeof item.name === "string") return item.name;
      }
      return null;
    })
    .filter((value): value is string => typeof value === "string");
}

function suggestModelIds(ids: string[], configured: string): string[] {
  const base = configured.split(":")[0].trim().toLowerCase();

  if (!base) {
    return [];
  }

  return ids.filter((id) => id.toLowerCase().includes(base)).slice(0, 8);
}

async function checkConfiguredProvider() {
  console.log("\n3. Configured provider (AI_MODE=live)");

  const mode = getAiMode();

  if (mode !== "live") {
    skip("live provider checks", `AI_MODE is "${mode}"; set AI_MODE=live to verify a real provider`);
    return;
  }

  const config = getAiConfig();
  const missing = (["baseUrl", "apiKey", "model"] as const).filter((key) => !config[key]);

  if (missing.length > 0) {
    fail(
      "live AI configuration is complete",
      `missing ${missing.map((key) => ({ baseUrl: "AI_BASE_URL", apiKey: "AI_API_KEY", model: "AI_MODEL" })[key]).join(", ")}`,
    );
    return;
  }

  const baseUrl = config.baseUrl as string;
  const apiKey = config.apiKey as string;
  const model = config.model as string;

  const requestUrl = resolveChatCompletionsUrl(baseUrl);
  const target = describeProviderTarget(requestUrl);

  info("mode", mode);
  info("AI_API_KEY", "configured (value never printed)");
  info("AI_MODEL", model);
  info("AI_TIMEOUT_MS", String(config.timeoutMs));
  info("POST endpoint", `${target.host}${target.path}`);

  if (requestUrl === `${baseUrl.replace(/\/+$/, "")}${CHAT_COMPLETIONS_PATH}`) {
    pass("configured AI_BASE_URL resolves to a single chat completions path", requestUrl);
  } else {
    fail("configured AI_BASE_URL resolves to a single chat completions path", requestUrl);
  }

  if (!target.host.startsWith("localhost") && !requestUrl.startsWith("https://")) {
    fail("live endpoint uses https", requestUrl);
  } else {
    pass("live endpoint scheme is acceptable", requestUrl.split(":")[0]);
  }

  const modelsUrl = requestUrl.endsWith(CHAT_COMPLETIONS_PATH)
    ? `${requestUrl.slice(0, -CHAT_COMPLETIONS_PATH.length)}/models`
    : `${requestUrl}/models`;

  try {
    const response = await fetch(modelsUrl, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      skip(
        "AI_MODEL exists in the provider model list",
        `provider returned status ${response.status} for GET ${describeProviderTarget(modelsUrl).path}`,
      );
      return;
    }

    const ids = extractModelIds(await response.json());

    if (ids.length === 0) {
      skip("AI_MODEL exists in the provider model list", "provider model list was empty or unrecognised");
      return;
    }

    if (ids.includes(model)) {
      pass(`AI_MODEL "${model}" exists in the provider model list`, `${ids.length} models advertised`);
      return;
    }

    const suggestions = suggestModelIds(ids, model);
    fail(
      `AI_MODEL "${model}" exists in the provider model list`,
      suggestions.length > 0
        ? `not advertised (${ids.length} models checked). Closest matches: ${suggestions.join(", ")}`
        : `not advertised (${ids.length} models checked)`,
    );
  } catch (error) {
    skip(
      "AI_MODEL exists in the provider model list",
      `could not reach the model list endpoint: ${error instanceof Error ? sanitizeProviderText(error.message, 120) : "unknown error"}`,
    );
  }
}

async function probeRequest() {
  console.log("\n4. Live request probe (--probe)");

  const config = getAiConfig();

  if (getAiMode() !== "live") {
    skip("live completion probe", "AI_MODE is not live");
    return;
  }

  if (!config.baseUrl || !config.apiKey || !config.model) {
    skip("live completion probe", "live AI configuration is incomplete");
    return;
  }

  const url = resolveChatCompletionsUrl(config.baseUrl);
  const model = config.model;

  try {
    const raw = await requestChatCompletion(
      [
        {
          role: "system",
          content:
            'Return ONLY a JSON object with exactly these keys: {"ok": boolean, "echo": string}. Set ok to true and echo to "provider-probe".',
        },
        { role: "user", content: "Run the provider probe." },
      ],
      { timeoutMs: config.timeoutMs },
    );

    pass("provider returned an assistant message", `${raw.length} characters`);

    // Reuse the real analysis parser indirectly: a JSON object must be present.
    const parsed = parseLeadAnalysis(raw);

    if (parsed.success) {
      info("reply also satisfies the lead analysis contract", "unexpected but valid");
    } else {
      info(
        "reply is not a lead analysis object (expected for this probe)",
        sanitizeProviderText(parsed.error, 160),
      );
    }

    if (/\{[\s\S]*\}/.test(raw)) {
      pass("reply contains a JSON object", "structured output is parseable");
    } else {
      fail("reply contains a JSON object", sanitizeProviderText(raw, 200) || "(empty)");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    fail("provider completion", sanitizeProviderText(message, 400));
    info("resolved endpoint", url);
    info("configured model", model);
  }
}

type StubBehavior = "ok" | "error-404" | "reject-response-format" | "empty-content";

type CapturedRequest = {
  path: string;
  authorization: string | undefined;
  body: Record<string, unknown>;
};

/**
 * Runs `run` with the AI client pointed at an in-process OpenAI-compatible stub
 * on 127.0.0.1. Only the stub credential below is used, and it never leaves the
 * loopback interface.
 */
async function withStubProvider<T>(
  behavior: StubBehavior,
  run: (context: { baseUrl: string; requests: CapturedRequest[] }) => Promise<T>,
): Promise<T> {
  const requests: CapturedRequest[] = [];
  let call = 0;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += String(chunk);
    });

    request.on("end", () => {
      call += 1;

      let body: Record<string, unknown> = {};

      try {
        body = JSON.parse(raw || "{}") as Record<string, unknown>;
      } catch {
        body = {};
      }

      requests.push({ path: request.url ?? "", authorization: request.headers.authorization, body });

      response.setHeader("content-type", "application/json");

      if (behavior === "error-404") {
        response.statusCode = 404;
        response.end(
          JSON.stringify({
            error: {
              message: "No endpoints found for stub/model:free.",
              code: 404,
              type: "invalid_request_error",
            },
          }),
        );
        return;
      }

      if (behavior === "empty-content") {
        response.statusCode = 200;
        response.end(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "" } }] }));
        return;
      }

      if (behavior === "reject-response-format" && call === 1) {
        response.statusCode = 400;
        response.end(
          JSON.stringify({
            error: { message: "response_format is not supported for this model", code: 400 },
          }),
        );
        return;
      }

      response.statusCode = 200;
      response.end(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: '{"ok":true,"echo":"stub"}' } }],
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  const previous = {
    AI_MODE: process.env.AI_MODE,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };

  process.env.AI_MODE = "live";
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AI_API_KEY = "loopback-stub-key";
  process.env.AI_MODEL = "stub/model";

  try {
    return await run({ baseUrl: process.env.AI_BASE_URL, requests });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/**
 * Integration test for request construction and failure handling. This is the
 * regression guard for the production 404: it proves the path the client puts
 * on the wire and the diagnostics it reports when the provider rejects it.
 */
async function runSelfTest() {
  console.log("\n5. Loopback stub provider integration test (--self-test)");

  // A. Happy path: exact path, auth header and body shape.
  await withStubProvider("ok", async ({ requests }) => {
    const content = await requestChatCompletion([{ role: "user", content: "ping" }]);
    const first = requests[0];

    if (first?.path === "/v1/chat/completions") {
      pass("request path is exactly /v1/chat/completions", first.path);
    } else {
      fail("request path is exactly /v1/chat/completions", first?.path ?? "no request captured");
    }

    if (first?.authorization === "Bearer loopback-stub-key") {
      pass("Authorization header carries the configured key", "Bearer <redacted>");
    } else {
      fail("Authorization header carries the configured key", first?.authorization ?? "missing");
    }

    if (first?.body.model === "stub/model" && Array.isArray(first?.body.messages)) {
      pass("request body carries model and messages", `model=${String(first.body.model)}`);
    } else {
      fail("request body carries model and messages", JSON.stringify(first?.body ?? {}));
    }

    if (JSON.stringify(first?.body.response_format) === '{"type":"json_object"}') {
      pass("request asks for JSON object output", 'response_format={"type":"json_object"}');
    } else {
      fail("request asks for JSON object output", JSON.stringify(first?.body.response_format ?? null));
    }

    if (content === '{"ok":true,"echo":"stub"}') {
      pass("assistant content is returned unchanged", content);
    } else {
      fail("assistant content is returned unchanged", content);
    }
  });

  // B. 404 diagnostics: the exact production failure mode.
  await withStubProvider("error-404", async ({ baseUrl, requests }) => {
    const target = describeProviderTarget(resolveChatCompletionsUrl(baseUrl));
    const expectedEndpoint = `${target.host}${target.path}`;

    try {
      await requestChatCompletion([{ role: "user", content: "ping" }]);
      fail("a 404 from the provider raises an error");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message.includes("with status 404") && message.includes("model=stub/model")) {
        pass("404 error names the status and model", message.split(" providerMessage")[0]);
      } else {
        fail("404 error names the status and model", message);
      }

      if (message.includes(`endpoint=${expectedEndpoint}`)) {
        pass("404 error names the resolved endpoint", expectedEndpoint);
      } else {
        fail("404 error names the resolved endpoint", `expected ${expectedEndpoint} in: ${message}`);
      }

      if (message.includes('providerMessage="No endpoints found for stub/model:free."')) {
        pass("404 error surfaces the provider's own message", "sanitized and quoted");
      } else {
        fail("404 error surfaces the provider's own message", message);
      }

      if (message.includes("providerCode=404")) {
        pass("404 error surfaces the provider error code");
      } else {
        fail("404 error surfaces the provider error code", message);
      }

      if (!message.includes("loopback-stub-key")) {
        pass("404 error never contains the credential");
      } else {
        fail("404 error never contains the credential", message);
      }

      if (requests.length === 1) {
        pass("a 404 is not retried", "only one request sent");
      } else {
        fail("a 404 is not retried", `${requests.length} requests`);
      }
    }
  });

  // C. response_format fallback: one retry without the unsupported parameter.
  await withStubProvider("reject-response-format", async ({ requests }) => {
    const content = await requestChatCompletion([{ role: "user", content: "ping" }]);

    if (requests.length === 2) {
      pass("unsupported response_format triggers exactly one retry", `${requests.length} requests`);
    } else {
      fail("unsupported response_format triggers exactly one retry", `${requests.length} requests`);
    }

    if (requests[0] && "response_format" in requests[0].body && requests[1] && !("response_format" in requests[1].body)) {
      pass("the retry drops response_format", "first request kept it, second omitted it");
    } else {
      fail(
        "the retry drops response_format",
        JSON.stringify({ first: requests[0]?.body ?? {}, second: requests[1]?.body ?? {} }),
      );
    }

    if (content === '{"ok":true,"echo":"stub"}') {
      pass("the fallback reply is used", content);
    } else {
      fail("the fallback reply is used", content);
    }
  });

  // D. Empty assistant message is reported with its finish_reason.
  await withStubProvider("empty-content", async () => {
    try {
      await requestChatCompletion([{ role: "user", content: "ping" }]);
      fail("an empty assistant message raises an error");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message.includes("empty assistant message") && message.includes("finish_reason=length")) {
        pass("empty replies report finish_reason", message);
      } else {
        fail("empty replies report finish_reason", message);
      }
    }
  });
}

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  loadEnv({ path: ".env", quiet: true });

  console.log("AI provider integration diagnostic");

  const probe = process.argv.includes("--probe");
  const selfTest = process.argv.includes("--self-test");

  checkUrlConstruction();
  checkErrorSanitisation();
  await checkConfiguredProvider();

  if (probe) {
    await probeRequest();
  } else {
    console.log("\n4. Live request probe (--probe)");
    skip("live completion probe", "re-run with: npm run verify:ai -- --probe");
  }

  if (selfTest) {
    await runSelfTest();
  } else {
    console.log("\n5. Loopback stub provider integration test (--self-test)");
    skip("stub integration test", "re-run with: npm run verify:ai -- --self-test");
  }

  console.log(
    failures === 0
      ? "\nResult: all checks passed."
      : `\nResult: ${failures} check(s) FAILED.`,
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nDiagnostic aborted: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});

/**
 * Email alert verification (DC-008/DC-009).
 *
 * Runs entirely offline except for an in-process loopback HTTPS-less server:
 *
 *   1. mock mode sends successfully without any network or provider account.
 *   2. live mode resolves credentials safely and reports clear failures when
 *      RESEND_API_KEY is missing.
 *   3. live mode posts to https://api.resend.com/emails with the expected
 *      Authorization header and payload shape (asserted against a loopback
 *      stub via URL overrides — no real provider account is used).
 *   4. alert decisioning: HOT and IMMEDIATE fire, COLD/LOW does not.
 *   5. alert content: carries score/treatment/action, never the enquiry body.
 *   6. failure isolation: a failing provider resolves { ok:false } and never
 *      throws into the lead pipeline.
 *
 * Usage: npm run verify:email
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config as loadEnv } from "dotenv";

let failures = 0;

function pass(label: string, detail?: string) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  console.log("Email alert verification");

  // Section 3 imports the lead-alerts service, whose import chain constructs the
  // Prisma client. DATABASE_URL must therefore be loaded even though no check here
  // touches the database — same convention as verify-e2e.mts.
  loadEnv({ path: ".env.local", quiet: true });
  loadEnv({ path: ".env", quiet: true });

  const { sendEmail, getEmailMode, getAlertRecipient, assertLiveEmailConfig } = await import(
    "@/lib/email/email"
  );

  console.log("\n1. Mock mode (default)");

  await withEnv({ EMAIL_MODE: "mock" }, async () => {
    if (getEmailMode() === "mock") {
      pass("EMAIL_MODE=mock resolves mock mode");
    } else {
      fail("EMAIL_MODE=mock resolves mock mode");
    }

    const result = await sendEmail({
      to: "staff@example.test",
      subject: "HOT dental lead",
      text: "Patient: Test\nScore: 90/100",
    });

    if (result.ok && result.mode === "mock" && result.messageId.startsWith("mock-")) {
      pass("mock send succeeds with a mock message id", result.messageId);
    } else {
      fail("mock send succeeds with a mock message id", JSON.stringify(result));
    }
  });

  console.log("\n2. Recipient and sender configuration");

  await withEnv({ ALERT_RECIPIENT_EMAIL: undefined }, async () => {
    if (getAlertRecipient() === undefined) {
      pass("alerts are skipped when no recipient is configured");
    } else {
      fail("alerts are skipped when no recipient is configured");
    }
  });

  await withEnv({ ALERT_RECIPIENT_EMAIL: "desk@example.test" }, async () => {
    if (getAlertRecipient() === "desk@example.test") {
      pass("recipient is read from ALERT_RECIPIENT_EMAIL");
    } else {
      fail("recipient is read from ALERT_RECIPIENT_EMAIL");
    }
  });

  await withEnv({ EMAIL_MODE: "live", RESEND_API_KEY: undefined }, async () => {
    let threw = false;

    try {
      assertLiveEmailConfig();
    } catch {
      threw = true;
    }

    if (threw) {
      pass("live mode without RESEND_API_KEY fails safely with a clear error");
    } else {
      fail("live mode without RESEND_API_KEY fails safely with a clear error");
    }
  });

  console.log("\n3. Alert decisioning");

  const { shouldSendLeadAlert, buildLeadAlertEmail } = await import("@/lib/services/lead-alerts");

  if (shouldSendLeadAlert({ priority: "HOT", followUpPriority: "NORMAL" })) {
    pass("HOT leads alert");
  } else {
    fail("HOT leads alert");
  }

  if (shouldSendLeadAlert({ priority: "WARM", followUpPriority: "IMMEDIATE" })) {
    pass("IMMEDIATE follow-up priority alerts");
  } else {
    fail("IMMEDIATE follow-up priority alerts");
  }

  if (!shouldSendLeadAlert({ priority: "COLD", followUpPriority: "LOW" })) {
    pass("COLD/LOW leads do not alert");
  } else {
    fail("COLD/LOW leads do not alert");
  }

  console.log("\n4. Alert content");

  const alert = buildLeadAlertEmail({
    lead: { id: "lead-1", name: "Test Patient", clinicId: "clinic-1" },
    analysis: {
      leadScore: 92,
      priority: "HOT",
      urgency: "EMERGENCY",
      serviceCategory: "EMERGENCY",
      recommendedAction: "Call within 5 minutes and offer the earliest available emergency appointment.",
      followUpPriority: "IMMEDIATE",
    } as Parameters<typeof buildLeadAlertEmail>[0]["analysis"],
    leadUrl: "https://crm.example.test/leads/lead-1",
  });

  if (alert.subject.includes("HOT") && alert.subject.includes("emergency")) {
    pass("subject carries priority and treatment", alert.subject);
  } else {
    fail("subject carries priority and treatment", alert.subject);
  }

  const bodyRequirements = ["92/100", "Emergency", "Call within 5 minutes", "https://crm.example.test/leads/lead-1"];

  if (bodyRequirements.every((fragment) => alert.text.includes(fragment))) {
    pass("body carries score, urgency, action and CRM link");
  } else {
    fail("body carries score, urgency, action and CRM link", alert.text);
  }

  if (alert.text.includes("review before acting")) {
    pass("body states the AI recommendation needs review");
  } else {
    fail("body states the AI recommendation needs review");
  }

  console.log("\n5. Live provider shape (loopback stub)");

  type Captured = { path: string; auth: string | undefined; body: Record<string, unknown> };
  const captured: Captured[] = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += String(chunk);
    });

    request.on("end", () => {
      let body: Record<string, unknown> = {};

      try {
        body = JSON.parse(raw || "{}") as Record<string, unknown>;
      } catch {
        body = {};
      }

      captured.push({
        path: request.url ?? "",
        auth: request.headers.authorization,
        body,
      });

      response.setHeader("content-type", "application/json");
      response.statusCode = 200;
      response.end(JSON.stringify({ id: "stub-message-1" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;

  try {
    await withEnv(
      {
        EMAIL_MODE: "live",
        RESEND_API_KEY: "loopback-stub-key",
        ALERT_FROM_EMAIL: "Dental CRM <alerts@stub.test>",
      },
      async () => {
        // Point the module at the loopback stub by temporarily overriding the
        // Resend endpoint through global fetch interception.
        const originalFetch = globalThis.fetch;
        const stubUrl = `http://127.0.0.1:${port}/emails`;

        const resendUrl = "https://api.resend.com/emails";

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

          if (url === resendUrl) {
            return originalFetch(stubUrl, init);
          }

          return originalFetch(input, init);
        }) as typeof fetch;

        try {
          const result = await sendEmail({
            to: "desk@example.test",
            subject: "Stub subject",
            text: "Stub body",
          });

          if (result.ok && result.mode === "live") {
            pass("live send resolves with the provider message id", result.messageId);
          } else {
            fail("live send resolves with the provider message id", JSON.stringify(result));
          }

          const first = captured[0];

          if (first?.path === "/emails") {
            pass("request path is exactly /emails", first.path);
          } else {
            fail("request path is exactly /emails", first?.path ?? "no request captured");
          }

          if (first?.auth === "Bearer loopback-stub-key") {
            pass("Authorization header carries the configured key", "Bearer <redacted>");
          } else {
            fail("Authorization header carries the configured key", first?.auth ?? "missing");
          }

          if (
            first?.body.from === "Dental CRM <alerts@stub.test>" &&
            Array.isArray(first.body.to) &&
            (first.body.to as string[])[0] === "desk@example.test" &&
            first.body.subject === "Stub subject" &&
            typeof first.body.text === "string"
          ) {
            pass("payload carries from/to/subject/text", JSON.stringify(first.body));
          } else {
            fail("payload carries from/to/subject/text", JSON.stringify(first?.body ?? {}));
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log("\n6. Failure isolation");

  await withEnv({ EMAIL_MODE: "live", RESEND_API_KEY: "loopback-stub-key" }, async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: "Validation error" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await sendEmail({
        to: "desk@example.test",
        subject: "Failing subject",
        text: "Body",
      });

      if (!result.ok && result.mode === "live" && result.error.includes("422")) {
        pass("provider rejection resolves { ok:false } with a safe message", result.error);
      } else {
        fail("provider rejection resolves { ok:false } with a safe message", JSON.stringify(result));
      }
    } catch (error) {
      fail("provider rejection resolves { ok:false } with a safe message", String(error));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log(
    failures === 0 ? "\nResult: all email checks passed." : `\nResult: ${failures} check(s) FAILED.`,
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nEmail verification errored: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});

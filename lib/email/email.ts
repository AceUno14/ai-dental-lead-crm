/**
 * Provider-agnostic outbound email layer (DC-008).
 *
 * Supported modes (EMAIL_MODE):
 *   mock  — never touches the network; resolves with a fake message id so the
 *           full alert workflow can run in local development and in tests.
 *   live  — posts to the Resend REST API using RESEND_API_KEY.
 *
 * All provider-specific detail lives here. Business code calls
 * sendEmail() and never a vendor SDK. Failures resolve to a typed result —
 * they are never thrown into the lead pipeline (an email outage must never
 * break lead capture or analysis).
 */

export type EmailMode = "mock" | "live";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional display name + address, e.g. "Dental CRM <noreply@example.com>". */
  from?: string;
};

export type EmailSendResult =
  | { ok: true; messageId: string; mode: EmailMode }
  | { ok: false; error: string; mode: EmailMode };

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export function getEmailMode(): EmailMode {
  return process.env.EMAIL_MODE === "live" ? "live" : "mock";
}

export function getEmailFrom(defaultValue = "Dental CRM <onboarding@resend.dev>"): string {
  return process.env.ALERT_FROM_EMAIL?.trim() || defaultValue;
}

/**
 * The clinic staff mailbox that receives lead alerts. Alerts are skipped
 * entirely when this is not configured — alerts are enhancement, not core.
 */
export function getAlertRecipient(): string | undefined {
  const value = process.env.ALERT_RECIPIENT_EMAIL?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** Live mode must fail safely (and clearly) when credentials are missing. */
export function assertLiveEmailConfig(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = getEmailFrom();

  if (!apiKey) {
    throw new EmailConfigurationError(
      "EMAIL_MODE=live is set but RESEND_API_KEY is not configured.",
    );
  }

  return { apiKey, from };
}

async function sendViaResend(message: EmailMessage, apiKey: string, from: string): Promise<EmailSendResult> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from ?? from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      // Read at most a small body and never echo it verbatim: it can contain
      // provider-side details that do not belong in logs or activity records.
      let detail = "";
      try {
        const body = (await response.json()) as { message?: unknown; name?: unknown };
        if (typeof body.message === "string") {
          detail = body.message.slice(0, 200);
        } else if (typeof body.name === "string") {
          detail = body.name.slice(0, 200);
        }
      } catch {
        detail = "";
      }

      return {
        ok: false,
        mode: "live",
        error: `Email provider rejected the request with status ${response.status}.${detail ? ` ${detail}` : ""}`,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: unknown };

    if (typeof payload.id !== "string" || payload.id.length === 0) {
      return { ok: false, mode: "live", error: "Email provider returned no message id." };
    }

    return { ok: true, messageId: payload.id, mode: "live" };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      error: error instanceof Error ? error.message : "Unknown email provider error",
    };
  }
}

/**
 * Sends an email through the configured provider.
 *
 * Mock mode resolves successfully without any network access; every other
 * failure resolves to { ok: false } with a safe message.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const mode = getEmailMode();

  if (mode === "mock") {
    return {
      ok: true,
      mode: "mock",
      messageId: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  try {
    const { apiKey, from } = assertLiveEmailConfig();
    return await sendViaResend(message, apiKey, from);
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      error: error instanceof Error ? error.message : "Email is not configured.",
    };
  }
}

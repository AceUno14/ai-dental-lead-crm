import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Only variables that the application genuinely needs are validated.
 * Production AI credentials are validated lazily when AI_MODE is "live".
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters."),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  AI_MODE: z.enum(["mock", "live"]).default("mock"),
  // The API root including the provider's version prefix, e.g.
  // "https://openrouter.ai/api/v1". "http(s)://" is enforced so a malformed
  // value cannot silently produce an unusable request URL.
  AI_BASE_URL: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "AI_BASE_URL must start with http:// or https://.",
    })
    .optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  // Optional per-request timeout in milliseconds. Clamped by lib/ai/client.ts.
  AI_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Outbound email (staff lead alerts). mock = no network, live = Resend.
  EMAIL_MODE: z.enum(["mock", "live"]).default("mock"),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().optional(),
  ALERT_RECIPIENT_EMAIL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid server environment configuration. ${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

import { auth } from "@/lib/auth/auth";
import { createClinicForOwner } from "@/lib/services/clinics";

export type RegisterResult = { ok: true } | { ok: false; error: string };

/**
 * Creates a clinic staff account and the clinic workspace it owns.
 *
 * Better Auth handles credential storage; this service only decides which
 * clinic the new user gets access to.
 */
export async function registerClinicOwner(input: {
  name: string;
  email: string;
  password: string;
  clinicName: string;
}): Promise<RegisterResult> {
  let userId: string | undefined;

  try {
    const created = await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
      },
    });

    userId = created?.user?.id;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (message.includes("exist")) {
      return { ok: false, error: "An account with this email address already exists." };
    }

    console.error("[onboarding] sign up failed");
    return { ok: false, error: "We could not create your account. Please try again." };
  }

  if (!userId) {
    return { ok: false, error: "We could not create your account. Please try again." };
  }

  try {
    await createClinicForOwner({ ownerUserId: userId, clinicName: input.clinicName });
  } catch (error) {
    console.error("[onboarding] clinic creation failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });

    // The account exists, so the user can still sign in; clinic access can be
    // granted later without losing the registration.
    return {
      ok: false,
      error:
        "Your account was created, but we could not set up the clinic workspace. Please sign in and contact support.",
    };
  }

  return { ok: true };
}

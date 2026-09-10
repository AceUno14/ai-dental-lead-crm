"use server";

import { redirect } from "next/navigation";

import { registerClinicOwner } from "@/lib/services/onboarding";
import { signUpSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/types";

export async function signUpAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    clinicName: formData.get("clinicName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = await registerClinicOwner(parsed.data);

  if (!result.ok) {
    return { status: "error", message: result.error };
  }

  redirect("/dashboard");
}

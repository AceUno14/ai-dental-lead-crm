"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";
import { signInSchema } from "@/lib/validation/auth";
import { initialActionState, type ActionState } from "@/types";

export async function signInAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
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

  let failed = false;

  try {
    await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
    });
  } catch {
    failed = true;
  }

  if (failed) {
    return {
      ...initialActionState,
      status: "error",
      message: "Those credentials did not match an account. Please try again.",
    };
  }

  redirect("/dashboard");
}

"use client";

import { useActionState } from "react";

import { signUpAction } from "@/app/signup/actions";
import { FormError } from "@/components/auth/auth-form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.message} />

      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          placeholder="Dr. Alex Morgan"
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <Field
        label="Clinic name"
        htmlFor="clinicName"
        hint="Used to create your private CRM workspace."
        error={state.fieldErrors?.clinicName?.[0]}
      >
        <Input
          id="clinicName"
          name="clinicName"
          autoComplete="organization"
          required
          placeholder="Bright Smile Dental"
          aria-invalid={Boolean(state.fieldErrors?.clinicName)}
        />
      </Field>

      <Field label="Work email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@clinic.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="••••••••"
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Creating account…" : "Create clinic account"}
      </Button>
    </form>
  );
}

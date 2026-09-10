"use client";

import { useActionState } from "react";

import { signInAction } from "@/app/login/actions";
import { FormError } from "@/components/auth/auth-form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { initialActionState } from "@/types";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.message} />

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

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          placeholder="••••••••"
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

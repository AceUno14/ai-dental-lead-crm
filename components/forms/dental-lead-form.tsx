"use client";

import { useActionState, useState } from "react";

import { submitLeadAction } from "@/app/c/[clinicSlug]/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  CONTACT_METHOD_OPTIONS,
  PATIENT_INSURANCE_OPTIONS,
  PAYMENT_PREFERENCE_OPTIONS,
  SERVICE_INTERESTS,
  URGENCY_OPTIONS,
} from "@/lib/validation/lead";
import type { ActionState } from "@/types";

const initialState: ActionState = { status: "idle" };

export function DentalLeadForm({ clinicSlug }: { clinicSlug: string }) {
  const [state, formAction, isPending] = useActionState(submitLeadAction, initialState);
  const fallback = state.values ?? {};

  // React 19 resets a form after every form action — including one that returned
  // an error (react.dev/blog/2024/12/05/react-19). That reset snaps the selects
  // back to their mount-time placeholder and clears the consent box, while the
  // echoed values below are not re-applied to controls that are already mounted.
  // Bumping a version on each new result remounts the fields, so a visitor keeps
  // everything they entered. Adjusting state during render is the documented way
  // to derive state from a changed value.
  const [seenState, setSeenState] = useState(state);
  const [formVersion, setFormVersion] = useState(0);

  if (seenState !== state) {
    setSeenState(state);
    setFormVersion((version) => version + 1);
  }

  if (state.status === "success") {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center"
      >
        <h2 className="text-lg font-semibold text-emerald-900">Enquiry received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-800">
          {state.message} A member of the clinic team will contact you using the details you
          provided.
        </p>
      </div>
    );
  }

  return (
    <form key={formVersion} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="clinicSlug" value={clinicSlug} />

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <Field label="Full name" htmlFor="name" error={state.fieldErrors?.name?.[0]}>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={fallback.name}
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={160}
            defaultValue={fallback.email}
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
        </Field>

        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone?.[0]}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={25}
            defaultValue={fallback.phone}
            aria-invalid={Boolean(state.fieldErrors?.phone)}
          />
        </Field>
      </div>

      <Field
        label="What can we help with?"
        htmlFor="serviceInterest"
        error={state.fieldErrors?.serviceInterest?.[0]}
      >
        <Select
          id="serviceInterest"
          name="serviceInterest"
          defaultValue={fallback.serviceInterest ?? ""}
          required
          aria-invalid={Boolean(state.fieldErrors?.serviceInterest)}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {SERVICE_INTERESTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="How soon would you like to be seen?"
          htmlFor="urgency"
          error={state.fieldErrors?.urgency?.[0]}
        >
          <Select
            id="urgency"
            name="urgency"
            defaultValue={fallback.urgency ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.urgency)}
          >
            <option value="" disabled>
              Choose a timeframe
            </option>
            {URGENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Do you have dental insurance?"
          htmlFor="patientInsuranceStatus"
          hint="Optional. Your own answer — the clinic will confirm any cover with you."
          error={state.fieldErrors?.patientInsuranceStatus?.[0]}
        >
          <Select
            id="patientInsuranceStatus"
            name="patientInsuranceStatus"
            defaultValue={fallback.patientInsuranceStatus ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.patientInsuranceStatus)}
          >
            <option value="">Prefer not to say</option>
            {PATIENT_INSURANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="How are you planning to pay?"
          htmlFor="paymentPreference"
          hint="Optional. This helps the clinic prepare the right payment options."
          error={state.fieldErrors?.paymentPreference?.[0]}
        >
          <Select
            id="paymentPreference"
            name="paymentPreference"
            defaultValue={fallback.paymentPreference ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.paymentPreference)}
          >
            <option value="">Prefer not to say</option>
            {PAYMENT_PREFERENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Preferred contact method"
          htmlFor="preferredContactMethod"
          error={state.fieldErrors?.preferredContactMethod?.[0]}
        >
          <Select
            id="preferredContactMethod"
            name="preferredContactMethod"
            defaultValue={fallback.preferredContactMethod ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.preferredContactMethod)}
          >
            <option value="" disabled>
              How should we reach you?
            </option>
            {CONTACT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="How can we help?"
        htmlFor="message"
        hint="Please do not include detailed medical history."
        error={state.fieldErrors?.message?.[0]}
      >
        <Textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={10}
          maxLength={1500}
          defaultValue={fallback.message}
          placeholder="Tell us briefly what you need and when you would like to come in."
          aria-invalid={Boolean(state.fieldErrors?.message)}
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-start gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            defaultChecked={fallback.consent === "on"}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
            aria-invalid={Boolean(state.fieldErrors?.consent)}
          />
          <label htmlFor="consent" className="text-sm text-slate-700">
            I agree to be contacted by the clinic about this enquiry.
          </label>
        </div>
        {state.fieldErrors?.consent?.[0] ? (
          <p role="alert" className="text-xs font-medium text-red-600">
            {state.fieldErrors.consent[0]}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Sending your enquiry…" : "Send my enquiry"}
      </Button>

      <p className="text-xs text-slate-500">
        This form is for appointment enquiries only. It is not for medical emergencies — please call
        the clinic or your local emergency service if you need urgent help.
      </p>
    </form>
  );
}

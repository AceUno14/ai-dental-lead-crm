import { z } from "zod";

import {
  ContactMethod,
  LeadUrgency,
  PatientInsuranceStatus,
  PaymentPreference,
} from "@/lib/generated/prisma/enums";

/**
 * Public dental lead form options.
 * Values are stable slugs; labels are what visitors see.
 */
export const SERVICE_INTERESTS = [
  { value: "dental_emergency", label: "Dental emergency / severe pain" },
  { value: "general_checkup", label: "General check-up" },
  { value: "cleaning", label: "Cleaning / hygiene" },
  { value: "cosmetic_consult", label: "Cosmetic consultation" },
  { value: "whitening", label: "Teeth whitening" },
  { value: "implants", label: "Dental implants" },
  { value: "orthodontics", label: "Braces / clear aligners" },
  { value: "root_canal", label: "Root canal" },
  { value: "extraction", label: "Tooth extraction" },
  { value: "dentures", label: "Dentures / bridges" },
  { value: "other", label: "Something else" },
] as const;

export const SERVICE_INTEREST_VALUES = SERVICE_INTERESTS.map((option) => option.value) as [
  string,
  ...string[],
];

export const URGENCY_OPTIONS = [
  { value: LeadUrgency.IMMEDIATE, label: "Today — it is urgent" },
  { value: LeadUrgency.TODAY, label: "In the next day or two" },
  { value: LeadUrgency.THIS_WEEK, label: "This week" },
  { value: LeadUrgency.FLEXIBLE, label: "I am flexible" },
] as const;

export const CONTACT_METHOD_OPTIONS = [
  { value: ContactMethod.PHONE, label: "Phone call" },
  { value: ContactMethod.EMAIL, label: "Email" },
  { value: ContactMethod.TEXT, label: "Text message" },
] as const;

/**
 * Optional patient-reported insurance question. "Not sure" and an omitted
 * answer both persist as UNKNOWN, because this is patient-reported information
 * only — it is never a verified benefits check.
 */
export const PATIENT_INSURANCE_OPTIONS = [
  { value: PatientInsuranceStatus.YES, label: "Yes" },
  { value: PatientInsuranceStatus.NO, label: "No" },
  { value: PatientInsuranceStatus.UNKNOWN, label: "Not sure" },
] as const;

/**
 * Optional patient-reported payment preference. This is a different concept
 * from the AI's paymentReadiness and is stored separately.
 */
export const PAYMENT_PREFERENCE_OPTIONS = [
  { value: PaymentPreference.INSURANCE, label: "Insurance" },
  { value: PaymentPreference.SELF_PAY, label: "Self-pay" },
  { value: PaymentPreference.FINANCING, label: "Financing / payment plan" },
  { value: PaymentPreference.UNKNOWN, label: "Not sure" },
] as const;

const PHONE_PATTERN = /^[0-9+()\-.\s]{7,25}$/;

export const publicLeadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(80, "Name must be 80 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address.")
    .max(160, "Email must be 160 characters or fewer."),
  phone: z
    .string()
    .trim()
    .regex(PHONE_PATTERN, "Please enter a valid phone number."),
  serviceInterest: z.enum(SERVICE_INTEREST_VALUES, {
    message: "Please choose the service you are interested in.",
  }),
  preferredContactMethod: z.enum(
    [ContactMethod.PHONE, ContactMethod.EMAIL, ContactMethod.TEXT],
    { message: "Please choose how we should contact you." },
  ),
  urgency: z.enum(
    [LeadUrgency.IMMEDIATE, LeadUrgency.TODAY, LeadUrgency.THIS_WEEK, LeadUrgency.FLEXIBLE],
    { message: "Please choose how soon you would like to be seen." },
  ),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more (at least 10 characters).")
    .max(1500, "Message must be 1500 characters or fewer."),
  // Optional patient-reported answers. Only the supported enum values are
  // accepted; an omitted, empty or null answer safely becomes UNKNOWN, so older
  // form clients and existing integrations stay compatible.
  patientInsuranceStatus: z
    .union(
      [
        z.enum([
          PatientInsuranceStatus.YES,
          PatientInsuranceStatus.NO,
          PatientInsuranceStatus.UNKNOWN,
        ]),
        z.literal(""),
      ],
      { message: "Please choose one of the insurance options." },
    )
    .nullish()
    .transform((value) =>
      value === undefined || value === null || value === ""
        ? PatientInsuranceStatus.UNKNOWN
        : value,
    ),
  paymentPreference: z
    .union(
      [
        z.enum([
          PaymentPreference.INSURANCE,
          PaymentPreference.SELF_PAY,
          PaymentPreference.FINANCING,
          PaymentPreference.UNKNOWN,
        ]),
        z.literal(""),
      ],
      { message: "Please choose one of the payment options." },
    )
    .nullish()
    .transform((value) =>
      value === undefined || value === null || value === ""
        ? PaymentPreference.UNKNOWN
        : value,
    ),
  consent: z.literal(true, {
    message: "Please agree to be contacted about your enquiry.",
  }),
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export const clinicSlugSchema = z
  .string()
  .trim()
  .min(2, "Invalid clinic link.")
  .max(80, "Invalid clinic link.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid clinic link.");

export function serviceInterestLabel(value: string): string {
  return SERVICE_INTERESTS.find((option) => option.value === value)?.label ?? value;
}

/**
 * Display label for a patient-reported insurance answer. UNKNOWN renders as
 * "Not sure" because it covers both "Not sure" and an unanswered question.
 */
export function patientInsuranceLabel(value: string): string {
  return PATIENT_INSURANCE_OPTIONS.find((option) => option.value === value)?.label ?? "Not sure";
}

export function paymentPreferenceLabel(value: string): string {
  return PAYMENT_PREFERENCE_OPTIONS.find((option) => option.value === value)?.label ?? "Not sure";
}

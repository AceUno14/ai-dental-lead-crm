import { z } from "zod";

import { ContactMethod, LeadUrgency } from "@/lib/generated/prisma/enums";

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

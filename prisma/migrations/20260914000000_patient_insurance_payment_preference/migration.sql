-- Additive, forward-only migration.
--
-- The public enquiry form now asks two OPTIONAL, patient-reported questions:
--   1. "Do you have dental insurance?"      -> PatientInsuranceStatus
--   2. "How are you planning to pay?"       -> PaymentPreference
--
-- Both are stored on "lead" (not "lead_analysis") because they are submitted by
-- the patient, not derived by the AI. Existing rows stay valid without a
-- backfill: both columns are NOT NULL with an UNKNOWN default.
--
-- No existing table, column, enum, index or data is modified or dropped.
-- "PatientInsuranceStatus" deliberately does not reuse the AI-only
-- "InsuranceStatus" enum (HAS_INSURANCE/NO_INSURANCE), and "PaymentPreference"
-- is deliberately separate from "PaymentReadiness".

-- CreateEnum
CREATE TYPE "PatientInsuranceStatus" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentPreference" AS ENUM ('INSURANCE', 'SELF_PAY', 'FINANCING', 'UNKNOWN');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "patientInsuranceStatus" "PatientInsuranceStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "paymentPreference" "PaymentPreference" NOT NULL DEFAULT 'UNKNOWN';

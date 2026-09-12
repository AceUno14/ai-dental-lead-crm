-- CreateEnum
CREATE TYPE "TreatmentValuePotential" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'PREMIUM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PainNeedLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('HAS_INSURANCE', 'NO_INSURANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentReadiness" AS ENUM ('READY', 'NEEDS_OPTIONS', 'PRICE_SENSITIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('IMMEDIATE', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "FollowUpTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowUpTaskSource" AS ENUM ('AI', 'STAFF', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadUrgency" ADD VALUE 'EMERGENCY';
ALTER TYPE "LeadUrgency" ADD VALUE 'SOON';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceCategory" ADD VALUE 'CROWNS';
ALTER TYPE "ServiceCategory" ADD VALUE 'VENEERS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'FOLLOW_UP_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'FOLLOW_UP_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'EMAIL_ALERT_SENT';
ALTER TYPE "ActivityType" ADD VALUE 'EMAIL_ALERT_FAILED';

-- AlterTable
ALTER TABLE "lead_analysis" ADD COLUMN     "followUpPriority" "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "insuranceStatus" "InsuranceStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "painNeedLevel" "PainNeedLevel" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "paymentReadiness" "PaymentReadiness" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "recommendedFollowUpMinutes" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "treatmentValuePotential" "TreatmentValuePotential" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "follow_up_task" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
    "source" "FollowUpTaskSource" NOT NULL DEFAULT 'STAFF',
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_task_clinicId_status_dueAt_idx" ON "follow_up_task"("clinicId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "follow_up_task_leadId_status_idx" ON "follow_up_task"("leadId", "status");

-- CreateIndex
CREATE INDEX "lead_analysis_clinicId_followUpPriority_idx" ON "lead_analysis"("clinicId", "followUpPriority");

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_lead_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_analysis_fkey" FOREIGN KEY ("leadId") REFERENCES "lead_analysis"("leadId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Additive, forward-only migration for CRM cleanup behaviour (archive / restore).
--
-- 1. "lead"."archivedAt"
--    Archiving is the normal, reversible cleanup action. NULL means the lead is
--    active; a timestamp means it is archived. The column is deliberately
--    orthogonal to "status": an archived lead keeps whatever NEW/CONTACTED/
--    APPOINTMENT_SET/WON/LOST status it already had, because "filed away" is not
--    a sales stage. It is also never used for authorization — an archived lead
--    stays readable and restorable by its own clinic.
--
--    Existing rows stay valid with no backfill (NULL = active), and no data is
--    modified, moved or dropped. The supported indexes "clinicId" and
--    "clinicId_createdAt" stay in place.
--
-- 2. "ActivityType"."LEAD_ARCHIVED" / "LEAD_RESTORED"
--    Archiving and restoring are recorded on the lead's activity timeline so
--    staff can see who filed a lead away, when, and that it was recoverable.
--
-- 3. One composite index for the predicate every lead list, dashboard metric and
--    open-follow-up query now applies: "clinicId" + "archivedAt".
--
-- Permanent deletion needs NO schema change: every dependent record
-- ("lead_analysis", "lead_note", "lead_activity", "follow_up_task") already
-- references the lead with ON DELETE CASCADE. That was verified against the live
-- constraints before this feature was implemented, so permanent deletion is a
-- single-row delete rather than a hand-written multi-table delete.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'LEAD_ARCHIVED';
ALTER TYPE "ActivityType" ADD VALUE 'LEAD_RESTORED';

-- AlterTable
ALTER TABLE "lead" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "lead_clinicId_archivedAt_idx" ON "lead"("clinicId", "archivedAt");

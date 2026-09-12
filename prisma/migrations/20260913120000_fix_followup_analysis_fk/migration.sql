-- Corrective, forward-only migration.
--
-- FollowUpTask.leadId stores Lead.id. The analysis relation must therefore target
-- the analysis' unique join key lead_analysis."leadId" — NOT lead_analysis."id".
--
-- The already-applied 20260913000000_dental_conversion_workflow migration created
-- this constraint against the wrong referenced column in this database, so the
-- named constraint is dropped and recreated. Migration history is not rewritten
-- and no other table, column, enum, index or data is touched.

-- DropForeignKey
ALTER TABLE "follow_up_task" DROP CONSTRAINT "follow_up_task_analysis_fkey";

-- AddForeignKey
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_analysis_fkey" FOREIGN KEY ("leadId") REFERENCES "lead_analysis"("leadId") ON DELETE CASCADE ON UPDATE CASCADE;

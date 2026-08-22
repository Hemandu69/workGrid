-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- AlterTable: every existing row genuinely is an individual task, so the
-- INDIVIDUAL default requires no separate backfill step.
ALTER TABLE "tasks" ADD COLUMN "taskType" "TaskType" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "tasks" ADD COLUMN "teamSection" TEXT;
ALTER TABLE "tasks" ADD COLUMN "parentTaskId" TEXT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentTaskId_fkey"
  FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tasks_organizationId_taskType_teamSection_status_idx"
  ON "tasks"("organizationId", "taskType", "teamSection", "status");

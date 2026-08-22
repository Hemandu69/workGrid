-- Purely additive: adds task progress tracking and completion timestamp.
-- Assignment/status history is NOT a new table — it reuses the existing
-- `audit_events` table (entityType = 'Task') to avoid schema bloat.
ALTER TABLE "tasks" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;

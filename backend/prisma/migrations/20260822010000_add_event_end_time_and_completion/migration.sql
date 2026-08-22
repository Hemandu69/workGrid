-- AlterTable: add scheduledEndAt (nullable first), completedAt, then backfill and lock down scheduledEndAt
ALTER TABLE "organization_events" ADD COLUMN "scheduledEndAt" TIMESTAMP(3);
ALTER TABLE "organization_events" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill existing rows using the previous implicit 1-hour LIVE window so no
-- existing event's effective status changes the moment this migration lands.
UPDATE "organization_events"
SET "scheduledEndAt" = "scheduledAt" + INTERVAL '1 hour'
WHERE "scheduledEndAt" IS NULL;

ALTER TABLE "organization_events" ALTER COLUMN "scheduledEndAt" SET NOT NULL;

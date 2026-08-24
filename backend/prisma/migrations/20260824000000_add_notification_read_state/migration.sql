-- Persistent per-user notification read state.
--
-- Purely additive: one new nullable column on "users" and one new table. No
-- existing column or row is altered, so every existing notification simply
-- starts out unread (NULL notificationsReadAllAt + no receipt row), which is
-- the correct default for a feed that previously had no persisted read state
-- at all.

-- AlterTable: bulk "mark all as read" watermark. NULL means "nothing has been
-- bulk-marked read yet" — the correct starting point for existing users.
ALTER TABLE "users" ADD COLUMN "notificationsReadAllAt" TIMESTAMP(3);

-- CreateTable: individual read receipts.
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- Makes re-marking an already-read notification an idempotent upsert rather
-- than a duplicate row, and is the index that serves the per-user read-state
-- lookup on every notification feed load.
CREATE UNIQUE INDEX "notification_reads_userId_notificationKey_key" ON "notification_reads"("userId", "notificationKey");

-- Serves the prune of receipts made redundant by a later "mark all as read".
CREATE INDEX "notification_reads_userId_readAt_idx" ON "notification_reads"("userId", "readAt");

ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

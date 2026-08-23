-- CreateTable: date-specific availability overrides. Purely additive — a new
-- table, no changes to any existing column or data.
CREATE TABLE "availability_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "state" "SlotState" NOT NULL DEFAULT 'AVAILABLE',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "availability_overrides_userId_date_hour_key" ON "availability_overrides"("userId", "date", "hour");

CREATE INDEX "availability_overrides_userId_date_idx" ON "availability_overrides"("userId", "date");

ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

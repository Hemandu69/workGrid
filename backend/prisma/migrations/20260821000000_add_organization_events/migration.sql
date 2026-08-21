-- CreateEnum
CREATE TYPE "OrgEventStatus" AS ENUM ('UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventResponseChoice" AS ENUM ('ATTENDING', 'MAYBE', 'NOT_ATTENDING');

-- CreateTable
CREATE TABLE "organization_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "OrgEventStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_event_responses" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "response" "EventResponseChoice" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_event_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_events_organizationId_status_scheduledAt_idx" ON "organization_events"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_event_responses_eventId_userId_key" ON "organization_event_responses"("eventId", "userId");

-- CreateIndex
CREATE INDEX "organization_event_responses_eventId_response_idx" ON "organization_event_responses"("eventId", "response");

-- AddForeignKey
ALTER TABLE "organization_events" ADD CONSTRAINT "organization_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_events" ADD CONSTRAINT "organization_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_event_responses" ADD CONSTRAINT "organization_event_responses_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "organization_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_event_responses" ADD CONSTRAINT "organization_event_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

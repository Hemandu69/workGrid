-- Introduce the Team domain: a standing roster of MEMBER users led by a
-- Team Lead, and event-scoped bulk positioning of a team's members into a
-- Section's subrooms. Purely additive — two new tables plus one nullable
-- FK column on "users" — nothing existing is altered or dropped, so this
-- migration carries zero data-loss risk regardless of what it runs against.
--
-- TeamEventPlacement deliberately does NOT touch the existing "roomId"/
-- "subroomId" columns on "users" (the single, global, non-event-scoped
-- "permanent desk" fields RoomService already owns) — it is a new,
-- independent axis so the same team can be positioned differently, and
-- independently, across multiple events at once.
--
-- NOT APPLIED AUTOMATICALLY — apply only after explicit approval.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "teamId" TEXT;

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_event_placements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "subroomId" TEXT NOT NULL,
    "positionedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_event_placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_organizationId_teamId_idx" ON "users"("organizationId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organizationId_name_key" ON "teams"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_event_placements_eventId_userId_key" ON "team_event_placements"("eventId", "userId");

-- CreateIndex
CREATE INDEX "team_event_placements_eventId_teamId_idx" ON "team_event_placements"("eventId", "teamId");

-- CreateIndex
CREATE INDEX "team_event_placements_eventId_subroomId_idx" ON "team_event_placements"("eventId", "subroomId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "organization_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_subroomId_fkey" FOREIGN KEY ("subroomId") REFERENCES "subrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_event_placements" ADD CONSTRAINT "team_event_placements_positionedById_fkey" FOREIGN KEY ("positionedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

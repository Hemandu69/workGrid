-- Remove the old hourly office-schedule availability model entirely.
-- WorkGrid's availability domain has moved to event-scoped attendance
-- (OrganizationEvent + OrganizationEventResponse, already in place and
-- unaffected by this migration) — a person's attendance now belongs to a
-- specific event, never to a generic hour on a generic day.
--
-- NOT APPLIED AUTOMATICALLY. Before running `prisma migrate deploy` with
-- this migration, re-verify the row counts and ownership below against
-- whatever database this runs against:
--   SELECT COUNT(*) FROM availability_slots;
--   SELECT COUNT(*) FROM availability_overrides;
--   SELECT COUNT(DISTINCT "userId") FROM availability_slots;
-- At the time this migration was written, availability_slots held 168 rows
-- and availability_overrides held 384 rows, ALL belonging to a single
-- distinct user — the seeded demo MEMBER account. There was no real
-- multi-user production history in either table.
DROP TABLE "availability_overrides";
DROP TABLE "availability_slots";
DROP TYPE "SlotState";

-- DayOfWeek was used only by the two tables above — now orphaned.
DROP TYPE "DayOfWeek";

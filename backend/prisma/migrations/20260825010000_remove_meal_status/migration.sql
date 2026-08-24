-- Remove the meal (Lunch/Dinner) feature: the MEAL value from UserStatus and
-- the preMealStatus column that backed it. NOT APPLIED AUTOMATICALLY.
--
-- At the time this migration was written, 0 users in the connected database
-- were in MEAL status or had a saved preMealStatus, so the restore-on-drop
-- below is a safety net for correctness, not a fixup for known live data.

-- Any user currently mid-meal is restored to their pre-meal status (falling
-- back to ONLINE if none was saved) rather than being silently left with a
-- status value about to be removed from the enum.
UPDATE "users" SET "status" = COALESCE("preMealStatus", 'ONLINE') WHERE "status" = 'MEAL';

ALTER TABLE "users" DROP COLUMN "preMealStatus";

-- Postgres has no DROP VALUE for enums — recreate the type without MEAL,
-- same pattern as the sibling HR-removal migration in this same batch.
CREATE TYPE "UserStatus_new" AS ENUM ('ONLINE', 'OFFLINE', 'BUSY', 'AWAY');
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "status" TYPE "UserStatus_new" USING ("status"::text::"UserStatus_new");
DROP TYPE "UserStatus";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'OFFLINE';

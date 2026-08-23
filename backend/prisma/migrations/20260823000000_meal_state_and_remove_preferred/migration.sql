-- AlterEnum: add MEAL as a generic temporary Lunch/Dinner presence state
ALTER TYPE "UserStatus" ADD VALUE 'MEAL';

-- AlterTable: pointer restored when a MEAL period ends
ALTER TABLE "users" ADD COLUMN "preMealStatus" "UserStatus";

-- Normalize legacy data before removing the PREFERRED enum value: Preferred
-- was a "soft available" concept, so it folds into Available rather than
-- being discarded or left to influence scheduling as an orphaned value.
UPDATE "availability_slots" SET "state" = 'AVAILABLE' WHERE "state" = 'PREFERRED';

-- AlterEnum: remove PREFERRED from SlotState (Postgres has no direct DROP
-- VALUE, so recreate the type without it and swap the column over).
CREATE TYPE "SlotState_new" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'BUSY');
ALTER TABLE "availability_slots" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "availability_slots" ALTER COLUMN "state" TYPE "SlotState_new" USING ("state"::text::"SlotState_new");
DROP TYPE "SlotState";
ALTER TYPE "SlotState_new" RENAME TO "SlotState";
ALTER TABLE "availability_slots" ALTER COLUMN "state" SET DEFAULT 'AVAILABLE';

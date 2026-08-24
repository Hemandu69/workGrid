-- Remove the HR role from UserRole. HR is being retired as a product role:
-- SUPER_ADMIN already holds every capability HR had (people management, role
-- assignment, account status, role-audit visibility), so no capability is
-- reassigned elsewhere — People Management simply becomes SUPER_ADMIN-only.
--
-- NOT APPLIED AUTOMATICALLY. Before running `prisma migrate deploy` with this
-- migration, re-verify with:
--   SELECT id, email, name FROM users WHERE role = 'HR';
-- against whatever database this runs against — this migration reassigns any
-- such row to MEMBER (see below) rather than deleting the account, but that
-- reassignment is only sound if you've reviewed who those accounts actually
-- are first. At the time this migration was written, exactly one such row
-- existed in the connected database (the seeded demo HR account,
-- sarah.jenkins@workgrid.corp) and 0 role_audit_logs rows other than the one
-- seeded alongside it.

-- Reassign any existing HR-role account to MEMBER — the safest, most
-- restricted landing state, matching how a newly provisioned/demoted account
-- already defaults elsewhere in this system. A SUPER_ADMIN can assign that
-- person's real role via People Management immediately after this runs.
UPDATE "users" SET "role" = 'MEMBER' WHERE "role" = 'HR';

-- role_audit_logs.previousRole/newRole are typed UserRole and cannot keep a
-- value being dropped from the type. previousRole is nullable and already
-- uses NULL to mean "no prior role" — the same convention applies here.
-- newRole is NOT NULL, so it is updated to MEMBER to stay consistent with
-- the users.role reassignment above.
UPDATE "role_audit_logs" SET "previousRole" = NULL WHERE "previousRole" = 'HR';
UPDATE "role_audit_logs" SET "newRole" = 'MEMBER' WHERE "newRole" = 'HR';

-- Postgres has no DROP VALUE for enums — recreate the type without HR and
-- swap every column over, matching the pattern already used by this
-- codebase's own 20260823000000_meal_state_and_remove_preferred migration
-- (which did the identical thing to remove SlotState.PREFERRED).
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD', 'SERVER', 'MEMBER');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TABLE "role_audit_logs" ALTER COLUMN "previousRole" TYPE "UserRole_new" USING ("previousRole"::text::"UserRole_new");
ALTER TABLE "role_audit_logs" ALTER COLUMN "newRole" TYPE "UserRole_new" USING ("newRole"::text::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

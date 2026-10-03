-- Roles become data instead of a hardcoded enum.
--
-- EduTrack builds in four role *kinds* (admin, faculty, student, parent). The two
-- staff kinds now live in a tenant-owned `roles` table as system rows; every other
-- staff role is created by the institute itself. The old `Role` enum
-- (owner/admin/faculty/accountant/front_desk) is therefore dropped.
--
-- This migration is written to be non-destructive on an existing database: it
-- creates the table, backfills one role row per (tenant, old enum value) that is
-- actually in use, points every staff member at the right row, and only then makes
-- `staff.roleId` NOT NULL and drops `staff.role`. The old `owner` value has no
-- role of its own any more — owners are Administrators with `staff.isOwner = true`.

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_key_key" ON "roles"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the two system roles for every existing institute. Administrator holds
-- the whole capability catalogue; Faculty holds the teaching subset. Faculty is the
-- pre-selected role in the invite form, hence isDefault.
INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "permissions", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(), t."id", 'admin', 'Administrator',
    'Full access to every part of EduTrack, including institute settings and staff.',
    ARRAY['dashboard.view','attendance.mark','attendance.reports','students.view','students.manage','batches.view','batches.manage','topics.manage','fees.view','fees.collect','performance.view','performance.manage','faculty.manage','settings.manage']::TEXT[],
    true, false, NOW(), NOW()
FROM "tenants" t;

INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "permissions", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(), t."id", 'faculty', 'Faculty',
    'Teaches batches: marks attendance, updates topic coverage and records assessments.',
    ARRAY['dashboard.view','attendance.mark','attendance.reports','students.view','batches.view','topics.manage','performance.view','performance.manage']::TEXT[],
    true, true, NOW(), NOW()
FROM "tenants" t;

-- Backfill: the two former enum values that are now ordinary institute-defined
-- roles, created only for the institutes that actually used them.
INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "permissions", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT DISTINCT
    gen_random_uuid(), s."tenantId", 'accountant', 'Accountant',
    'Handles fees: issues receipts, reads rosters and attendance reports.',
    ARRAY['dashboard.view','students.view','batches.view','fees.view','fees.collect','attendance.reports']::TEXT[],
    false, false, NOW(), NOW()
FROM "staff" s
WHERE s."role" = 'accountant';

INSERT INTO "roles" ("id", "tenantId", "key", "name", "description", "permissions", "isSystem", "isDefault", "createdAt", "updatedAt")
SELECT DISTINCT
    gen_random_uuid(), s."tenantId", 'front_desk', 'Front Desk',
    'Admissions and the daily roster: adds students, marks attendance, reads fees.',
    ARRAY['dashboard.view','students.view','students.manage','batches.view','fees.view','attendance.mark']::TEXT[],
    false, false, NOW(), NOW()
FROM "staff" s
WHERE s."role" = 'front_desk';

-- AlterTable: nullable for now so the backfill below can run.
ALTER TABLE "staff" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roleId" UUID;

-- Backfill: owner → the Administrator role plus the isOwner flag; everything else
-- → the role row whose key matches the old enum value.
UPDATE "staff" s
SET "roleId" = r."id",
    "isOwner" = (s."role" = 'owner')
FROM "roles" r
WHERE r."tenantId" = s."tenantId"
  AND r."key" = CASE WHEN s."role" = 'owner' THEN 'admin' ELSE s."role"::TEXT END;

-- Safety net: anything the mapping missed becomes an Administrator rather than
-- blocking the migration on a NOT NULL violation.
UPDATE "staff" s
SET "roleId" = r."id"
FROM "roles" r
WHERE s."roleId" IS NULL AND r."tenantId" = s."tenantId" AND r."key" = 'admin';

-- AlterTable
ALTER TABLE "staff" ALTER COLUMN "roleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "staff_tenantId_role_idx";

-- CreateIndex
CREATE INDEX "staff_tenantId_roleId_idx" ON "staff"("tenantId", "roleId");

-- AlterTable
ALTER TABLE "staff" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";

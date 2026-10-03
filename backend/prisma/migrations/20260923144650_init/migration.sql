-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun');

-- CreateEnum
CREATE TYPE "BrandTheme" AS ENUM ('royal', 'indigo', 'teal', 'plum', 'slate');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'faculty', 'accountant', 'front_desk');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('Active', 'Inactive', 'Invited');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('Active', 'Inactive', 'On Leave');

-- CreateEnum
CREATE TYPE "PortalAccess" AS ENUM ('Not Invited', 'Invited', 'Active');

-- CreateEnum
CREATE TYPE "GuardianRelation" AS ENUM ('Father', 'Mother', 'Guardian');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('Active', 'Upcoming', 'Archived');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('Not Started', 'In Progress', 'Completed');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('P', 'L', 'A', 'E');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('Unit Test', 'Quiz', 'Mock Exam', 'Assignment');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('absence', 'fee', 'batch', 'system');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('student', 'batch', 'invoice', 'session', 'assessment', 'staff');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('joining-date', 'fixed-day');

-- CreateEnum
CREATE TYPE "LicenseTier" AS ENUM ('Starter', 'Pro', 'Enterprise');

-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('student', 'parent');

-- CreateEnum
CREATE TYPE "PortalAccountStatus" AS ENUM ('Invited', 'Active', 'Disabled');

-- CreateEnum
CREATE TYPE "PortalAuthMethod" AS ENUM ('otp', 'password');

-- CreateEnum
CREATE TYPE "PrincipalType" AS ENUM ('staff', 'student', 'parent');

-- CreateEnum
CREATE TYPE "OneTimeCodePurpose" AS ENUM ('parent_login', 'portal_activation', 'password_reset');

-- CreateEnum
CREATE TYPE "OneTimeCodeChannel" AS ENUM ('sms', 'email');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "instituteCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "brandTheme" "BrandTheme" NOT NULL DEFAULT 'royal',
    "academicYear" TEXT NOT NULL,
    "academicYearStart" DATE NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'INR',
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "currencyLocale" TEXT NOT NULL DEFAULT 'en-IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "workingDays" "Weekday"[] DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']::"Weekday"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institute_settings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "lateAfterMinutes" INTEGER NOT NULL DEFAULT 10,
    "lowAttendanceThreshold" INTEGER NOT NULL DEFAULT 75,
    "countLateAsPresent" BOOLEAN NOT NULL DEFAULT true,
    "notifyParentOnAbsence" BOOLEAN NOT NULL DEFAULT true,
    "billingMode" "BillingMode" NOT NULL DEFAULT 'joining-date',
    "billingDay" INTEGER NOT NULL DEFAULT 5,
    "dueInDays" INTEGER NOT NULL DEFAULT 7,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "lateFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'RCPT',
    "notifySms" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "licenseTier" "LicenseTier" NOT NULL DEFAULT 'Starter',
    "licenseValidUntil" DATE NOT NULL,
    "maxStudents" INTEGER NOT NULL DEFAULT 200,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institute_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "role" "Role" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" "StaffStatus" NOT NULL DEFAULT 'Invited',
    "joinedOn" DATE NOT NULL,
    "avatarUrl" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_subjects" (
    "tenantId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,

    CONSTRAINT "staff_subjects_pkey" PRIMARY KEY ("staffId","subjectId")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "studentCode" TEXT NOT NULL,
    "cardNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dob" DATE NOT NULL,
    "grade" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "school" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "guardianName" TEXT NOT NULL,
    "guardianRelation" "GuardianRelation" NOT NULL DEFAULT 'Father',
    "guardianPhone" TEXT NOT NULL,
    "guardianPhoneKey" TEXT NOT NULL,
    "guardianEmail" TEXT,
    "joiningDate" DATE NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'Active',
    "photoUrl" TEXT,
    "concessionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "portalAccess" "PortalAccess" NOT NULL DEFAULT 'Not Invited',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_batches" (
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "enrolledOn" DATE NOT NULL,

    CONSTRAINT "student_batches_pkey" PRIMARY KEY ("studentId","batchId")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shortName" TEXT,
    "grades" TEXT[],

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "plannedHours" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "days" "Weekday"[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "facultyId" UUID NOT NULL,
    "room" TEXT NOT NULL DEFAULT '',
    "monthlyFee" DECIMAL(12,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "BatchStatus" NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_topic_coverage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "status" "CoverageStatus" NOT NULL DEFAULT 'Not Started',
    "startedOn" DATE,
    "completedOn" DATE,
    "hoursSpent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_topic_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "facultyId" UUID NOT NULL,
    "notes" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_session_topics" (
    "tenantId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "attendance_session_topics_pkey" PRIMARY KEY ("sessionId","topicId")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "lateByMinutes" INTEGER,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "studentId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "issuedOn" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "waived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "invoiceId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "collectedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "date" DATE NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_topics" (
    "tenantId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "assessment_topics_pkey" PRIMARY KEY ("assessmentId","topicId")
);

-- CreateTable
CREATE TABLE "assessment_scores" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "marks" INTEGER,

    CONSTRAINT "assessment_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" UUID,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" "ActivityEntityType",
    "entityId" TEXT,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "role" "PortalRole" NOT NULL,
    "name" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "authMethod" "PortalAuthMethod" NOT NULL DEFAULT 'password',
    "passwordHash" TEXT,
    "status" "PortalAccountStatus" NOT NULL DEFAULT 'Invited',
    "invitedOn" DATE NOT NULL,
    "activatedOn" DATE,
    "lastLoginAt" TIMESTAMP(3),
    "notifyAttendance" BOOLEAN NOT NULL DEFAULT true,
    "notifyFees" BOOLEAN NOT NULL DEFAULT true,
    "notifyResults" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_account_students" (
    "tenantId" UUID NOT NULL,
    "portalAccountId" UUID NOT NULL,
    "studentId" UUID NOT NULL,

    CONSTRAINT "portal_account_students_pkey" PRIMARY KEY ("portalAccountId","studentId")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "principalType" "PrincipalType" NOT NULL,
    "staffId" UUID,
    "portalAccountId" UUID,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_codes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purpose" "OneTimeCodePurpose" NOT NULL,
    "channel" "OneTimeCodeChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "destinationKey" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "principalType" "PrincipalType" NOT NULL,
    "staffId" UUID,
    "portalAccountId" UUID,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_instituteCode_key" ON "tenants"("instituteCode");

-- CreateIndex
CREATE INDEX "tenants_active_idx" ON "tenants"("active");

-- CreateIndex
CREATE UNIQUE INDEX "institute_settings_tenantId_key" ON "institute_settings"("tenantId");

-- CreateIndex
CREATE INDEX "campuses_tenantId_idx" ON "campuses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_tenantId_name_key" ON "campuses"("tenantId", "name");

-- CreateIndex
CREATE INDEX "staff_tenantId_idx" ON "staff"("tenantId");

-- CreateIndex
CREATE INDEX "staff_tenantId_role_idx" ON "staff"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "staff_tenantId_email_key" ON "staff"("tenantId", "email");

-- CreateIndex
CREATE INDEX "staff_subjects_tenantId_idx" ON "staff_subjects"("tenantId");

-- CreateIndex
CREATE INDEX "staff_subjects_subjectId_idx" ON "staff_subjects"("subjectId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE INDEX "students_tenantId_campusId_idx" ON "students"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "students_tenantId_status_idx" ON "students"("tenantId", "status");

-- CreateIndex
CREATE INDEX "students_tenantId_guardianPhoneKey_idx" ON "students"("tenantId", "guardianPhoneKey");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_studentCode_key" ON "students"("tenantId", "studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_cardNo_key" ON "students"("tenantId", "cardNo");

-- CreateIndex
CREATE INDEX "student_batches_tenantId_idx" ON "student_batches"("tenantId");

-- CreateIndex
CREATE INDEX "student_batches_batchId_idx" ON "student_batches"("batchId");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenantId_code_key" ON "subjects"("tenantId", "code");

-- CreateIndex
CREATE INDEX "topics_tenantId_idx" ON "topics"("tenantId");

-- CreateIndex
CREATE INDEX "topics_subjectId_grade_idx" ON "topics"("subjectId", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "topics_tenantId_subjectId_grade_order_key" ON "topics"("tenantId", "subjectId", "grade", "order");

-- CreateIndex
CREATE INDEX "batches_tenantId_idx" ON "batches"("tenantId");

-- CreateIndex
CREATE INDEX "batches_tenantId_status_idx" ON "batches"("tenantId", "status");

-- CreateIndex
CREATE INDEX "batches_tenantId_campusId_idx" ON "batches"("tenantId", "campusId");

-- CreateIndex
CREATE INDEX "batches_facultyId_idx" ON "batches"("facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "batches_tenantId_code_key" ON "batches"("tenantId", "code");

-- CreateIndex
CREATE INDEX "batch_topic_coverage_tenantId_idx" ON "batch_topic_coverage"("tenantId");

-- CreateIndex
CREATE INDEX "batch_topic_coverage_topicId_idx" ON "batch_topic_coverage"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "batch_topic_coverage_batchId_topicId_key" ON "batch_topic_coverage"("batchId", "topicId");

-- CreateIndex
CREATE INDEX "attendance_sessions_tenantId_idx" ON "attendance_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_sessions_tenantId_date_idx" ON "attendance_sessions"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_batchId_date_key" ON "attendance_sessions"("batchId", "date");

-- CreateIndex
CREATE INDEX "attendance_session_topics_tenantId_idx" ON "attendance_session_topics"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_session_topics_topicId_idx" ON "attendance_session_topics"("topicId");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_idx" ON "attendance_records"("tenantId");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_studentId_idx" ON "attendance_records"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_sessionId_studentId_key" ON "attendance_records"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "fee_invoices_tenantId_idx" ON "fee_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "fee_invoices_tenantId_studentId_idx" ON "fee_invoices"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "fee_invoices_tenantId_period_idx" ON "fee_invoices"("tenantId", "period");

-- CreateIndex
CREATE INDEX "fee_invoices_batchId_idx" ON "fee_invoices"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_tenantId_invoiceNo_key" ON "fee_invoices"("tenantId", "invoiceNo");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE INDEX "payments_tenantId_studentId_idx" ON "payments"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenantId_receiptNo_key" ON "payments"("tenantId", "receiptNo");

-- CreateIndex
CREATE INDEX "assessments_tenantId_idx" ON "assessments"("tenantId");

-- CreateIndex
CREATE INDEX "assessments_tenantId_batchId_idx" ON "assessments"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "assessment_topics_tenantId_idx" ON "assessment_topics"("tenantId");

-- CreateIndex
CREATE INDEX "assessment_topics_topicId_idx" ON "assessment_topics"("topicId");

-- CreateIndex
CREATE INDEX "assessment_scores_tenantId_idx" ON "assessment_scores"("tenantId");

-- CreateIndex
CREATE INDEX "assessment_scores_tenantId_studentId_idx" ON "assessment_scores"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_scores_assessmentId_studentId_key" ON "assessment_scores"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_read_idx" ON "notifications"("tenantId", "read");

-- CreateIndex
CREATE INDEX "notifications_staffId_idx" ON "notifications"("staffId");

-- CreateIndex
CREATE INDEX "activity_log_tenantId_idx" ON "activity_log"("tenantId");

-- CreateIndex
CREATE INDEX "activity_log_tenantId_at_idx" ON "activity_log"("tenantId", "at");

-- CreateIndex
CREATE INDEX "activity_log_actorId_idx" ON "activity_log"("actorId");

-- CreateIndex
CREATE INDEX "portal_accounts_tenantId_idx" ON "portal_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "portal_accounts_tenantId_phoneKey_idx" ON "portal_accounts"("tenantId", "phoneKey");

-- CreateIndex
CREATE INDEX "portal_accounts_tenantId_email_idx" ON "portal_accounts"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_tenantId_role_loginId_key" ON "portal_accounts"("tenantId", "role", "loginId");

-- CreateIndex
CREATE INDEX "portal_account_students_tenantId_idx" ON "portal_account_students"("tenantId");

-- CreateIndex
CREATE INDEX "portal_account_students_studentId_idx" ON "portal_account_students"("studentId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenantId_idx" ON "refresh_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "refresh_tokens_staffId_idx" ON "refresh_tokens"("staffId");

-- CreateIndex
CREATE INDEX "refresh_tokens_portalAccountId_idx" ON "refresh_tokens"("portalAccountId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "one_time_codes_tenantId_idx" ON "one_time_codes"("tenantId");

-- CreateIndex
CREATE INDEX "one_time_codes_tenantId_purpose_destinationKey_idx" ON "one_time_codes"("tenantId", "purpose", "destinationKey");

-- CreateIndex
CREATE INDEX "one_time_codes_codeHash_idx" ON "one_time_codes"("codeHash");

-- CreateIndex
CREATE INDEX "one_time_codes_expiresAt_idx" ON "one_time_codes"("expiresAt");

-- AddForeignKey
ALTER TABLE "institute_settings" ADD CONSTRAINT "institute_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_subjects" ADD CONSTRAINT "staff_subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_subjects" ADD CONSTRAINT "staff_subjects_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_subjects" ADD CONSTRAINT "staff_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_batches" ADD CONSTRAINT "student_batches_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_topic_coverage" ADD CONSTRAINT "batch_topic_coverage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_topic_coverage" ADD CONSTRAINT "batch_topic_coverage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_topic_coverage" ADD CONSTRAINT "batch_topic_coverage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_session_topics" ADD CONSTRAINT "attendance_session_topics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_session_topics" ADD CONSTRAINT "attendance_session_topics_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_session_topics" ADD CONSTRAINT "attendance_session_topics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_topics" ADD CONSTRAINT "assessment_topics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_account_students" ADD CONSTRAINT "portal_account_students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_account_students" ADD CONSTRAINT "portal_account_students_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_account_students" ADD CONSTRAINT "portal_account_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_codes" ADD CONSTRAINT "one_time_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_codes" ADD CONSTRAINT "one_time_codes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_codes" ADD CONSTRAINT "one_time_codes_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

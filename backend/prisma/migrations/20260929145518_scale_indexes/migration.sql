-- Composite indexes for the 5,000-student / 5-year target (docs/PERFORMANCE.md).
--
-- Each index below exists for a named screen, and four two-column indexes are
-- dropped because a new index has the same leading columns and therefore serves
-- every query the old one did:
--
--   today's roll call, a batch's month   attendance_sessions(tenantId, batchId, date)
--   a student's attendance history / %   attendance_records(tenantId, studentId, mark)
--   a student's fees, fees for a period  fee_invoices(tenantId, studentId, period)
--   the fee dues list                    fee_invoices(tenantId, waived, dueDate)
--   monthly collections, the day book    payments(tenantId, date)
--   a student's receipts                 payments(tenantId, studentId, date)
--   a batch's assessments over a term    assessments(tenantId, batchId, date)
--   the student roster, keyset-paginated students(tenantId, name, id)
--
-- On an empty or small client database this applies in milliseconds. On a client
-- that is already at target volume, `CREATE INDEX` holds a write lock on the table
-- for the duration (minutes, for ~4M attendance records), and Prisma runs a
-- migration inside a transaction so `CONCURRENTLY` cannot be used here. For such a
-- client, create the indexes by hand with CREATE INDEX CONCURRENTLY and then mark
-- this migration applied — see docs/OPERATIONS.md › Large clients: indexes without
-- downtime.

-- DropIndex
DROP INDEX "assessments_tenantId_batchId_idx";

-- DropIndex
DROP INDEX "attendance_records_tenantId_studentId_idx";

-- DropIndex
DROP INDEX "fee_invoices_tenantId_studentId_idx";

-- DropIndex
DROP INDEX "payments_tenantId_studentId_idx";

-- CreateIndex
CREATE INDEX "assessments_tenantId_batchId_date_idx" ON "assessments"("tenantId", "batchId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_tenantId_studentId_mark_idx" ON "attendance_records"("tenantId", "studentId", "mark");

-- CreateIndex
CREATE INDEX "attendance_sessions_tenantId_batchId_date_idx" ON "attendance_sessions"("tenantId", "batchId", "date");

-- CreateIndex
CREATE INDEX "fee_invoices_tenantId_studentId_period_idx" ON "fee_invoices"("tenantId", "studentId", "period");

-- CreateIndex
CREATE INDEX "fee_invoices_tenantId_waived_dueDate_idx" ON "fee_invoices"("tenantId", "waived", "dueDate");

-- CreateIndex
CREATE INDEX "payments_tenantId_date_idx" ON "payments"("tenantId", "date");

-- CreateIndex
CREATE INDEX "payments_tenantId_studentId_date_idx" ON "payments"("tenantId", "studentId", "date");

-- CreateIndex
CREATE INDEX "students_tenantId_name_id_idx" ON "students"("tenantId", "name", "id");

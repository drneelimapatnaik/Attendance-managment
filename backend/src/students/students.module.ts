/**
 * Students module — bulk admissions only, for now.
 *
 * Registered in AppModule so `POST /students/import` is live. When the roster CRUD
 * arrives it joins this module; the import service and its DTOs do not need to
 * change for that.
 */
import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsImportService } from './students-import.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsImportService],
  exports: [StudentsImportService],
})
export class StudentsModule {}

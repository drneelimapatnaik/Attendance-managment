/**
 * `POST /students/import` — the per-row report.
 *
 * The response is deliberately row-shaped rather than a single verdict: an
 * admissions spreadsheet with 5,000 rows almost always has a handful of problems,
 * and the operator needs to know which rows and why, not that "the import failed".
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportRowResultDto {
  @ApiProperty({ example: 412, description: '1-based position in the uploaded rows.' })
  row!: number;

  @ApiProperty({ enum: ['created', 'skipped', 'failed'] })
  status!: 'created' | 'skipped' | 'failed';

  @ApiPropertyOptional({ format: 'uuid', description: 'Present when the student was created.' })
  id?: string;

  @ApiPropertyOptional({ example: 'STU-1042', description: 'The row’s roll number, to name it in the UI.' })
  ref?: string;

  @ApiPropertyOptional({ example: 'Roll number STU-1042 already belongs to another student.' })
  message?: string;

  @ApiPropertyOptional({ example: 'studentCode', description: 'The field at fault, when it is one field.' })
  field?: string;
}

export class ImportSummaryDto {
  @ApiProperty({ example: 5000 }) total!: number;
  @ApiProperty({ example: 4987 }) created!: number;
  @ApiProperty({ example: 0 }) skipped!: number;
  @ApiProperty({ example: 13 }) failed!: number;
}

export class StudentImportResultDto {
  @ApiProperty({ type: ImportSummaryDto }) summary!: ImportSummaryDto;

  @ApiProperty({ type: [ImportRowResultDto], description: 'One entry per uploaded row, in upload order.' })
  results!: ImportRowResultDto[];

  @ApiProperty({ example: false, description: 'True when nothing was written because `dryRun` was set.' })
  dryRun!: boolean;

  @ApiProperty({ example: 10, description: 'How many INSERT batches the write took.' })
  batches!: number;

  @ApiProperty({ example: 1840, description: 'Server-side duration in milliseconds.' })
  durationMs!: number;
}

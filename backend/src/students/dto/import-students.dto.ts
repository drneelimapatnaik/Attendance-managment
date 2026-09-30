/**
 * `POST /students/import` — the admissions upload contract.
 *
 * One row per student, in the institute's own spelling: the same field names and
 * the same wire forms as `frontend/src/types/domain.ts`, so a CSV exported from the
 * roster screen can be re-imported without translation.
 *
 * Shape is checked here by class-validator; anything that needs the database (does
 * this campus exist, is this roll number already taken) is checked per row in
 * StudentsImportService, because a shape error and a business error must be
 * reported the same way — against the row, not as a 400 for the whole file.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_IMPORT_ROWS } from '@/common/bulk/bulk-import';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** `YYYY-MM-DD`. Validity (no 2026-02-30) is checked per row by the service. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ImportStudentRowDto {
  @ApiProperty({ example: 'STU-1042', description: 'Roll number. Unique within the institute.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  studentCode!: string;

  @ApiProperty({ example: '9401', description: 'ID-card / RFID number. Unique within the institute.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  cardNo!: string;

  @ApiProperty({ example: 'Aarav Patel' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ['Male', 'Female', 'Other'] })
  @Transform(trim)
  @IsIn(['Male', 'Female', 'Other'], { message: 'Gender must be Male, Female or Other.' })
  gender!: 'Male' | 'Female' | 'Other';

  @ApiProperty({ example: '2009-05-14' })
  @Transform(trim)
  @Matches(ISO_DATE, { message: 'Date of birth must be YYYY-MM-DD.' })
  dob!: string;

  @ApiProperty({ example: 'Grade 10' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  grade!: string;

  @ApiPropertyOptional({ example: 'Science' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  section?: string;

  @ApiPropertyOptional({ example: 'Delhi Public School' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  school?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'aarav@example.com' })
  @IsOptional()
  @Transform(lower)
  @IsEmail({}, { message: 'The student email is not a valid address.' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiProperty({ example: 'Vikram Patel' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guardianName!: string;

  @ApiProperty({ enum: ['Father', 'Mother', 'Guardian'], default: 'Father' })
  @IsOptional()
  @Transform(trim)
  @IsIn(['Father', 'Mother', 'Guardian'], { message: 'Guardian relation must be Father, Mother or Guardian.' })
  guardianRelation?: 'Father' | 'Mother' | 'Guardian';

  @ApiProperty({ example: '+91 98765 43210', description: 'The parent signs in with this number.' })
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  guardianPhone!: string;

  @ApiPropertyOptional({ example: 'patel.family@example.com' })
  @IsOptional()
  @Transform(lower)
  @IsEmail({}, { message: 'The guardian email is not a valid address.' })
  @MaxLength(160)
  guardianEmail?: string;

  @ApiProperty({ example: '2026-06-01', description: 'Admission date. Drives billing on the joining-date rule.' })
  @Transform(trim)
  @Matches(ISO_DATE, { message: 'Joining date must be YYYY-MM-DD.' })
  joiningDate!: string;

  @ApiPropertyOptional({ example: 10, description: 'Concession on every invoice, as a percentage.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Concession must be a whole percentage.' })
  @Min(0)
  @Max(100)
  concessionPct?: number;

  @ApiPropertyOptional({ example: 'Main Campus', description: 'Campus name. Defaults to the institute’s only campus.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  campusName?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['PHY-11A', 'MAT-11B'],
    description: 'Batch codes to enrol into. Unknown codes fail the row rather than being ignored.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  batchCodes?: string[];
}

export class ImportStudentsDto {
  @ApiProperty({ type: [ImportStudentRowDto], description: `One row per student, at most ${MAX_IMPORT_ROWS} per request.` })
  @IsArray()
  @ArrayMinSize(1, { message: 'Send at least one row.' })
  @ArrayMaxSize(MAX_IMPORT_ROWS, { message: `Send at most ${MAX_IMPORT_ROWS} rows per request.` })
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'Validate only: report what would happen and write nothing. Use it to preflight a spreadsheet.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? ['true', '1', 'yes'].includes(value.toLowerCase()) : value))
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ example: 500, description: 'Rows per INSERT inside the transaction. Leave unset unless tuning.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  batchSize?: number;
}

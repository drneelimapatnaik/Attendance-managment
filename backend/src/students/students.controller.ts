/**
 * Students endpoints (mounted at /api/v1/students).
 *
 * Only the bulk-admissions import lives here. The roster, the profile, create and
 * edit are another wave's work, and inventing them now would mean guessing at
 * contracts the frontend already has opinions about. What an institute cannot do
 * without on day one is load the students they already have, so that is what ships.
 */
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@/common/decorators/auth.decorators';
import { ImportStudentsDto } from './dto/import-students.dto';
import { StudentImportResultDto } from './dto/import-result.dto';
import { StudentsImportService } from './students-import.service';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly imports: StudentsImportService) {}

  @Post('import')
  @Permissions('students.manage')
  // 200, not 201: the response is a report about many rows, not one created resource.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk-admit students',
    description:
      'Validates every row, then inserts the valid ones in batches inside one transaction — all of them or none. ' +
      'Returns one result per uploaded row, so a spreadsheet with a few bad rows still admits the rest of the file. ' +
      'Send `dryRun: true` to check a spreadsheet without writing anything.',
  })
  @ApiResponse({ status: 200, type: StudentImportResultDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED — the request shape is wrong, or the institute has no campus yet.' })
  @ApiResponse({ status: 403, description: 'PERMISSION_DENIED — needs `students.manage`.' })
  import(@Body() dto: ImportStudentsDto): Promise<StudentImportResultDto> {
    return this.imports.import(dto);
  }
}

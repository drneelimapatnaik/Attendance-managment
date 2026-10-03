/**
 * The query DTOs every paginated endpoint extends, so the contract is identical
 * across the API and the client only ever learns one shape.
 *
 * Query strings are text and the global ValidationPipe does not convert
 * implicitly, hence the explicit `@Type(() => Number)` — without it `?pageSize=50`
 * arrives as the string "50" and `@IsInt()` rejects it.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';

/** Page-numbered lists: bounded data with a page control in the UI. */
export class PageQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: DEFAULT_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

/**
 * Keyset lists: unbounded data (attendance, invoices, payments) where an OFFSET
 * would make later pages progressively slower.
 */
export class CursorQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor from the previous response’s `nextCursor`. Omit for the first page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ example: DEFAULT_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

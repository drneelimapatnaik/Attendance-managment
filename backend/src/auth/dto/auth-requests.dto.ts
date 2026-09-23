/**
 * Request bodies for every auth route.
 *
 * The global ValidationPipe runs with `whitelist: true` and `forbidNonWhitelisted`,
 * so a property that is not declared here is rejected rather than silently ignored.
 * Values are trimmed and normalised (institute codes upper-cased, emails
 * lower-cased) by `@Transform` so the service layer never has to.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password.service';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Every unauthenticated route names the institute it is signing in to. */
class TenantScopedDto {
  @ApiProperty({ example: 'APEX', description: 'The institute code shown on the sign-in screen.' })
  @Transform(upper)
  @IsString()
  @IsNotEmpty({ message: 'Enter your institute code.' })
  @MaxLength(32)
  instituteCode!: string;
}

export class StaffLoginDto extends TenantScopedDto {
  @ApiProperty({ example: 'neelima@apexacademy.in' })
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(160)
  email!: string;

  @ApiProperty({ example: 'Apex@2026', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class StudentLoginDto extends TenantScopedDto {
  @ApiProperty({ example: 'STU-1042', description: 'The student ID printed on the ID card.' })
  @Transform(upper)
  @IsString()
  @IsNotEmpty({ message: 'Enter your student ID.' })
  @MaxLength(32)
  studentId!: string;

  @ApiProperty({ example: 'student123' })
  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ParentOtpRequestDto extends TenantScopedDto {
  @ApiProperty({ example: '+91 98765 43210', description: 'The mobile number registered with the institute.' })
  @Transform(trim)
  @IsString()
  @Matches(/^[\d+\-\s()]{8,20}$/, { message: 'Enter a valid mobile number.' })
  phone!: string;
}

export class ParentOtpVerifyDto extends ParentOtpRequestDto {
  @ApiProperty({ example: '482913', description: 'The 6-digit code sent by SMS.' })
  @Transform(trim)
  @IsString()
  @Length(4, 10, { message: 'Enter the code from the SMS.' })
  code!: string;
}

export class ParentLoginDto extends ParentOtpRequestDto {
  @ApiProperty({ example: 'parent123' })
  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ActivateAccountDto {
  @ApiProperty({ description: 'The single-use token from the invitation link.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, description: 'The password to set for this account.' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ description: 'Optional for students; parents must have one for password recovery.' })
  @IsOptional()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(160)
  email?: string;
}

export class ForgotPasswordDto extends TenantScopedDto {
  @ApiProperty({
    example: 'neelima@apexacademy.in',
    description: 'Staff email, student ID or the parent mobile number — whichever the account signs in with.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Enter your email, student ID or mobile number.' })
  @MaxLength(160)
  identifier!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The single-use token from the password-reset email.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.` })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The refresh token returned by the last sign-in or refresh.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

/** Logout takes the same body; the token is optional so a client can just forget it. */
export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}

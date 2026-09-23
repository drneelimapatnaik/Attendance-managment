/**
 * Auth endpoints (mounted at /api/v1/auth).
 *
 * Every route here is `@Public()` — they are how a caller *becomes*
 * authenticated — except `GET /auth/me`. All of them are rate limited well below
 * the global budget, and the OTP request route is limited per phone number as
 * well as per IP.
 *
 * `POST /auth/login` is an alias of `POST /auth/staff/login` kept for the existing
 * web client (frontend/src/services/auth.ts posts there).
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Public } from '@/common/decorators/auth.decorators';
import { OtpThrottlerGuard } from '@/common/guards/otp-throttler.guard';
import { AuthService } from './auth.service';
import {
  ActivateAccountDto,
  ForgotPasswordDto,
  LogoutDto,
  ParentLoginDto,
  ParentOtpRequestDto,
  ParentOtpVerifyDto,
  RefreshTokenDto,
  ResetPasswordDto,
  StaffLoginDto,
  StudentLoginDto,
} from './dto/auth-requests.dto';
import { AcceptedDto, AuthSessionDto, MeDto, OtpRequestedDto } from './dto/auth-responses.dto';
import type { Principal } from './principal';
import type { SessionMeta } from './tokens.service';

/** Per-minute budgets. Sign-in is the expensive, attackable path, so it is tightest. */
const LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const OTP_REQUEST_LIMIT = { default: { limit: 3, ttl: 60_000 } };
const OTP_VERIFY_LIMIT = { default: { limit: 10, ttl: 60_000 } };
const RECOVERY_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_LIMIT = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ------------------------------------------------------------------ staff

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as a staff member', description: 'Institute code + email + password.' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials (the same response for unknown email and wrong password).' })
  staffLogin(@Body() dto: StaffLoginDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.staffLogin(dto, sessionMeta(req));
  }

  /** Alias kept so the existing web client keeps working. */
  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alias of /auth/staff/login', deprecated: true })
  @ApiBody({ type: StaffLoginDto })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  login(@Body() dto: StaffLoginDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.staffLogin(dto, sessionMeta(req));
  }

  // ---------------------------------------------------------------- student

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('student/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as a student', description: 'Institute code + student ID + password.' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  studentLogin(@Body() dto: StudentLoginDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.studentLogin(dto, sessionMeta(req));
  }

  // ----------------------------------------------------------------- parent

  @Public()
  @UseGuards(OtpThrottlerGuard)
  @Throttle(OTP_REQUEST_LIMIT)
  @Post('parent/otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a parent a sign-in code',
    description:
      'Always reports success so the endpoint cannot be used to discover which numbers are registered. Outside production the code is echoed as `devCode`.',
  })
  @ApiResponse({ status: 200, type: OtpRequestedDto })
  requestParentOtp(@Body() dto: ParentOtpRequestDto): Promise<OtpRequestedDto> {
    return this.auth.requestParentOtp(dto);
  }

  @Public()
  @UseGuards(OtpThrottlerGuard)
  @Throttle(OTP_VERIFY_LIMIT)
  @Post('parent/otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a parent sign-in code for a session' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 400, description: 'OTP_INVALID | OTP_EXPIRED | OTP_ATTEMPTS_EXCEEDED | OTP_NOT_REQUESTED' })
  verifyParentOtp(@Body() dto: ParentOtpVerifyDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.verifyParentOtp(dto, sessionMeta(req));
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('parent/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as a parent with a password', description: 'For parents who chose a password instead of OTP.' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  parentLogin(@Body() dto: ParentLoginDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.parentLogin(dto, sessionMeta(req));
  }

  // ------------------------------------------------------------- activation

  @Public()
  @Throttle(RECOVERY_LIMIT)
  @Post('portal/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate an invited account',
    description: 'Consumes the single-use token from the invitation, sets a password and signs the account in.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  activate(@Body() dto: ActivateAccountDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.activate(dto, sessionMeta(req));
  }

  // --------------------------------------------------------------- recovery

  @Public()
  @Throttle(RECOVERY_LIMIT)
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password-reset link',
    description: 'The identifier is a staff email, a student ID or a parent mobile. Always 202, whatever it was.',
  })
  @ApiResponse({ status: 202, type: AcceptedDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<AcceptedDto> {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle(RECOVERY_LIMIT)
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with a reset token', description: 'Ends every existing session for that account.' })
  @ApiResponse({ status: 200, description: '{ "ok": true }' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    return this.auth.resetPassword(dto);
  }

  // ------------------------------------------------------- session lifecycle

  @Public()
  @Throttle(REFRESH_LIMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description: 'Returns a new access token and a new refresh token; the old one is revoked.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthSessionDto> {
    return this.auth.refresh(dto, sessionMeta(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End one session', description: 'Idempotent: unknown or already-revoked tokens also return 204.' })
  @ApiResponse({ status: 204, description: 'Session ended.' })
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.auth.logout(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The signed-in principal',
    description: 'Staff get their permission list; portal logins get their linked students.',
  })
  @ApiResponse({ status: 200, type: MeDto })
  me(@CurrentUser() principal: Principal): Promise<MeDto> {
    return this.auth.me(principal);
  }
}

/** Records who asked, so a leaked session can be traced later. */
function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ips?.length ? req.ips[0] : req.ip };
}

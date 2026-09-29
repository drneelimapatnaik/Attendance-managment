/**
 * Authentication module.
 *
 * Wires the flows (AuthService), the token machinery, the JWT strategy and the
 * pluggable SMS/mail senders. Swapping in a real provider means changing the two
 * `useClass` lines below and nothing else.
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TenantsModule } from '@/tenancy/tenants.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoggingMailSender, MAIL_SENDER } from './notifications/mail-sender';
import { LoggingSmsSender, SMS_SENDER } from './notifications/sms-sender';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    // Secrets are passed per-signature in TokensService (access and refresh use
    // different keys), so the module itself is registered without one.
    JwtModule.register({}),
    TenantsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokensService,
    OtpService,
    JwtStrategy,
    { provide: SMS_SENDER, useClass: LoggingSmsSender },
    { provide: MAIL_SENDER, useClass: LoggingMailSender },
  ],
  // MAIL_SENDER is exported so the staff module can send invitations through the
  // same provider this module configures — there is only one place to swap it.
  exports: [AuthService, PasswordService, TokensService, OtpService, MAIL_SENDER],
})
export class AuthModule {}

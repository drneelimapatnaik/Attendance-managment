/**
 * Bearer-token strategy.
 *
 * Verifies the access token's signature, issuer, audience and expiry, then turns
 * the claims into a `Principal`. No database round trip: the claims are enough to
 * authorise a request, which keeps the hot path cheap. Revocation is handled by
 * the short (15 minute) access-token lifetime plus refresh-token revocation.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { ErrorCodes, UnauthorizedError } from '@/common/errors/app.error';
import { AccessTokenPayload, Principal, principalFromPayload } from '../principal';

export const JWT_STRATEGY = 'jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    };
    super(options);
  }

  /** Passport calls this only after the signature and expiry have checked out. */
  validate(payload: AccessTokenPayload): Principal {
    const principal = principalFromPayload(payload);
    if (!principal) throw new UnauthorizedError('Your session is no longer valid. Sign in again.', ErrorCodes.INVALID_TOKEN);
    return principal;
  }
}

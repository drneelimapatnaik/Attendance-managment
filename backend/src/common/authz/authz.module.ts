/**
 * Authorisation module (global).
 *
 * Provides the one service that answers "what may this staff member do?" from the
 * database. Global because the guard that needs it (PermissionsGuard) is registered
 * as an APP_GUARD in the root module, and because every feature module that
 * enforces a rule against the caller's own authority injects it too.
 */
import { Global, Module } from '@nestjs/common';
import { PermissionResolverService } from './permission-resolver.service';

@Global()
@Module({
  providers: [PermissionResolverService],
  exports: [PermissionResolverService],
})
export class AuthzModule {}

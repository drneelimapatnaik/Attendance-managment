/**
 * Application root.
 *
 * Composition order matters here:
 *   middleware  TenantContextMiddleware opens the AsyncLocalStorage store
 *   guards      throttler → JWT → permissions → portal scope
 *   pipe        global ValidationPipe (whitelisting, transforming)
 *   filter      AllExceptionsFilter (one error shape for everything)
 *
 * Feature modules are added to `imports` as they arrive (students, batches,
 * attendance, fees, reports) — see README › "Adding a module".
 */
import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from '@/auth/auth.module';
import { buildLoggerOptions } from '@/common/logging/logger.config';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { PortalScopeGuard } from '@/common/guards/portal-scope.guard';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { ConfigModule } from '@/config/config.module';
import { HealthModule } from '@/health/health.module';
import { PrismaModule } from '@/prisma/prisma.module';
import { TenancyModule } from '@/tenancy/tenancy.module';
import { TenantContextMiddleware } from '@/tenancy/tenant-context.middleware';
import { TenantsModule } from '@/tenancy/tenants.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [APP_CONFIG], useFactory: (config: AppConfig) => buildLoggerOptions(config) }),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        // One unnamed ("default") bucket; auth routes tighten it with @Throttle.
        throttlers: [{ ttl: config.throttle.ttlSeconds * 1000, limit: config.throttle.limit }],
      }),
    }),
    TenancyModule,
    PrismaModule,
    TenantsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Strip unknown properties and reject the request that sent them, so a
        // client cannot smuggle fields into a DTO.
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in registration order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: PortalScopeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Everything, including /health and /docs, runs inside a tenant context so
    // logs always carry a request id.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

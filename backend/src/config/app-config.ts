/**
 * Typed application configuration.
 *
 * `EnvironmentVariables` is the flat, validated view of `process.env`; `AppConfig`
 * is the grouped, ergonomic view the rest of the code injects. Building it once at
 * boot means no service ever reads `process.env` directly (easy to test, easy to
 * audit for leaked secrets).
 */
import { EnvironmentVariables, LogLevel, NodeEnv } from './env.validation';

/** DI token: `@Inject(APP_CONFIG) private readonly config: AppConfig`. */
export const APP_CONFIG = 'APP_CONFIG';

export interface AppConfig {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly port: number;
  readonly appUrl: string;
  readonly webAppUrl: string;
  readonly logLevel: LogLevel;
  /** Parsed CORS allow-list; `true` means "any origin" (only sensible in dev). */
  readonly corsOrigins: string[] | true;
  readonly databaseUrl: string;
  readonly swaggerEnabled: boolean;
  readonly jwt: {
    readonly accessSecret: string;
    readonly refreshSecret: string;
    readonly accessTtl: string;
    readonly refreshTtlDays: number;
    readonly issuer: string;
    readonly audience: string;
  };
  readonly otp: {
    readonly ttlMinutes: number;
    readonly maxAttempts: number;
    readonly length: number;
    readonly resetTokenTtlMinutes: number;
    readonly activationTokenTtlHours: number;
  };
  readonly throttle: {
    readonly ttlSeconds: number;
    readonly limit: number;
  };
  readonly seed: {
    readonly tenantCode: string;
    readonly staffPassword: string;
    readonly studentPassword: string;
    readonly parentPassword: string;
  };
}

/** Groups the validated flat environment into the shape services consume. */
export function buildAppConfig(env: EnvironmentVariables): AppConfig {
  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === NodeEnv.Production,
    isTest: env.NODE_ENV === NodeEnv.Test,
    port: env.PORT,
    appUrl: env.APP_URL.replace(/\/$/, ''),
    webAppUrl: env.WEB_APP_URL.replace(/\/$/, ''),
    logLevel: env.LOG_LEVEL,
    corsOrigins: origins.includes('*') ? true : origins,
    databaseUrl: env.DATABASE_URL,
    // Off in production unless the operator opts in explicitly; on by default
    // everywhere else, because /docs is how you explore the API locally.
    swaggerEnabled: env.SWAGGER_ENABLED ?? env.NODE_ENV !== NodeEnv.Production,
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtlDays: env.JWT_REFRESH_TTL_DAYS,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    otp: {
      ttlMinutes: env.OTP_TTL_MINUTES,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      length: env.OTP_LENGTH,
      resetTokenTtlMinutes: env.RESET_TOKEN_TTL_MINUTES,
      activationTokenTtlHours: env.ACTIVATION_TOKEN_TTL_HOURS,
    },
    throttle: {
      ttlSeconds: env.THROTTLE_TTL_SECONDS,
      limit: env.THROTTLE_LIMIT,
    },
    seed: {
      tenantCode: env.SEED_TENANT_CODE.toUpperCase(),
      staffPassword: env.SEED_STAFF_PASSWORD,
      studentPassword: env.SEED_STUDENT_PASSWORD,
      parentPassword: env.SEED_PARENT_PASSWORD,
    },
  };
}

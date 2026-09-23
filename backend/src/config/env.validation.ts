/**
 * Environment validation.
 *
 * Every setting the API needs comes from the environment — never from a checked-in
 * file. This class is the single declaration of what those variables are; NestJS
 * runs `validateEnv` at boot and the process exits with a readable list of problems
 * rather than failing later with `undefined is not a function`.
 */
import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

/**
 * `'true' | '1' | 'yes' | 'on'` (any case) → true, anything else → false.
 * `undefined` stays `undefined` so "not set" can differ from "set to false".
 */
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const toInt = ({ value }: { value: unknown }): number | unknown => {
  if (value === undefined || value === null || value === '') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  /** Comma-separated browser origins allowed by CORS. `*` allows any (dev only). */
  @IsString()
  CORS_ORIGINS = 'http://localhost:5173';

  @IsEnum(LogLevel)
  LOG_LEVEL: LogLevel = LogLevel.Info;

  @IsUrl({ require_tld: false })
  APP_URL = 'http://localhost:3000';

  @IsUrl({ require_tld: false })
  WEB_APP_URL = 'http://localhost:5173';

  /** postgresql://user:password@host:port/database?schema=public */
  @IsString()
  @MinLength(1, { message: 'DATABASE_URL is required (see .env.example)' })
  DATABASE_URL!: string;

  // --- auth ---------------------------------------------------------------
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  /** Anything `jsonwebtoken` understands: '15m', '900s', '1h'. */
  @IsString()
  JWT_ACCESS_TTL = '15m';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  JWT_REFRESH_TTL_DAYS = 30;

  @IsString()
  JWT_ISSUER = 'edutrack-api';

  @IsString()
  JWT_AUDIENCE = 'edutrack-app';

  // --- one-time codes ------------------------------------------------------
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(60)
  OTP_TTL_MINUTES = 5;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(20)
  OTP_MAX_ATTEMPTS = 5;

  @Transform(toInt)
  @IsInt()
  @Min(4)
  @Max(10)
  OTP_LENGTH = 6;

  @Transform(toInt)
  @IsInt()
  @Min(5)
  @Max(1440)
  RESET_TOKEN_TTL_MINUTES = 60;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(720)
  ACTIVATION_TOKEN_TTL_HOURS = 168;

  // --- throttling ----------------------------------------------------------
  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_SECONDS = 60;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  // --- docs ----------------------------------------------------------------
  /**
   * Left unset on purpose: the default is "on outside production, off in
   * production" (see buildAppConfig). Set it explicitly to override either way.
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED?: boolean;

  // --- seed (development only) ---------------------------------------------
  @IsOptional()
  @IsString()
  SEED_TENANT_CODE = 'APEX';

  @IsOptional()
  @IsString()
  SEED_STAFF_PASSWORD = 'Apex@2026';

  @IsOptional()
  @IsString()
  SEED_STUDENT_PASSWORD = 'student123';

  @IsOptional()
  @IsString()
  SEED_PARENT_PASSWORD = 'parent123';
}

/**
 * Runs on boot via `ConfigModule.forRoot({ validate: validateEnv })`.
 * Throws (and so kills the process) when anything is missing or malformed.
 */
export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? { unknown: 'is invalid' }).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the values.`);
  }
  return config;
}

/**
 * Structured logging (pino).
 *
 * Every line carries the request id set by TenantContextMiddleware, so one HTTP
 * call can be followed end to end. Redaction is deliberately broad: passwords,
 * tokens, OTP codes and authorization headers must never reach a log file, an
 * aggregator, or a support ticket.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '@/config/app-config';
import { REQUEST_ID_HEADER } from '@/tenancy/tenant-context.middleware';

/** Paths that would otherwise fill the log with health-check noise. */
const QUIET_PATHS = new Set(['/health', '/health/live', '/health/ready', '/favicon.ico']);

/**
 * `pino-pretty` is a development dependency, so it is absent from the production
 * image. Asking pino for a transport it cannot resolve is a hard crash at boot —
 * check first and fall back to plain JSON.
 */
function prettyPrintAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function buildLoggerOptions(config: AppConfig): Params {
  const pretty = !config.isProduction && prettyPrintAvailable();

  return {
    pinoHttp: {
      level: config.logLevel,
      // Human-readable while developing; newline-delimited JSON everywhere else.
      transport: pretty
        ? { target: 'pino-pretty', options: { singleLine: true, colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
        : undefined,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existing = req.headers[REQUEST_ID_HEADER];
        const id = typeof existing === 'string' && existing.trim() ? existing.trim().slice(0, 64) : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => QUIET_PATHS.has((req.url ?? '').split('?')[0]),
      },
      // Keep request logs small and free of secrets.
      serializers: {
        req: (req: IncomingMessage & { id?: string; method?: string; url?: string; headers: Record<string, unknown> }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          tenant: req.headers['x-tenant'],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.newPassword',
          'req.body.currentPassword',
          'req.body.code',
          'req.body.token',
          'req.body.refreshToken',
          'res.headers["set-cookie"]',
          '*.passwordHash',
          '*.codeHash',
          '*.tokenHash',
          '*.refreshToken',
          '*.accessToken',
        ],
        censor: '[redacted]',
      },
    },
  };
}

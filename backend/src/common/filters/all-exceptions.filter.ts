/**
 * One error shape for the whole API.
 *
 *   { "statusCode": 401, "message": "Invalid credentials.", "code": "INVALID_CREDENTIALS", "details": { … } }
 *
 * The frontend's HTTP client reads `message` (src/services/http.ts); `code` is the
 * stable key to branch on. Anything unexpected becomes a generic 500 — internal
 * messages and stack traces are logged, never returned.
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { CrossTenantAccessError, ErrorCode, ErrorCodes, MissingTenantContextError } from '@/common/errors/app.error';
import { TenantContextService } from '@/tenancy/tenant-context.service';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  code: ErrorCode | string;
  details?: unknown;
  /** Correlates the response with the server logs. */
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly context: TenantContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const body = this.toBody(exception);
    body.requestId = this.context.requestId;

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, requestId: body.requestId, code: body.code },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, body.statusCode);
  }

  private toBody(exception: unknown): ErrorResponseBody {
    // 1. Rate limiting.
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please wait a moment and try again.',
        code: ErrorCodes.RATE_LIMITED,
      };
    }

    // 2. Anything thrown by our code or by Nest (including ValidationPipe).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { statusCode: status, message: response, code: defaultCodeFor(status) };
      }

      const payload = response as Record<string, unknown>;
      // class-validator reports an array of messages; join them for humans and
      // keep the full list in `details` for field-level display.
      const rawMessage = payload.message;
      const message = Array.isArray(rawMessage) ? String(rawMessage[0]) : typeof rawMessage === 'string' ? rawMessage : exception.message;

      return {
        statusCode: status,
        message,
        code: (payload.code as ErrorCode) ?? defaultCodeFor(status),
        details: payload.details ?? (Array.isArray(rawMessage) ? { errors: rawMessage } : undefined),
      };
    }

    // 3. Tenant isolation violations from the Prisma extension.
    if (exception instanceof CrossTenantAccessError) {
      return { statusCode: HttpStatus.FORBIDDEN, message: 'You do not have access to this resource.', code: ErrorCodes.TENANT_MISMATCH };
    }
    if (exception instanceof MissingTenantContextError) {
      // A programming error: a query ran outside a tenant scope.
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error.', code: ErrorCodes.TENANT_CONTEXT_MISSING };
    }

    // 4. Database errors worth translating.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.filter((f) => f !== 'tenantId');
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'That record already exists.',
          code: ErrorCodes.CONFLICT,
          details: target?.length ? { fields: target } : undefined,
        };
      }
      if (exception.code === 'P2025') {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Not found.', code: ErrorCodes.NOT_FOUND };
      }
      if (exception.code === 'P2023') {
        // Malformed identifier (e.g. a non-UUID where a uuid column is expected).
        return { statusCode: HttpStatus.BAD_REQUEST, message: 'That identifier is not valid.', code: ErrorCodes.VALIDATION_FAILED };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'This record is still referenced by other data.',
          code: ErrorCodes.CONFLICT,
        };
      }
    }

    // 5. Everything else: say nothing useful to a caller, log everything.
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error.', code: ErrorCodes.INTERNAL };
  }
}

function defaultCodeFor(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCodes.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCodes.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCodes.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCodes.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCodes.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCodes.RATE_LIMITED;
    default:
      return ErrorCodes.INTERNAL;
  }
}

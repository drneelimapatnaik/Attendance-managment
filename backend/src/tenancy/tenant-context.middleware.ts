/**
 * Opens the per-request tenant context.
 *
 * Runs before guards and controllers, so everything downstream — including the
 * Prisma extension — shares one AsyncLocalStorage store. At this point the request
 * is still unauthenticated, so the only tenant hint available is the `X-Tenant`
 * institute code header the client sends (see frontend/src/services/http.ts).
 * The authoritative tenant is set later by JwtAuthGuard from the verified token.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/** Header the web/mobile client sends with the institute code, e.g. `X-Tenant: APEX`. */
export const TENANT_HEADER = 'x-tenant';
export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly context: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerCode = req.headers[TENANT_HEADER];
    const instituteCode = typeof headerCode === 'string' && headerCode.trim() ? headerCode.trim().toUpperCase() : undefined;

    // Reuse an upstream request id (load balancer / gateway) when there is one so
    // logs correlate end to end; otherwise mint one.
    const incomingId = req.headers[REQUEST_ID_HEADER];
    const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId.trim().slice(0, 64) : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, requestId);

    // No tenantId yet: an institute code is user input until a token proves it.
    this.context.run({ requestId, instituteCode }, () => next());
  }
}

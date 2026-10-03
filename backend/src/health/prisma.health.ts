/**
 * Terminus health indicator for PostgreSQL.
 *
 * Runs `SELECT 1` with a timeout: a database that accepts connections but never
 * answers is not healthy, and the probe must not hang the whole check.
 */
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '@/prisma/prisma.service';

const PING_TIMEOUT_MS = 3_000;

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database ping timed out')), PING_TIMEOUT_MS)),
      ]);
      return this.getStatus(key, true, { responseTimeMs: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database unreachable';
      throw new HealthCheckError('Database check failed', this.getStatus(key, false, { message }));
    }
  }
}

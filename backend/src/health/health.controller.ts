/**
 * Health checks (outside the /api/v1 prefix, so probes have a stable URL).
 *
 *   GET /health       — liveness + database readiness (what Docker and k8s poll)
 *   GET /health/live  — liveness only: is the process up?
 *   GET /health/ready — readiness: can it serve traffic (database reachable)?
 *
 * The database probe is a real `SELECT 1` through Prisma, not a connection-pool
 * flag, so a wedged database fails the check.
 */
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService, HealthIndicatorResult, MemoryHealthIndicator } from '@nestjs/terminus';
import { Public } from '@/common/decorators/auth.decorators';
import { PrismaHealthIndicator } from './prisma.health';

@ApiTags('health')
// Version-neutral and excluded from the global prefix, so the URL stays /health
// whatever the API version is — probes and orchestrators should never change.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness and database readiness' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      (): Promise<HealthIndicatorResult> => this.prisma.pingCheck('database'),
      // 512 MB of heap is far more than this API should ever hold.
      (): Promise<HealthIndicatorResult> => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness only — the process is running' })
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — the database answers' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([(): Promise<HealthIndicatorResult> => this.prisma.pingCheck('database')]);
  }
}

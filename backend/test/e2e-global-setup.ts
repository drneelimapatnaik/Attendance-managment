/**
 * E2E bootstrap: decide whether a database is reachable.
 *
 * The end-to-end suite needs PostgreSQL. Rather than failing on a laptop with no
 * Docker running, it probes the database once here and exports the answer through
 * the environment; the spec file then either runs or reports itself as skipped.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export default async function globalSetup(): Promise<void> {
  process.env.E2E_DATABASE_AVAILABLE = 'false';

  if (!process.env.DATABASE_URL) {
    console.warn('\n[e2e] DATABASE_URL is not set — skipping the end-to-end suite.\n');
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    process.env.E2E_DATABASE_AVAILABLE = 'true';
  } catch {
    console.warn('\n[e2e] No database at DATABASE_URL — skipping the end-to-end suite. Start one with `docker compose up -d`.\n');
  } finally {
    await prisma.$disconnect();
  }
}

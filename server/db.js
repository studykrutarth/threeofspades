import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

// Use a global variable to prevent multiple instances in dev
const globalForPrisma = globalThis;

let prisma = globalForPrisma.prisma;

function sanitizeError(error) {
  const message = error?.message || String(error);
  return [process.env.DATABASE_URL, process.env.JWT_SECRET]
    .filter(Boolean)
    .reduce((safeMessage, secret) => safeMessage.replaceAll(secret, '[redacted]'), message);
}

export function describeDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    return {
      ok: false,
      message: 'DATABASE_URL is missing. Add it to the root .env file.'
    };
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return {
      ok: false,
      message: 'DATABASE_URL is set, but it is not a valid URL.'
    };
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    return {
      ok: false,
      message: `DATABASE_URL uses "${parsed.protocol}" but Prisma expects a PostgreSQL URL like postgresql://...`
    };
  }

  const databaseName = parsed.pathname.replace(/^\//, '') || '<missing database>';
  const port = parsed.port ? `:${parsed.port}` : '';

  return {
    ok: true,
    message: `DATABASE_URL found for ${parsed.protocol}//${parsed.hostname}${port}/${databaseName}`
  };
}

if (!prisma) {
  try {
    prisma = new PrismaClient({
      log: ['warn', 'error'],
    });
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
  } catch (error) {
    console.warn('Failed to initialize Prisma Client:', error.message);
    prisma = null;
  }
}

export async function checkDatabaseConnection({ timeoutMs = 10000 } = {}) {
  const databaseUrlStatus = describeDatabaseUrl();
  const log = databaseUrlStatus.ok ? console.log : console.warn;
  log(`[db] ${databaseUrlStatus.message}`);

  if (!databaseUrlStatus.ok || !prisma) {
    console.warn('[db] Skipping database connection check.');
    return false;
  }

  try {
    await Promise.race([
      (async () => {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);

    console.log('[db] Prisma connected to PostgreSQL successfully.');
    return true;
  } catch (error) {
    console.error(`[db] Prisma connection failed: ${sanitizeError(error)}`);
    return false;
  }
}

export { prisma };

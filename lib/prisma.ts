import { PrismaClient, Prisma } from "@prisma/client";

// Reuse a single Prisma instance in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const devLogLevels: Prisma.LogLevel[] = [
  ...(process.env.PRISMA_LOG_QUERIES === "1"
    ? (["query"] as Prisma.LogLevel[])
    : []),
  "error",
  "warn",
];

const prodLogLevels: Prisma.LogLevel[] = ["error", "warn"];

const prismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? devLogLevels : prodLogLevels,
  });

// Simple slow-query logger; guard for Accelerate/Data Proxy where $use is unavailable.
const slowThresholdMs =
  Number(process.env.SLOW_QUERY_THRESHOLD_MS || "500") || 500;

if (typeof (prismaClient as any).$use === "function") {
  (prismaClient as any).$use(async (params: any, next: any) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;

    if (duration > slowThresholdMs) {
      console.warn(
        `[prisma] slow query (${duration}ms) model=${params.model} action=${params.action}`,
      );
    }

    return result;
  });
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}

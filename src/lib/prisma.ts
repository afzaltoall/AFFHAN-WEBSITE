import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Prisma error codes that mean "the database was not ready", not "the query
 * was wrong". Retrying these is worthwhile; retrying anything else just runs a
 * broken query twice.
 *
 *   P1001  cannot reach the database server
 *   P1002  connection timed out
 *   P1008  operation timed out
 *   P1017  server closed the connection
 *   P2024  timed out taking a connection from the pool
 */
const TRANSIENT = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

function isTransient(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT.has(code)) return true;
  // Initialisation failures surface without a code on some versions; the
  // message is the only thing left to go on.
  const name = (error as { constructor?: { name?: string } }).constructor?.name;
  return name === "PrismaClientInitializationError";
}

/**
 * Run a query, retrying if the database was merely asleep.
 *
 * Neon's free tier suspends the compute after about five minutes idle. The
 * first request after that wakes it, and while it is waking, queries fail —
 * P1001 if the server is unreachable yet, P2024 if they queue past the pool
 * timeout. Nothing is wrong with the query or the data; the database simply
 * was not there yet.
 *
 * The admin dashboard felt this hardest because it fires more concurrent
 * queries than the connection pool holds, so a cold start turned into a
 * full-page PrismaClientKnownRequestError. A short backoff covers the wake-up,
 * which takes a couple of seconds.
 *
 * Deliberately not a general-purpose retry: only the codes above are retried,
 * a genuine query bug still fails immediately and loudly, and the last error
 * is rethrown so nothing is swallowed.
 */
export async function withDbRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      // 300ms, then 900ms — enough for a Neon resume without making a real
      // outage take three times as long to report.
      await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(3, attempt)));
    }
  }
  throw lastError;
}

import { PrismaClient } from "@prisma/client";

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
  // Initialisation failures surface without a code on some versions; the class
  // name is the only thing left to go on.
  return (error as { constructor?: { name?: string } }).constructor?.name === "PrismaClientInitializationError";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retrying<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts - 1) throw error;
      // 300ms then 900ms — enough to cover a compute resuming, without making
      // a real outage take three times as long to report.
      await wait(300 * Math.pow(3, attempt));
    }
  }
  throw lastError;
}

/**
 * The Prisma client, with every query retried when the database is merely
 * waking up.
 *
 * The compute behind this database scales to zero after a few minutes idle, so
 * the first request after a pause can fail with P1001 while it comes back.
 * That is what produced a 500 on the admin login — the front door, where a
 * single failed query locks the admin out entirely and the only recovery is to
 * press the button again.
 *
 * The retry lives in the client rather than at the call sites deliberately.
 * There are thirty-six files issuing queries here; wrapping each one means
 * remembering to wrap the next one too, and the one that gets forgotten will
 * be the one that matters. Extending the client covers all of them, including
 * the sixteen queries in the CJ sync, and cannot be forgotten.
 *
 * Only the codes above are retried, so a genuine query bug still fails at once
 * and the last error is rethrown rather than swallowed. Interactive
 * transactions are not affected: $allOperations does not wrap $transaction, and
 * a connection error means the transaction never opened.
 */
function makeClient() {
  return new PrismaClient().$extends({
    query: {
      async $allOperations({ args, query }) {
        return retrying(() => query(args));
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof makeClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Retry a group of queries as a unit.
 *
 * The client already retries each query on its own. This is for the case where
 * several run together and it is the whole batch that should be reattempted —
 * the dashboard's Promise.all, where one cold query failing means the page has
 * no data regardless of what the others returned.
 */
export const withDbRetry = retrying;

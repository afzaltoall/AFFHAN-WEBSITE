import { cache } from "react";
import { prisma, withDbRetry } from "@/lib/prisma";

/**
 * The figures beside the rail's rows, for every admin page.
 *
 * They were the dashboard's alone, and not because anybody decided that: the
 * dashboard loads its lists anyway, counted them in the browser, and put the
 * numbers on its own rail. Every other page gets AdminRail, which had nothing
 * to put there — so "3 new inquiries" was visible on /admin and invisible on
 * Staff, Suppliers and the rest. A number that is only sometimes there
 * is worse than no number: it reads as zero.
 *
 * So the counting happens here, in the console layout, which is the one piece
 * of server code every admin route already runs. One statement, seven
 * count(*)s, none of them touching Product — the biggest table any of them
 * reads is Supplier at a few hundred rows, and the layout renders alongside
 * the page rather than before it, so it costs a page load nothing it waits on.
 *
 * cache() for the case the dashboard ever wants the same figures: React keeps
 * one call per request, so asking twice is one query.
 *
 * WHEN IT FAILS IT RETURNS NULL, not zeroes. Zero is a fact — no new
 * inquiries, an empty pool — and handing it back for "the database did not
 * answer" tells an administrator the office is quiet when in truth nobody
 * asked. Null means "no figure", the rail prints none, and the badges are
 * simply absent, which is what they looked like before any of this existed.
 */
export interface RailCounts {
  /** Inquiries nobody has triaged yet. */
  inquiries: number;
  /** Contact Us messages, the same. */
  contacts: number;
  /** Freight quote requests from /shipping/, the same. */
  shipping: number;
  /** In Recently Deleted — inquiries, which is what that view restores. */
  trash: number;
  suppliers: number;
  videos: number;
  /**
   * Customers waiting in the open pool right now: the figure on the Inquiries row since the Queue page went (the
   * owner, 2026-10-22). The untriaged counts above still make the phone's Menu badge.
   */
  pool: number;
  /**
   * Supplier applications nobody has looked at yet (status NEW), from the
   * supplier portal. Null when they could not be counted: read on its own, so
   * that a failure here costs this one figure and not the whole rail.
   */
  newSuppliers: number | null;
}

/**
 * "New" is every status that is not handled, spam or deleted — the same rule
 * the console's own asStatus() applies, rather than `status = 'new'`. They
 * differ on a row carrying anything unexpected, and the two rails disagreeing
 * about one row is exactly the thing this file exists to prevent.
 */
export const railCounts = cache(async (): Promise<RailCounts | null> => {
  const newSuppliers = countNewSupplierOffers();
  try {
    const [row] = await withDbRetry(() =>
      prisma.$queryRaw<[{
        inquiries: bigint; contacts: bigint; shipping: bigint; trash: bigint;
        suppliers: bigint; videos: bigint; pool: bigint;
      }]>`
        SELECT
          (SELECT count(*) FROM "Inquiry"        WHERE status NOT IN ('handled', 'spam', 'deleted')) AS inquiries,
          (SELECT count(*) FROM "ContactMessage" WHERE status NOT IN ('handled', 'spam', 'deleted')) AS contacts,
          (SELECT count(*) FROM "ShipmentInquiry" WHERE status NOT IN ('handled', 'spam', 'deleted')) AS shipping,
          (SELECT count(*) FROM "Inquiry"        WHERE status = 'deleted')                           AS trash,
          (SELECT count(*) FROM "Supplier")                                                          AS suppliers,
          (SELECT count(*) FROM "Video")                                                             AS videos,
          (SELECT count(*) FROM "LeadQueueEntry" WHERE state = 'OPEN')                               AS pool
      `
    );
    return {
      inquiries: Number(row.inquiries),
      contacts: Number(row.contacts),
      shipping: Number(row.shipping),
      trash: Number(row.trash),
      suppliers: Number(row.suppliers),
      videos: Number(row.videos),
      pool: Number(row.pool),
      newSuppliers: await newSuppliers,
    };
  } catch (error) {
    // Decoration, not the page. A sleeping database must cost an administrator
    // the numbers on the rail, never the page they asked for.
    console.error(
      "rail counts failed:",
      error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown",
    );
    return null;
  }
});

let warnedNotSetUp = false;

/**
 * Applications from the supplier portal waiting for the team (status NEW).
 *
 * Its own statement and its own catch, unlike the seven above: the table is
 * the newest in the schema, and if the portal's code ever reaches a database
 * that does not have it yet, the rail should lose this figure alone. Started
 * before the statement above so the two run side by side.
 */
async function countNewSupplierOffers(): Promise<number | null> {
  // Not set up yet, rather than broken: a Prisma client generated before the model existed (a dev server that
  // has not restarted since `prisma generate`), or a database without the table (P2021: the migration not
  // applied). Said once per server as a warning: as an error, Next's dev overlay put it in front of every
  // admin page (the owner's screenshot, 2026-10-21) while the rail was doing exactly what it should, showing
  // no figure.
  const notSetUp = (error?: unknown) => {
    if (!warnedNotSetUp) {
      warnedNotSetUp = true;
      console.warn(
        "rail count of supplier applications: the supplier portal is not set up here yet " +
          `(${error ? "its table is missing: apply prisma/migrations/20261021120000_supplier_portal" : "run prisma generate and restart"}); showing no figure.`,
      );
    }
    return null;
  };
  if (!(prisma as unknown as { supplierOffer?: unknown }).supplierOffer) return notSetUp();
  try {
    return await prisma.supplierOffer.count({ where: { status: "NEW" } });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2021") return notSetUp(error);
    console.error(
      "rail count of supplier applications failed:",
      error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown",
    );
    return null;
  }
}

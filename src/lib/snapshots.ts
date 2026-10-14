import crypto from "node:crypto";
import { Prisma } from ".prisma/client";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TAG_CATEGORIES, TAG_PRODUCTS, TAG_SNAPSHOTS } from "@/lib/cacheTags";
import { drawKeys } from "@/lib/drawKeys";
import { blockedCategoryIdSet, blockedNameRegex, blockedProductIdList } from "@/lib/moderation";
import { catalogueInput, computeGrid, computeMore, computeRails, computeSpotlight, computeTrades } from "@/lib/homeGrid";
import { computeHeroPool } from "@/lib/products";
import { sumProductCounts } from "@/lib/categoryCounts";
import {
  pruneSnapshots,
  readMeta,
  releaseRefreshLock,
  storedKeys,
  takeRefreshLock,
  writeMeta,
  writeSnapshot,
} from "@/lib/snapshotStore";

// ---------------------------------------------------------------------------
// The daily refresh (2026-10-14): everything the site used to compute on a
// visitor's request whenever an hour's cache ran out, done once a day by the
// cron (/api/cron/refresh) and stored (lib/snapshotStore.ts). On Neon that
// work was the load that took the site down: the homepage's draws ran the
// 650-character name pattern over hundreds of thousands of rows, and every
// instance that missed the cache at the same moment ran them again.
//
// In order, each step on its own so one failing costs only itself:
//   1. the name flags (Product.isBlockedName): every product again once the
//      pattern in moderation.ts has changed (resumed across runs if it does not
//      finish in one), otherwise only the products written since last time;
//   2. each category's count (Category.productCount) and the catalogue's total;
//   3. the homepage's draws for today and tomorrow (the grid for this week and
//      tomorrow's), so the draw a visitor needs after midnight IST was made
//      before it; and the hero's pool;
//   4. old draws pruned, and the caches that read any of it dropped.
//
// One run at a time across every instance (the lock row), and not again within
// FRESH_FOR of the last unless asked (?force=1) or something is missing.
// ---------------------------------------------------------------------------

/** Longer than a run can take (the route's maxDuration), so a run that dies only delays the next. */
const LOCK_TTL_MS = 10 * 60_000;
/** A run within this of the last one does nothing, unless today's draws are missing or a re-flag is under way. */
const FRESH_FOR_MS = 20 * 3_600_000;
/** Products re-flagged per statement in a full pass: an id range, so each one is a short primary-key scan. */
const FLAG_BATCH = 25_000;
/** Draws kept: a fortnight. */
const KEEP_DAYS = 14;

interface FlagState {
  /** The pattern the flags were last made from (a SHA-256 of blockedNameRegex()). */
  hash: string;
  /** When that pass began: products written after it are flagged by the next run. */
  at: string;
  /** A full pass under way for a new pattern, and how far it has got. */
  pending?: { hash: string; cursor: number; startedAt: string };
}

interface RefreshState {
  at: string;
  ms: number;
}

export interface RefreshReport {
  ran: boolean;
  reason?: string;
  flags?: { mode: "full" | "new"; changed: number; done: boolean; cursor?: number };
  counts?: { changed: number; total: number };
  stored?: string[];
  failed?: string[];
  pruned?: number;
  ms: number;
}

const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/**
 * Bring the name flags up to date with moderation.ts, within `deadline`.
 *
 * A new pattern means every product again, in id ranges, picked up where the
 * last run stopped if it ran out of time. The same pattern means only the
 * products written since the last pass, by lastSynced, which every writer
 * sets (the EPROLO ingest; nothing in the app writes products any more), with
 * a day's overlap for a writer's clock.
 */
async function flagBlockedNames(deadline: number): Promise<NonNullable<RefreshReport["flags"]>> {
  const pattern = blockedNameRegex();
  const hash = hashOf(pattern);
  const state = await readMeta<FlagState>("blocked-names");

  if (state?.hash === hash && !state.pending) {
    const since = new Date(Date.parse(state.at) - 86_400_000);
    const startedAt = new Date().toISOString();
    // In two steps, so the pattern runs on the products written since and on
    // nothing else. In one UPDATE with both conditions, Postgres put the
    // pattern first and ran it on every row: 13.4s on the dev branch for a day
    // in which nothing had been written (EXPLAIN ANALYZE, 2026-10-14).
    const recent = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT "id" FROM "Product" WHERE "lastSynced" >= ${since.toISOString()}::timestamp`);
    let changed = 0;
    for (let i = 0; i < recent.length; i += 1000) {
      const ids = recent.slice(i, i + 1000).map((r) => r.id);
      changed += await prisma.$executeRaw(Prisma.sql`
        UPDATE "Product" SET "isBlockedName" = ("name" ~* ${pattern})
        WHERE "id" IN (${Prisma.join(ids)}) AND "isBlockedName" IS DISTINCT FROM ("name" ~* ${pattern})`);
    }
    await writeMeta("blocked-names", { hash, at: startedAt } satisfies FlagState);
    return { mode: "new", changed, done: true };
  }

  const resume = state?.pending?.hash === hash ? state.pending : null;
  let cursor = resume?.cursor ?? 0;
  const startedAt = resume?.startedAt ?? new Date().toISOString();
  const top = (await prisma.product.aggregate({ _max: { id: true } }))._max.id ?? 0;
  let changed = 0;
  while (cursor < top) {
    if (Date.now() > deadline) {
      await writeMeta("blocked-names", { ...(state ?? { hash: "", at: startedAt }), pending: { hash, cursor, startedAt } } satisfies FlagState);
      return { mode: "full", changed, done: false, cursor };
    }
    const next = cursor + FLAG_BATCH;
    changed += await prisma.$executeRaw(Prisma.sql`
      UPDATE "Product" SET "isBlockedName" = ("name" ~* ${pattern})
      WHERE "id" > ${cursor} AND "id" <= ${next} AND "isBlockedName" IS DISTINCT FROM ("name" ~* ${pattern})`);
    cursor = next;
  }
  await writeMeta("blocked-names", { hash, at: startedAt } satisfies FlagState);
  return { mode: "full", changed, done: true };
}

/** Each category's shown products, stored on it; returns how many figures moved and the catalogue's total. */
async function recountCategories(): Promise<{ changed: number; total: number }> {
  const ids = blockedProductIdList();
  const notListed = ids ? Prisma.sql`AND "id" NOT IN (${Prisma.join(ids)})` : Prisma.empty;
  // One pass over the products, by the (categoryId, isBlockedName, id) index;
  // only the figures that differ are written.
  const changed = await prisma.$executeRaw(Prisma.sql`
    WITH n AS (
      SELECT "categoryId" AS id, count(*)::int AS count
      FROM "Product"
      WHERE "isBlockedName" = false AND "categoryId" IS NOT NULL ${notListed}
      GROUP BY 1
    )
    UPDATE "Category" c SET "productCount" = coalesce(n.count, 0)
    FROM "Category" c2 LEFT JOIN n ON n.id = c2.id
    WHERE c.id = c2.id AND c."productCount" IS DISTINCT FROM coalesce(n.count, 0)`);
  // The catalogue's total, as the unfiltered catalogue shows it: every category
  // that is not moderated, and the products filed under none.
  const all = await prisma.category.findMany({ select: { id: true, name: true, parentId: true, productCount: true } });
  const blocked = blockedCategoryIdSet(all);
  const [uncategorised] = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT count(*)::int AS count FROM "Product"
    WHERE "categoryId" IS NULL AND "isBlockedName" = false ${notListed}`);
  const total = sumProductCounts(all, all.filter((c) => !blocked.has(c.id)).map((c) => c.id)) + Number(uncategorised?.count ?? 0);
  await writeSnapshot("catalogue-total", "current", total);
  return { changed, total };
}

/** Is there anything to do: never refreshed, too long ago, a draw missing for today or tomorrow, or a re-flag under way. */
async function due(now: Date): Promise<string | null> {
  const [state, flags] = await Promise.all([readMeta<RefreshState>("refresh"), readMeta<FlagState>("blocked-names")]);
  if (!state) return "never refreshed";
  if (Date.now() - Date.parse(state.at) > FRESH_FOR_MS) return "older than 20 hours";
  if (!flags || flags.hash !== hashOf(blockedNameRegex()) || flags.pending) return "name flags out of date";
  const keys = drawKeys(now);
  const days = keys.days.map(String);
  const [spotlights, grids] = await Promise.all([
    storedKeys("home-spotlight", days),
    storedKeys("home-grid", keys.weeks.map((w) => w.key)),
  ]);
  if (days.some((d) => !spotlights.has(d)) || keys.weeks.some((w) => !grids.has(w.key))) return "a draw is missing";
  return null;
}

/**
 * Run the refresh if it is due (or `force`), under the lock. Never throws: what
 * failed is in the report, and the site keeps what it had.
 */
export async function refreshSnapshots({ now = new Date(), force = false, budgetMs = 45_000 } = {}): Promise<RefreshReport> {
  const started = Date.now();
  const report: RefreshReport = { ran: false, ms: 0 };
  try {
    const reason = force ? "forced" : await due(now);
    if (!reason) return { ...report, reason: "fresh", ms: Date.now() - started };
    if (!(await takeRefreshLock(LOCK_TTL_MS))) return { ...report, reason: "another refresh is running", ms: Date.now() - started };
    report.ran = true;
    report.reason = reason;
    report.stored = [];
    report.failed = [];
    try {
      // At most half the budget for flags: a long re-flag resumes next run, and the draws still get made.
      report.flags = await flagBlockedNames(started + budgetMs / 2).catch((e) => {
        console.error("[refresh] name flags failed", e);
        report.failed!.push("flags");
        return undefined;
      });
      report.counts = await recountCategories().catch((e) => {
        console.error("[refresh] counts failed", e);
        report.failed!.push("counts");
        return undefined;
      });
      if (report.counts) report.stored.push("catalogue-total:current");

      const input = await catalogueInput();
      const keys = drawKeys(now);
      const step = async (label: string, run: () => Promise<void>) => {
        try {
          await run();
          report.stored!.push(label);
        } catch (e) {
          console.error(`[refresh] ${label} failed`, e);
          report.failed!.push(label);
        }
      };
      for (const week of keys.weeks) {
        await step(`home-grid:${week.key}`, async () => writeSnapshot("home-grid", week.key, await computeGrid(input, week.key, week.span)));
      }
      for (const day of keys.days) {
        const spotlight = await computeSpotlight(input, day).catch((e) => {
          console.error(`[refresh] home-spotlight:${day} failed`, e);
          report.failed!.push(`home-spotlight:${day}`);
          return undefined;
        });
        if (spotlight === undefined) continue; // the lower sections leave out the spotlight's products: without it, keep yesterday's
        await step(`home-spotlight:${day}`, () => writeSnapshot("home-spotlight", String(day), spotlight));
        await step(`home-rails:${day}`, async () => writeSnapshot("home-rails", String(day), await computeRails(input, day, spotlight)));
        await step(`home-trades:${day}`, async () => writeSnapshot("home-trades", String(day), await computeTrades(input, day, spotlight)));
        await step(`home-more:${day}`, async () => writeSnapshot("home-more", String(day), await computeMore(input, day, spotlight)));
      }
      await step("hero-pool:current", async () => writeSnapshot("hero-pool", "current", await computeHeroPool([...input.cleanIds])));

      report.pruned = await pruneSnapshots(KEEP_DAYS).catch(() => 0);
      await writeMeta("refresh", { at: now.toISOString(), ms: Date.now() - started } satisfies RefreshState);
    } finally {
      await releaseRefreshLock().catch((e) => console.error("[refresh] could not release the lock (it expires by itself)", e));
    }
    // The new draws, counts and flags, read from here on: drop what the hour's caches hold.
    for (const tag of [TAG_SNAPSHOTS, TAG_CATEGORIES, TAG_PRODUCTS]) revalidateTag(tag, { expire: 0 });
  } catch (e) {
    console.error("[refresh] failed", e);
    report.failed = [...(report.failed ?? []), "refresh"];
  }
  report.ms = Date.now() - started;
  return report;
}

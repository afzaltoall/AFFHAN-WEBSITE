import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVALID, NOT_STARTED, type LeadOutcomeKey } from "@/lib/leadStatus";

/**
 * How the sales team is doing, counted once for everybody.
 *
 * The question every one of these screens asks is the same: take each lead
 * somebody holds, find its NEWEST outcome, and count the answers. The console,
 * the profile and the activity feed have each answered it their own way over
 * the past week — and the team page cannot, because "once per employee" is
 * five round trips today and thirty when the office grows.
 *
 * So it is one statement, and this is the only place that knows how to write
 * it. DISTINCT ON is the reason it is raw SQL, the same reason the console's
 * own outcome query is: "the latest row per lead" is one index scan that way
 * (StatusUpdate is indexed on inquiryId/contactId + createdAt desc), where the
 * ORM wants either every row back to reduce in JavaScript or one query per
 * lead.
 *
 * WHAT IS COUNTED. Leads ASSIGNED to the person — their book, not everything
 * they have ever touched. A lead they recorded against and then handed on
 * belongs to whoever holds it now; their own work on it survives in `recorded`
 * and in the history table, which is where "what have they been doing" is
 * answered.
 */

export interface PerformanceRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  region: string | null;
  isActive: boolean;
  /** Their whole book: quote requests and messages together. */
  assigned: number;
  inquiries: number;
  contacts: number;
  /** Their book by newest outcome. These five add up to `assigned`. */
  counts: Record<LeadOutcomeKey, number>;
  /** Outcomes they have written, all time, whoever holds the lead now. */
  recorded: number;
  /** And in the last seven days, against the seven before that. */
  thisWeek: number;
  lastWeek: number;
}

/**
 * Lead ÷ (Lead + No lead) — the one number a manager reads first.
 *
 * Deliberately excludes everything still open. A salesperson with nine leads
 * in progress and one won has not won 10%; they have won the one thing that
 * has been decided, and the rest has not happened yet. Null when nothing has
 * been decided at all, because 0% and "no answer yet" are different facts and
 * the screens say so differently.
 */
export function winRateOf(lead: number, noLead: number): number | null {
  const decided = lead + noLead;
  return decided === 0 ? null : Math.round((lead / decided) * 100);
}

/** Their book, in the order the screens show it. */
const emptyCounts = (): Record<LeadOutcomeKey, number> => ({
  LEAD: 0, NO_LEAD: 0, NOT_ATTENDED: 0, IN_PROGRESS: 0, [INVALID]: 0, [NOT_STARTED]: 0,
});

interface CountsRow {
  id: string; name: string; email: string; image: string | null; region: string | null; isActive: boolean;
  assigned: number; inquiries: number; contacts: number;
  lead: number; no_lead: number; not_attended: number; in_progress: number; invalid: number; not_started: number;
}

interface RecordedRow {
  employeeId: string;
  recorded: number;
  this_week: number;
  last_week: number;
}

/**
 * Everybody's figures, or one person's.
 *
 * Two statements whichever is asked for: the book by outcome, and what each
 * person has recorded. Not two per employee — that is the whole point.
 *
 * `employeeId` narrows it to one person and includes them whether or not they
 * are still active, because an administrator opening a deactivated
 * colleague's page is asking about their record, not their availability.
 */
export async function leadPerformance(opts: { employeeId?: string } = {}): Promise<PerformanceRow[]> {
  const one = opts.employeeId ?? null;
  // A fragment rather than string concatenation: the id still travels as a
  // bound parameter, which is what keeps a raw query safe.
  const scope = one ? Prisma.sql`e.id = ${one}` : Prisma.sql`e."isActive" = true`;

  const [counts, recorded] = await Promise.all([
    prisma.$queryRaw<CountsRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (COALESCE(su."inquiryId", su."contactId"))
               COALESCE(su."inquiryId", su."contactId") AS lead_id, su.status
          FROM "StatusUpdate" su
         ORDER BY COALESCE(su."inquiryId", su."contactId"), su."createdAt" DESC
      ),
      leads AS (
        SELECT id, "assignedToId", 'inquiry' AS kind FROM "Inquiry"
         WHERE status <> 'deleted' AND "assignedToId" IS NOT NULL
        UNION ALL
        SELECT id, "assignedToId", 'contact' AS kind FROM "ContactMessage"
         WHERE status <> 'deleted' AND "assignedToId" IS NOT NULL
      )
      SELECT e.id, e.name, e.email, e.image, e.region, e."isActive",
             COUNT(l.id)::int                                                            AS assigned,
             COUNT(*) FILTER (WHERE l.kind = 'inquiry')::int                             AS inquiries,
             COUNT(*) FILTER (WHERE l.kind = 'contact')::int                             AS contacts,
             COUNT(*) FILTER (WHERE latest.status = 'LEAD')::int                         AS lead,
             COUNT(*) FILTER (WHERE latest.status = 'NO_LEAD')::int                      AS no_lead,
             COUNT(*) FILTER (WHERE latest.status = 'NOT_ATTENDED')::int                 AS not_attended,
             COUNT(*) FILTER (WHERE latest.status = 'IN_PROGRESS')::int                  AS in_progress,
             COUNT(*) FILTER (WHERE latest.status = 'INVALID')::int                      AS invalid,
             COUNT(*) FILTER (WHERE l.id IS NOT NULL AND latest.lead_id IS NULL)::int     AS not_started
        FROM "Employee" e
        LEFT JOIN leads  l ON l."assignedToId" = e.id
        LEFT JOIN latest   ON latest.lead_id = l.id
       WHERE ${scope}
       GROUP BY e.id, e.name, e.email, e.image, e.region, e."isActive"
       ORDER BY assigned DESC, e.name ASC
    `,
    prisma.$queryRaw<RecordedRow[]>`
      SELECT "employeeId",
             COUNT(*)::int                                                                 AS recorded,
             COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')::int          AS this_week,
             COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '14 days'
                                AND "createdAt" <  now() - interval  '7 days')::int         AS last_week
        FROM "StatusUpdate"
       GROUP BY "employeeId"
    `,
  ]);

  const byEmployee = new Map(recorded.map((r) => [r.employeeId, r]));

  return counts.map((row) => {
    const mine = byEmployee.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      region: row.region,
      isActive: row.isActive,
      assigned: row.assigned,
      inquiries: row.inquiries,
      contacts: row.contacts,
      counts: {
        ...emptyCounts(),
        LEAD: row.lead,
        NO_LEAD: row.no_lead,
        NOT_ATTENDED: row.not_attended,
        IN_PROGRESS: row.in_progress,
        [INVALID]: row.invalid,
        [NOT_STARTED]: row.not_started,
      },
      recorded: mine?.recorded ?? 0,
      thisWeek: mine?.this_week ?? 0,
      lastWeek: mine?.last_week ?? 0,
    };
  });
}

/** The whole team as one figure, for the strip above the table. */
export function teamTotals(rows: PerformanceRow[]) {
  const totals = {
    staff: rows.length,
    assigned: 0,
    lead: 0,
    noLead: 0,
    open: 0,
    recorded: 0,
    thisWeek: 0,
    lastWeek: 0,
  };
  for (const r of rows) {
    totals.assigned += r.assigned;
    totals.lead += r.counts.LEAD;
    totals.noLead += r.counts.NO_LEAD;
    // Still somebody's to win or lose: nothing has been decided about these.
    totals.open += r.counts.IN_PROGRESS + r.counts.NOT_ATTENDED + r.counts[NOT_STARTED];
    totals.recorded += r.recorded;
    totals.thisWeek += r.thisWeek;
    totals.lastWeek += r.lastWeek;
  }
  return { ...totals, winRate: winRateOf(totals.lead, totals.noLead) };
}

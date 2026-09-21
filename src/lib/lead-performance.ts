import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVALID, NOT_STARTED, type LeadOutcomeKey } from "@/lib/leadStatus";

/**
 * How the sales team is doing, counted once for everybody.
 *
 * The question every one of these screens asks is the same: take each lead
 * somebody holds, find the newest outcome THEY recorded on it, and count the
 * answers. The console, the profile and the activity feed have each answered a
 * version of it their own way over the past week — and the team page cannot do
 * it per person, because "once per employee" is five round trips today and
 * thirty when the office grows.
 *
 * So it is one statement, and this is the only place that knows how to write
 * it. DISTINCT ON is the reason it is raw SQL, the same reason the console's
 * own outcome query is: "the latest row per lead per person" is one pass that
 * way, where the ORM wants either every row back to reduce in JavaScript or
 * one query per lead.
 *
 * WHAT IS COUNTED, and the correction that matters.
 *
 * A person's book is the leads ASSIGNED to them — that part has not changed.
 * What changed is whose work decides where a lead in that book stands.
 *
 * It used to be the newest entry on the lead, whoever wrote it, which is wrong
 * the moment a lead changes hands. Khaja marks a customer NOT_ATTENDED; the
 * rotation hands them straight on; and the newest entry on that lead is still
 * Khaja's, so the next holder's row read "Passed on 1 — 100%" for a customer
 * they had not so much as opened. To a manager glancing at the table that is a
 * person ducking their leads. It was in fact a person who had just been given
 * one. The same fault hit an admin reassigning a lead somebody had marked
 * IN_PROGRESS, or LEAD — the new holder inherited the working, or the win.
 *
 * So a lead is bucketed by the newest entry the CURRENT HOLDER wrote on it,
 * and by NOT_STARTED when they have written none. Their own earlier work on a
 * lead survives a round trip: if a customer comes back to somebody who had
 * already recorded something, that is what their row shows, because it is
 * still true of them.
 *
 * Nothing is erased. Khaja keeps his entry in `recorded`, in his week's
 * figures, in the history table on his page and in the activity feed, all of
 * which read the rows by author and always did. What stops is the bleed into
 * somebody else's column.
 *
 * The staff workspace has done half of this since it was built — it drops
 * other people's NOT_ATTENDED at the source (see the dashboard and profile
 * pages) so a salesperson gets an ordinary lead rather than one labelled with
 * two other people's refusals. The admin's screens were the half that never
 * caught up.
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
  /** Their book by what THEY last recorded on it. These five add up to `assigned`. */
  counts: Record<LeadOutcomeKey, number>;
  /**
   * What they have DONE, by author, whoever holds the lead now — counted in
   * customers, not rows. See the note on the second statement below.
   */
  recorded: number;
  /** Of those, the ones they passed on and the ones they won. */
  passedOn: number;
  won: number;
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
  passed_on: number;
  won: number;
  this_week: number;
  last_week: number;
}

/** Every live lead somebody holds — the team's book, both tables. */
const ASSIGNED_LEADS = Prisma.sql`
  leads AS (
    SELECT id, "assignedToId", 'inquiry' AS kind FROM "Inquiry"
     WHERE status <> 'deleted' AND "assignedToId" IS NOT NULL
    UNION ALL
    SELECT id, "assignedToId", 'contact' AS kind FROM "ContactMessage"
     WHERE status <> 'deleted' AND "assignedToId" IS NOT NULL
  )`;

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
      WITH mine AS (
        -- The newest row PER LEAD PER PERSON, not per lead. Adding the author
        -- to the DISTINCT ON key is the whole of the fix: joined on the holder
        -- below, it can only ever return what this person themselves last said
        -- about this lead. It costs a sort the per-lead version got free from
        -- the (inquiryId, createdAt desc) index, which on a table of this size
        -- is nothing worth trading the correctness for.
        SELECT DISTINCT ON (COALESCE(su."inquiryId", su."contactId"), su."employeeId")
               COALESCE(su."inquiryId", su."contactId") AS lead_id,
               su."employeeId"                          AS employee_id,
               su.status
          FROM "StatusUpdate" su
         ORDER BY COALESCE(su."inquiryId", su."contactId"), su."employeeId", su."createdAt" DESC
      ),
      ${ASSIGNED_LEADS}
      SELECT e.id, e.name, e.email, e.image, e.region, e."isActive",
             COUNT(l.id)::int                                                            AS assigned,
             COUNT(*) FILTER (WHERE l.kind = 'inquiry')::int                             AS inquiries,
             COUNT(*) FILTER (WHERE l.kind = 'contact')::int                             AS contacts,
             COUNT(*) FILTER (WHERE mine.status = 'LEAD')::int                           AS lead,
             COUNT(*) FILTER (WHERE mine.status = 'NO_LEAD')::int                        AS no_lead,
             COUNT(*) FILTER (WHERE mine.status = 'NOT_ATTENDED')::int                   AS not_attended,
             COUNT(*) FILTER (WHERE mine.status = 'IN_PROGRESS')::int                    AS in_progress,
             COUNT(*) FILTER (WHERE mine.status = 'INVALID')::int                        AS invalid,
             -- Nothing of their own on a lead they hold: untouched BY THEM,
             -- which is the honest reading of a lead that arrived this morning
             -- carrying somebody else's history.
             COUNT(*) FILTER (WHERE l.id IS NOT NULL AND mine.lead_id IS NULL)::int      AS not_started
        FROM "Employee" e
        LEFT JOIN leads l ON l."assignedToId" = e.id
        LEFT JOIN mine   ON mine.lead_id = l.id AND mine.employee_id = l."assignedToId"
       WHERE ${scope}
       GROUP BY e.id, e.name, e.email, e.image, e.region, e."isActive"
       ORDER BY assigned DESC, e.name ASC
    `,
    // What each person has DONE, by author — the other half of the page, and
    // the only part of it that survives a lead changing hands.
    //
    // COUNTED IN CUSTOMERS, NOT ROWS. An outcome is recorded against a
    // customer and stored against every product they asked about (see the
    // status route), so one thing somebody did arrives in this table as three
    // or four rows. COUNT(*) called that three or four pieces of work: a
    // salesperson who passed on one customer with four products scored the
    // same as one who passed on four customers. The customer is the unit of
    // work here for the same reason the rotation queue is keyed on it — one
    // person to call, however many things they asked about — and it is the
    // same key, Inquiry.customerKey.
    //
    // Rows with no customerKey fall back to their own lead id rather than
    // collapsing into one bucket together, which would count a whole column
    // of unkeyed rows as a single customer.
    //
    // The two filtered figures are the ones the "Recorded by them" group
    // prints; they cost nothing extra, being filters over a scan this
    // statement was already doing.
    prisma.$queryRaw<RecordedRow[]>`
      WITH acts AS (
        SELECT su."employeeId",
               COALESCE(i."customerKey", c."customerKey",
                        'lead:' || COALESCE(su."inquiryId", su."contactId")) AS customer,
               su.status, su."createdAt"
          FROM "StatusUpdate" su
          LEFT JOIN "Inquiry"        i ON i.id = su."inquiryId"
          LEFT JOIN "ContactMessage" c ON c.id = su."contactId"
      )
      SELECT "employeeId",
             COUNT(DISTINCT customer)::int                                        AS recorded,
             COUNT(DISTINCT customer) FILTER (WHERE status = 'NOT_ATTENDED')::int AS passed_on,
             COUNT(DISTINCT customer) FILTER (WHERE status = 'LEAD')::int         AS won,
             COUNT(DISTINCT customer) FILTER (
               WHERE "createdAt" >= now() - interval '7 days')::int                AS this_week,
             COUNT(DISTINCT customer) FILTER (
               WHERE "createdAt" >= now() - interval '14 days'
                 AND "createdAt" <  now() - interval  '7 days')::int               AS last_week
        FROM acts
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
      passedOn: mine?.passed_on ?? 0,
      won: mine?.won ?? 0,
      thisWeek: mine?.this_week ?? 0,
      lastWeek: mine?.last_week ?? 0,
    };
  });
}

/**
 * The team's own figures — the leads, not the people holding them.
 *
 * The strip above the table used to be the columns added up, which worked only
 * while a lead's outcome belonged to whoever held it. It does not any more,
 * and summing the new columns would mean a deal Khaja won and then handed on
 * for fulfilment counted for nobody: "Leads won" would drop by one, the win
 * rate with it, and no screen would say where it went.
 *
 * So the strip asks a different question, which is the one it was always
 * really asking. Each lead once, by its newest outcome, whoever recorded it.
 * The figures come out exactly as they read today; what is new is that they
 * stay that way when somebody hands a decided lead over.
 *
 * Scoped to assigned leads, as the strip always has been: it describes the
 * team's book, and an unassigned inquiry is not in anybody's.
 */
export async function assignedOutcomes(): Promise<Record<LeadOutcomeKey, number>> {
  const [row] = await prisma.$queryRaw<[{
    lead: number; no_lead: number; not_attended: number; in_progress: number; invalid: number; not_started: number;
  }]>`
    WITH latest AS (
      SELECT DISTINCT ON (COALESCE(su."inquiryId", su."contactId"))
             COALESCE(su."inquiryId", su."contactId") AS lead_id, su.status
        FROM "StatusUpdate" su
       ORDER BY COALESCE(su."inquiryId", su."contactId"), su."createdAt" DESC
    ),
    ${ASSIGNED_LEADS}
    SELECT COUNT(*) FILTER (WHERE latest.status = 'LEAD')::int          AS lead,
           COUNT(*) FILTER (WHERE latest.status = 'NO_LEAD')::int       AS no_lead,
           COUNT(*) FILTER (WHERE latest.status = 'NOT_ATTENDED')::int  AS not_attended,
           COUNT(*) FILTER (WHERE latest.status = 'IN_PROGRESS')::int   AS in_progress,
           COUNT(*) FILTER (WHERE latest.status = 'INVALID')::int       AS invalid,
           COUNT(*) FILTER (WHERE latest.lead_id IS NULL)::int          AS not_started
      FROM leads l
      LEFT JOIN latest ON latest.lead_id = l.id
  `;
  return {
    ...emptyCounts(),
    LEAD: row.lead,
    NO_LEAD: row.no_lead,
    NOT_ATTENDED: row.not_attended,
    IN_PROGRESS: row.in_progress,
    [INVALID]: row.invalid,
    [NOT_STARTED]: row.not_started,
  };
}

/**
 * The whole team as one figure, for the strip above the table.
 *
 * Two sources, deliberately. What each person has done — their book, what
 * they have recorded, this week and last — adds up from the rows, because
 * those are facts about people. What the team has achieved comes from
 * `assignedOutcomes`, because those are facts about leads, and a lead that
 * changes hands is still the same lead.
 */
export function teamTotals(rows: PerformanceRow[], outcomes: Record<LeadOutcomeKey, number>) {
  const totals = {
    staff: rows.length,
    assigned: 0,
    lead: outcomes.LEAD,
    noLead: outcomes.NO_LEAD,
    // Still somebody's to win or lose: nothing has been decided about these.
    open: outcomes.IN_PROGRESS + outcomes.NOT_ATTENDED + outcomes[NOT_STARTED],
    recorded: 0,
    thisWeek: 0,
    lastWeek: 0,
  };
  for (const r of rows) {
    totals.assigned += r.assigned;
    totals.recorded += r.recorded;
    totals.thisWeek += r.thisWeek;
    totals.lastWeek += r.lastWeek;
  }
  return { ...totals, winRate: winRateOf(totals.lead, totals.noLead) };
}

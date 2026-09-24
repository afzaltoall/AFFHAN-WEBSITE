import {
  INVALID, NOT_STARTED, OUTCOME_ORDER, outcomeMeta, type LeadOutcomeKey,
} from "@/lib/leadStatus";

/**
 * The three shapes every performance screen is built from.
 *
 * One definition each, because the admin's view of a salesperson, that
 * salesperson's own page and the team table all answer the same question and
 * should not each draw it differently. Plain elements, no charting library:
 * everything here is a rectangle with a colour, and importing a chart
 * framework to draw five rectangles would be weight for nothing.
 *
 * COLOUR. The five outcome colours, unchanged, in OUTCOME_ORDER — checked with
 * the palette validator rather than by eye: the worst neighbouring pair is
 * amber beside emerald at ΔE 8.9 under protanopia, above the floor, and the
 * worst pair in normal vision is 20.9. Two of the colours sit under 3:1
 * against white, which the validator flags as needing relief — so every
 * segment here is also named in words with its count beside it, and the team
 * table states the same numbers as text. Nothing is colour alone.
 */

/** Which outcomes a screen shows, and in which order. */
export const ADMIN_ORDER: readonly LeadOutcomeKey[] = OUTCOME_ORDER;
export const STAFF_ORDER: readonly LeadOutcomeKey[] = OUTCOME_ORDER.filter((k) => k !== INVALID);

type Counts = Record<LeadOutcomeKey, number>;

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/**
 * Where a book of leads stands, as one part-to-whole bar.
 *
 * A bar rather than a donut: the same shape has to be read down a column of
 * people on the team page, and lengths compare where angles do not. Thin,
 * with a 2px gap of surface between segments so two adjacent colours never
 * touch — which is what stops the amber/emerald pair having to carry the whole
 * distinction on hue.
 */
export function OutcomeBar({
  counts, total, order = ADMIN_ORDER, height = "h-3", className = "",
}: {
  counts: Counts;
  total: number;
  order?: readonly LeadOutcomeKey[];
  height?: string;
  className?: string;
}) {
  const parts = order.map((key) => ({ key, n: counts[key] ?? 0 })).filter((p) => p.n > 0);
  if (total === 0 || parts.length === 0) {
    return <div className={`${height} w-full rounded-[4px] bg-black/[0.06] ${className}`} aria-hidden />;
  }
  return (
    <div
      className={`flex ${height} w-full gap-[2px] ${className}`}
      role="img"
      aria-label={parts.map((p) => `${outcomeMeta(p.key).label} ${p.n}`).join(", ")}
    >
      {parts.map((p, i) => (
        <div
          key={p.key}
          title={`${outcomeMeta(p.key).label} · ${p.n} (${pct(p.n, total)}%)`}
          className={`min-w-[3px] ${outcomeMeta(p.key).dot} ${i === 0 ? "rounded-l-[4px]" : ""} ${
            i === parts.length - 1 ? "rounded-r-[4px]" : ""
          }`}
          style={{ flexGrow: p.n, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

/**
 * The bar's legend, which is also its table.
 *
 * Every outcome named with its count and share, so nothing depends on telling
 * two colours apart — the accessibility relief the validator asks for, and the
 * thing somebody actually reads the numbers off.
 */
export function OutcomeLegend({
  counts, total, order = ADMIN_ORDER,
}: {
  counts: Counts;
  total: number;
  order?: readonly LeadOutcomeKey[];
}) {
  const shown = order.filter((k) => k !== INVALID || (counts[INVALID] ?? 0) > 0);
  return (
    <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
      {shown.map((key) => {
        const n = counts[key] ?? 0;
        return (
          <li key={key} className="flex items-center gap-2.5 text-[13px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${outcomeMeta(key).dot}`} />
            <span className="flex-1 font-medium">{outcomeMeta(key).label}</span>
            <span className="font-semibold tabular-nums">{n}</span>
            <span className="w-10 text-right tabular-nums text-[#86868b]">{pct(n, total)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The five counts as tiles, each wearing its own colour.
 *
 * A 3px rail down the left edge rather than a 6px dot beside the label: the
 * tile is the thing being scanned, so the colour belongs to the tile. The
 * number stays ink-coloured — a figure written in its series colour is the
 * first thing to become unreadable, and the rail already says which is which.
 */
export function OutcomeTiles({
  counts, order = ADMIN_ORDER, onSelect, selected,
}: {
  counts: Counts;
  order?: readonly LeadOutcomeKey[];
  /** Given, the tiles become filters. Left out, they are figures. */
  onSelect?: (key: LeadOutcomeKey) => void;
  selected?: LeadOutcomeKey | null;
}) {
  const shown = order.filter((k) => k !== INVALID || (counts[INVALID] ?? 0) > 0);
  // Written out rather than interpolated: Tailwind reads these class names out
  // of the source, so a computed one is a class that never gets generated.
  const wide = shown.length >= 6 ? "xl:grid-cols-6" : "xl:grid-cols-5";
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 ${wide}`}>
      {shown.map((key) => {
        const meta = outcomeMeta(key);
        const body = (
          <>
            <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${meta.dot}`} aria-hidden />
            <p className="text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">
              {(counts[key] ?? 0).toLocaleString("en-GB")}
            </p>
            <p className="mt-1 text-[12.5px] font-medium text-[#48484a]">{meta.label}</p>
          </>
        );
        const shell = "relative overflow-hidden rounded-2xl bg-white p-4 pl-5 text-left shadow-sm ring-1 sm:p-5 sm:pl-6";
        return onSelect ? (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={selected === key}
            className={`${shell} transition-all hover:-translate-y-0.5 hover:shadow-md ${
              selected === key ? "ring-2 ring-brand/50" : "ring-black/[0.04]"
            }`}
          >
            {body}
          </button>
        ) : (
          <div key={key} className={`${shell} ring-black/[0.04]`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Won against decided, and how that is trending.
 *
 * A number, not a chart. It is one ratio, and a ratio drawn as a shape is a
 * shape somebody has to convert back into the number they wanted.
 *
 * "—" rather than "0%" when nothing has been decided: a salesperson with ten
 * leads in progress has not lost them all, and a page that says 0% about them
 * is telling a manager something untrue.
 */
export function WinRateCard({
  winRate, lead, noLead, thisWeek, lastWeek, className = "",
}: {
  winRate: number | null;
  lead: number;
  noLead: number;
  thisWeek: number;
  lastWeek: number;
  className?: string;
}) {
  const decided = lead + noLead;
  const delta = thisWeek - lastWeek;
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04] ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Win rate</p>
      <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight tabular-nums">
        {winRate === null ? "—" : `${winRate}%`}
      </p>
      <p className="mt-2 text-[13px] text-[#48484a]">
        {decided === 0
          ? "nothing decided yet"
          : `${lead.toLocaleString("en-GB")} of ${decided.toLocaleString("en-GB")} decided ${decided === 1 ? "lead" : "leads"}`}
      </p>
      <p className="mt-3 border-t border-black/[0.06] pt-3 text-[12.5px] text-[#86868b]">
        <span className="font-semibold tabular-nums text-[#1d1d1f]">{thisWeek}</span>{" "}
        {thisWeek === 1 ? "outcome" : "outcomes"} recorded this week
        {lastWeek > 0 || thisWeek > 0 ? (
          <>
            {" · "}
            <span className={delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : ""}>
              {delta === 0 ? "the same as last week" : `${delta > 0 ? "+" : ""}${delta} on last week`}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Their book in one line: how much, and of what. */
export function BookSummary({
  assigned, inquiries, contacts, shipments = 0,
}: { assigned: number; inquiries: number; contacts: number; shipments?: number }) {
  if (assigned === 0) return <>nothing assigned</>;
  return (
    <>
      {assigned.toLocaleString("en-GB")} assigned · {inquiries} quote {inquiries === 1 ? "request" : "requests"}
      {contacts > 0 && ` · ${contacts} ${contacts === 1 ? "message" : "messages"}`}
      {shipments > 0 && ` · ${shipments} freight ${shipments === 1 ? "request" : "requests"}`}
    </>
  );
}

export { NOT_STARTED };

/**
 * A picture of the thing you are signing in to.
 *
 * The left panel was an empty navy rectangle with a headline in it. This puts
 * the sales desk on it: three leads, the states they move through, and the
 * clock the rotation queue runs on — so somebody arriving at the door can see
 * what is behind it.
 *
 * SAMPLE TEXT ONLY. Nothing here is fetched, nothing is real, and no name
 * belongs to a customer. It is a drawing of the product made out of the same
 * chips and cards the workspace uses, so it stays honest as the real screen
 * changes.
 *
 * Server component: no state, no effects, no client bundle. The only motion is
 * CSS, and every animated element carries motion-reduce:animate-none so the
 * whole composition is still under prefers-reduced-motion.
 *
 * aria-hidden: it is decoration beside the real heading. A screen reader gets
 * the headline and the form, not a list of invented customers.
 */

/** The three states a lead actually moves through, in the workspace's colours. */
const CHIPS = {
  lead: { label: "Lead", dot: "bg-emerald-400", text: "text-emerald-300", ring: "ring-emerald-400/25", fill: "bg-emerald-400/10" },
  progress: { label: "In progress", dot: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-400/25", fill: "bg-sky-400/10" },
  passed: { label: "Not attended", dot: "bg-amber-400", text: "text-amber-300", ring: "ring-amber-400/25", fill: "bg-amber-400/10" },
} as const;

type ChipKey = keyof typeof CHIPS;

const ROWS: { name: string; line: string; chip: ChipKey; when: string }[] = [
  { name: "Sample importer", line: "LED panel lights · 500 units", chip: "lead", when: "2h" },
  { name: "Sample buyer", line: "Cotton tote bags · 2,000 units", chip: "progress", when: "20m" },
  { name: "Sample trader", line: "Bluetooth earbuds · 300 units", chip: "passed", when: "1d" },
];

function Chip({ kind }: { kind: ChipKey }) {
  const c = CHIPS[kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${c.fill} ${c.text} ${c.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function SalesDeskPreview() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      <div className="w-full max-w-[26rem] rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl backdrop-blur-sm">
        {/* The strip along the top of the workspace: who is signed in, and how
            many are waiting. */}
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-gradient-to-br from-brand to-brand-dark ring-1 ring-white/20" />
            <span className="text-[11px] font-semibold text-white/70">Your leads</span>
          </div>
          {/* The queue timer. The ring pulses because the rotation is a clock
              somebody is racing; it stops entirely under reduced motion. */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 ring-1 ring-white/10">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="text-[10px] font-semibold tabular-nums text-white/70">01:59 to respond</span>
          </span>
        </div>

        <ul className="space-y-2">
          {ROWS.map((r, i) => (
            <li
              key={r.name}
              // hero-rise is the site's existing entrance: transform-only, so
              // nothing is parked at opacity 0, and globals.css already turns
              // it off under prefers-reduced-motion. The -1/-2/-3 variants are
              // its stagger; no new keyframe is introduced for this panel.
              className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2.5 hero-rise hero-rise-${i + 1}`}
            >
              <span className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-white/10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-white/90">{r.name}</span>
                <span className="block truncate text-[11px] text-white/45">{r.line}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Chip kind={r.chip} />
                <span className="text-[10px] tabular-nums text-white/35">{r.when}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* The proportion rail the console shows above a list — drawn, not
            computed, and deliberately not adding up to anything meaningful. */}
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/5">
          <span className="w-[42%] bg-emerald-400/70" />
          <span className="w-[31%] bg-sky-400/70" />
          <span className="w-[16%] bg-amber-400/70" />
          <span className="flex-1 bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default SalesDeskPreview;

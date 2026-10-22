"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import type { Theme } from "@/components/admin/console-theme";
import { handlingKey } from "@/lib/handling";
import type { CustomerGroup } from "@/lib/customerGroups";
import type { Handling } from "@/lib/lead-pool";

const fmt = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

interface Props {
  t: Theme;
  groups: CustomerGroup[];
  /** Where a customer stands in the open pool (every product of theirs shares it). */
  handlingOf: (g: CustomerGroup) => Handling | null | undefined;
  /** True while the list is already narrowed to customers waiting in the pool. */
  onlyOpen: boolean;
  onToggleOpen: () => void;
}

/**
 * What the grouped view is actually showing, above the list itself.
 *
 * Grouping answers one question — how many real customers are behind all these
 * rows — so that number leads, at figure size, with the fold it came from
 * underneath it. The three facts beside it are the ones that change what the
 * admin does next: how many products are riding on those customers, how many
 * of them came back for more than one thing, and how many are waiting in the
 * open pool for somebody to take them. That last one is a filter, not a
 * caption: the number you want to act on is the number you should be able to
 * click.
 *
 * Everything here is counted from the groups already computed for the list, so
 * the strip costs a pass over an array that is at most a few hundred long, and
 * can never disagree with the rows underneath it.
 */
export function CustomerGroupSummary({ t, groups, handlingOf, onlyOpen, onToggleOpen }: Props) {
  const s = useMemo(() => {
    let inquiries = 0, products = 0, quantity = 0, repeat = 0;
    const by = { open: 0, held: 0, done: 0, invalid: 0 };
    for (const g of groups) {
      inquiries += g.inquiryCount;
      products += g.products.length;
      quantity += g.totalQuantity;
      if (g.products.length > 1) repeat += 1;
      by[handlingKey(handlingOf(g))] += 1;
    }
    return { customers: groups.length, inquiries, products, quantity, repeat, ...by };
  }, [groups, handlingOf]);

  // Held / open / done / given up, in that order, as one thin rail, in the
  // handling chips' colours. Segments that are zero are dropped rather than
  // drawn at 0% — a rounded end with no width still paints a dot.
  const rail = [
    { n: s.held, fill: "bg-amber-500", label: "taken by somebody" },
    { n: s.open, fill: "bg-sky-500", label: "waiting in the pool" },
    { n: s.done, fill: "bg-emerald-500", label: "decided" },
    { n: s.invalid, fill: "bg-slate-600", label: "given up on" },
  ].filter((seg) => seg.n > 0);

  return (
    <div className={`border-b px-4 py-3.5 ${t.border} bg-brand/[0.035]`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Users className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className={`flex items-baseline gap-1.5 ${t.strong}`}>
              <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">{fmt(s.customers)}</span>
              <span className="text-[13.5px] font-semibold">unique {plural(s.customers, "customer")}</span>
            </p>
            <p className={`mt-1 text-[11.5px] ${t.soft}`}>
              deduped by phone from {fmt(s.inquiries)} loaded {plural(s.inquiries, "inquiry", "inquiries")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-5 gap-y-3 sm:ml-auto">
          <Fact
            t={t}
            value={s.products}
            label="Products"
            hint={`${fmt(s.quantity)} ${plural(s.quantity, "unit")} asked for`}
          />
          <Fact
            t={t}
            value={s.repeat}
            label="Came back"
            hint={`asked about more than one${s.repeat === 0 ? " thing" : ""}`}
            divided
          />
          <Fact
            t={t}
            value={s.open}
            label="Open"
            hint={onlyOpen ? "showing only these" : s.open === 0 ? "nobody is waiting" : "show only these"}
            tone={s.open > 0 ? "text-sky-500" : undefined}
            divided
            active={onlyOpen}
            onClick={s.open > 0 || onlyOpen ? onToggleOpen : undefined}
          />
        </div>
      </div>

      {rail.length > 0 && (
        <div
          className="mt-3.5 flex items-center gap-[2px]"
          role="img"
          aria-label={rail.map((seg) => `${seg.n} ${seg.label}`).join(", ")}
        >
          {rail.map((seg) => (
            <span
              key={seg.fill}
              className={`h-1 rounded-full ${seg.fill}`}
              style={{ width: `${(seg.n / s.customers) * 100}%` }}
            />
          ))}
        </div>
      )}

      <p className={`mt-2.5 text-[11.5px] leading-relaxed ${t.soft}`}>
        Staff take a customer from the open pool with every product they asked about. &ldquo;Grouped .xlsx&rdquo;
        exports the whole database, not only what is loaded here.
      </p>
    </div>
  );
}

/**
 * One supporting figure. A fact with an `onClick` is a filter and looks like
 * one — it keeps the same geometry either way, so the strip does not reflow
 * when the filter goes on.
 */
function Fact({
  t, value, label, hint, tone, divided, active, onClick,
}: {
  t: Theme;
  value: number;
  label: string;
  hint: string;
  tone?: string;
  divided?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className={`text-[17px] font-semibold leading-none tabular-nums ${tone ?? t.strong}`}>{fmt(value)}</p>
      <p className={`mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${t.mid}`}>{label}</p>
      <p className={`mt-0.5 text-[11px] ${t.soft}`}>{hint}</p>
    </>
  );
  const edge = divided ? `sm:border-l sm:pl-5 ${t.border}` : "";
  if (!onClick) return <div className={`min-w-0 ${edge}`}>{body}</div>;
  return (
    <div className={`min-w-0 ${edge}`}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={Boolean(active)}
        // Offset left only: the hit area grows into the gap beside it, never
        // past the card's right edge, where it would crowd the padding.
        className={`-ml-2 -my-1.5 rounded-xl px-2 py-1.5 text-left transition-colors cursor-pointer ${
          active ? "ring-1 ring-sky-500/50 bg-sky-500/10" : t.hover
        }`}
      >
        {body}
      </button>
    </div>
  );
}

export default CustomerGroupSummary;

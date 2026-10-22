"use client";

import { CheckCircle2, CircleDashed, Clock3, Hand, XCircle } from "lucide-react";
import { handlingKey, handlingText } from "@/lib/handling";
import type { Handling } from "@/lib/lead-pool";

/**
 * Where a lead's customer stands in the open pool, in the place the console's assign dropdown used to be
 * (administrators no longer hand leads out; staff take them). The words are lib/handling.ts's: "Open · waiting 35m",
 * "Taken by Priya · 10:42 AM · held 1h 20m · In progress", "Lead by Priya · took 2h 10m", "Invalid · …".
 */
export function HandlingChip({ h, createdAt, dark = false, now }: { h: Handling | null | undefined; createdAt: string; dark?: boolean; now: number }) {
  const key = handlingKey(h);
  const { text, title } = handlingText(h, createdAt, now);
  const lead = h?.state === "done" && h.outcome === "LEAD";
  // Set aside as already handled: done, but nobody's outcome, so neither the Lead green nor the No lead red.
  const handled = h?.state === "handled";
  const tone =
    key === "open"
      ? dark ? "bg-sky-500/15 text-sky-300" : "bg-sky-500/10 text-sky-700"
      : key === "held"
        ? dark ? "bg-amber-500/15 text-amber-300" : "bg-amber-500/10 text-amber-800"
        : handled
          ? dark ? "bg-white/[0.07] text-[#c7c7cc]" : "bg-black/[0.05] text-[#48484a]"
          : key === "done"
            ? lead
              ? dark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-500/10 text-emerald-700"
              : dark ? "bg-red-500/15 text-red-300" : "bg-red-500/10 text-red-700"
            : dark ? "bg-white/10 text-slate-300" : "bg-slate-700/10 text-slate-700";
  const Icon = key === "open" ? CircleDashed : key === "held" ? Hand : handled ? CheckCircle2 : key === "done" ? (lead ? CheckCircle2 : XCircle) : Clock3;
  // `now` is the caller's clock (the console starts it at the moment the server drew the page) and is never read
  // here, so the server's draw and the browser's first draw say the same thing.
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

export default HandlingChip;

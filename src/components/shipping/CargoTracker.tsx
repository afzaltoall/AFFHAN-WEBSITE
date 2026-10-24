"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Anchor, ArrowRight, Loader2, Printer, Ship, Stamp } from "lucide-react";
import { CARGO_STATUSES, CARGO_STATUS_META, cargoKey, fmtDay, type CargoStatus, type CargoTrack } from "@/lib/cargo-shared";
import { timeAgo } from "@/lib/relative-time";

/**
 * Live track & trace, on /shipping/ under the hero (the owner, 2026-10-24): a customer types the console, FCL or LCL
 * number we gave them and sees where their cargo stands. Not the carrier's tracker, with its modules, vessels and
 * voyages: our own, in our own three stages, the stage shown as a journey (port of loading, at sea, customs), and
 * under it every update our assigners post, one row each: the date, what happened, the status.
 *
 * Live: while a result is open and the tab is in front, it reads itself again every minute, so an update the
 * assigner posts appears without a reload. A number travels in the address (?track=…#track), so the link we send a
 * customer opens straight on their cargo.
 *
 * Only what /api/track answers is shown: never the customer's name or the office's sheet.
 */

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; cargo: CargoTrack; checkedAt: number }
  | { kind: "missing"; ref: string }
  | { kind: "error"; message: string };

const STAGE_ICON: Record<CargoStatus, typeof Anchor> = { IN_POL_PORT: Anchor, IN_SAILING: Ship, IN_CUSTOMS: Stamp };

export function CargoTracker() {
  const [ref, setRef] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const asked = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const look = useCallback(async (raw: string, quiet = false) => {
    const value = raw.trim();
    if (cargoKey(value).length < 3) {
      setState({ kind: "error", message: "Enter the console, FCL or LCL number from your booking." });
      return;
    }
    asked.current = value;
    if (!quiet) setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/track/?ref=${encodeURIComponent(value)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (asked.current !== value) return; // a newer search has taken over
      if (res.ok) setState({ kind: "found", cargo: json.cargo as CargoTrack, checkedAt: Date.now() });
      else if (res.status === 404) setState({ kind: "missing", ref: value });
      else if (!quiet) setState({ kind: "error", message: typeof json.error === "string" ? json.error : "We couldn't look that up just now. Please try again." });
    } catch {
      if (!quiet) setState({ kind: "error", message: "We couldn't reach our tracker. Check your connection and try again." });
    }
  }, []);

  // A link with ?track= opens on that cargo.
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("track");
    if (from) {
      setRef(from);
      void look(from);
    }
  }, [look]);

  // Live: every minute while a result is open and the tab is in front.
  useEffect(() => {
    if (state.kind !== "found") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && asked.current) void look(asked.current, true);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [state.kind, look]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = ref.trim();
    if (value) {
      // The address carries the number, so the page can be shared or reloaded on it.
      const url = new URL(window.location.href);
      url.searchParams.set("track", value);
      url.hash = "track";
      window.history.replaceState(null, "", url.toString());
    }
    void look(value);
  };

  return (
    <section id="track" aria-labelledby="track-heading" className="scroll-mt-24 py-20 lg:py-28">
      <div className="mx-auto grid max-w-[1500px] gap-12 px-6 md:px-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:px-16">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#176579] opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#176579]" />
            </span>
            Live track &amp; trace
          </span>
          <h2 id="track-heading" className="mt-4 text-[10vw] font-medium leading-[0.95] tracking-[-0.04em] sm:text-[7vw] lg:text-[4.2vw]">
            Keep track of your cargo
          </h2>
          <p className="mt-6 max-w-md text-[16px] leading-[1.6] text-[#5a6e77] sm:text-[17px]">
            Enter the console, FCL or LCL number from your booking. You see every update as our team posts it: the date,
            what happened, and where your cargo stands.
          </p>
        </div>

        <div className="min-w-0">
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search" aria-label="Track your cargo">
            <label className="min-w-0 flex-1">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-[#08222e]/60">Cargo #</span>
              <input
                ref={inputRef}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="e.g. CO-26-000002"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                className="h-14 w-full rounded-2xl border border-[#08222e]/15 bg-white px-5 text-[17px] font-semibold uppercase tracking-wide text-[#08222e] shadow-sm outline-none transition-shadow placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#08222e]/35 focus:border-[#176579] focus:ring-4 focus:ring-[#176579]/15"
              />
            </label>
            <button
              type="submit"
              disabled={state.kind === "loading"}
              className="group flex h-14 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-full bg-[#08222e] py-1.5 pl-7 pr-1.5 text-[#FAFAF7] transition-all duration-300 hover:bg-[#176579] hover:shadow-lg hover:shadow-[#176579]/20 disabled:opacity-70"
            >
              <span className="text-base font-medium">Track</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FAFAF7] text-[#08222e] transition-transform duration-300 group-hover:translate-x-0.5">
                {state.kind === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              </span>
            </button>
          </form>
          <p className="mt-3 text-[13px] text-[#5a6e77]">
            The number is on your booking confirmation. No number yet? <Link href="/contact/" className="font-semibold text-[#176579] underline-offset-2 hover:underline">Ask our team</Link>.
          </p>

          <div aria-live="polite" className="mt-8">
            {state.kind === "found" && <Result cargo={state.cargo} checkedAt={state.checkedAt} />}
            {state.kind === "missing" && (
              <div className="rounded-3xl border border-[#08222e]/10 bg-white p-6 sm:p-8">
                <p className="text-lg font-semibold">We couldn&apos;t find cargo {state.ref.toUpperCase()}.</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e77]">
                  Check the number on your booking confirmation: it looks like CO-26-000002 or FCL-26-000004. If it still
                  does not show, <Link href="/contact/" className="font-semibold text-[#176579] hover:underline">contact us</Link> and we will look it up.
                </p>
              </div>
            )}
            {state.kind === "error" && (
              <p role="alert" className="rounded-2xl bg-red-500/10 px-5 py-4 text-[14px] font-medium text-red-700">
                {state.message}
              </p>
            )}
            {state.kind === "loading" && (
              <div className="animate-pulse rounded-3xl border border-[#08222e]/10 bg-white p-8" aria-hidden="true">
                <div className="h-5 w-48 rounded bg-[#08222e]/10" />
                <div className="mt-8 h-2 w-full rounded bg-[#08222e]/10" />
                <div className="mt-8 space-y-3">
                  <div className="h-4 w-full rounded bg-[#08222e]/[0.07]" />
                  <div className="h-4 w-5/6 rounded bg-[#08222e]/[0.07]" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Result({ cargo, checkedAt }: { cargo: CargoTrack; checkedAt: number }) {
  const current = CARGO_STATUSES.indexOf(cargo.status);
  const latest = cargo.events[cargo.events.length - 1];
  return (
    <article id="cargo-result" aria-label={`Cargo ${cargo.reference}`} className="overflow-hidden rounded-3xl border border-[#08222e]/10 bg-white shadow-sm">
      {/* Printing shows the result alone. */}
      <style>{`@media print { body * { visibility: hidden !important; } #cargo-result, #cargo-result * { visibility: visible !important; } #cargo-result { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none; } .cargo-noprint { display: none !important; } }`}</style>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#08222e]/10 px-6 py-5 sm:px-8">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#08222e]/50">Cargo #</p>
          <p className="mt-1 break-all text-2xl font-bold tracking-tight">{cargo.reference}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="cargo-noprint inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-700" title={`Checked ${new Date(checkedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" aria-hidden="true" /> Live
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="cargo-noprint inline-flex items-center gap-1.5 rounded-full border border-[#08222e]/15 px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-[#08222e]/[0.04]"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </header>

      {/* The journey: the three stages, the cargo's own one lit, the ones behind it done. */}
      <div className="px-6 pb-2 pt-7 sm:px-8">
        <ol className="relative grid grid-cols-3" aria-label="Where your cargo stands">
          <span className="absolute left-[16.66%] right-[16.66%] top-5 h-[3px] rounded-full bg-[#08222e]/10" aria-hidden="true" />
          <span
            className="absolute left-[16.66%] top-5 h-[3px] rounded-full bg-[#176579] transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${(current / (CARGO_STATUSES.length - 1)) * 66.68}%` }}
            aria-hidden="true"
          />
          {CARGO_STATUSES.map((s, i) => {
            const Icon = STAGE_ICON[s];
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li key={s} className="relative flex flex-col items-center text-center" aria-current={state === "now" ? "step" : undefined}>
                <span
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white transition-colors ${
                    state === "now" ? `${CARGO_STATUS_META[s].dot} text-[#08222e]` : state === "done" ? "bg-[#176579] text-white" : "bg-[#eef1f2] text-[#08222e]/35"
                  }`}
                >
                  {state === "now" && <span className={`absolute inset-0 animate-ping rounded-full opacity-30 motion-reduce:animate-none ${CARGO_STATUS_META[s].dot}`} aria-hidden="true" />}
                  <Icon className="relative h-[18px] w-[18px]" strokeWidth={2.2} />
                </span>
                <span className={`mt-2.5 text-[12px] leading-tight sm:text-[13.5px] ${state === "now" ? "font-bold text-[#08222e]" : state === "done" ? "font-semibold text-[#08222e]/70" : "text-[#08222e]/40"}`}>
                  {CARGO_STATUS_META[s].label}
                </span>
                {state === "now" && <span className="sr-only">(current)</span>}
              </li>
            );
          })}
        </ol>
        {latest && (
          <p className="mt-6 text-[14px] text-[#5a6e77]">
            Latest: <span className="font-semibold text-[#08222e]">{latest.name}</span> · {fmtDay(latest.date)}
            <span className="text-[#08222e]/40"> · updated {timeAgo(new Date(cargo.updatedAt))}</span>
          </p>
        )}
      </div>

      {/* Every update, oldest first, as a carrier's tracker reads: the date, what happened, the status. */}
      <div className="px-2 pb-4 pt-3 sm:px-4">
        <table className="w-full text-left text-[14px]">
          <thead className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#08222e]/50">
            <tr>
              <th className="px-4 py-3 font-bold">Event date</th>
              <th className="px-4 py-3 font-bold">Event</th>
              <th className="px-4 py-3 text-right font-bold sm:text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {cargo.events.map((e, i) => {
              const last = i === cargo.events.length - 1;
              return (
                <tr key={`${e.date}-${i}`} className={`border-t border-[#08222e]/[0.07] ${last ? "bg-[#176579]/[0.05]" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-3.5 align-top tabular-nums text-[#08222e]/70">{fmtDay(e.date)}</td>
                  <td className="px-4 py-3.5 align-top font-semibold">
                    {e.name}
                    {last && <span className="ml-2 rounded-full bg-[#176579] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wider text-white">Latest</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right align-top sm:text-left">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${CARGO_STATUS_META[e.status].chip}`}>
                      {CARGO_STATUS_META[e.status].label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#08222e]/10 px-6 py-4 text-[12px] text-[#08222e]/45 sm:px-8">
        Updates are posted by our shipping team as your cargo moves. Dates may change with the vessel&apos;s schedule.
      </p>
    </article>
  );
}

export default CargoTracker;

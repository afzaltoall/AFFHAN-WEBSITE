"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Anchor, Container, Loader2, PackageCheck, Printer, Ship, Stamp, Warehouse } from "lucide-react";
import { CARGO_STATUSES, CARGO_STATUS_META, cargoKey, fmtTrackDay, type CargoStatus, type CargoTrack } from "@/lib/cargo-shared";

/**
 * Track your cargo, on /shipping/ under the hero (the owner, 2026-10-24): a customer types the console, FCL or LCL
 * number we gave them and sees where their cargo stands. Not the carrier's tracker, with its modules, vessels and
 * voyages: our own, in our own six stages (the owner's, 2026-10-26: loaded, vessel loading, sailing, discharged,
 * customs, warehouse), and every update our assigners post.
 *
 * Laid out as a carrier's tracker reads (the owner, 2026-10-26: the first one "feels like AI", everything pushed to
 * the right under a poster heading): one column, a plain heading, the box, then the cargo: its number, its status,
 * ETD and ETA, the six stages, and the updates as a plain table (Event Date, Event Name, Status), each change once
 * (the server leaves repeats out), oldest first. No "updated … ago" and no Live badge: not for the customer.
 *
 * It reads itself again every minute while a result is open and the tab is in front, so an update the assigner
 * posts appears without a reload. A number travels in the address (?track=…#track), so the link we send a customer
 * opens straight on their cargo. Only what /api/track answers is shown: never the customer's name or the sheet.
 */

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; cargo: CargoTrack }
  | { kind: "missing"; ref: string }
  | { kind: "error"; message: string };

const STAGE_ICON: Record<CargoStatus, typeof Anchor> = {
  CARGO_LOADED: PackageCheck,
  VESSEL_LOADING: Container,
  VESSEL_SAILING: Ship,
  VESSEL_DISCHARGED: Anchor,
  IN_CUSTOMS: Stamp,
  IN_WAREHOUSE: Warehouse,
};

export function CargoTracker() {
  const [ref, setRef] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const asked = useRef<string | null>(null);

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
      if (res.ok) setState({ kind: "found", cargo: json.cargo as CargoTrack });
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

  // Every minute while a result is open and the tab is in front.
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
    <section id="track" aria-labelledby="track-heading" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mx-auto max-w-4xl px-6 md:px-10">
        <h2 id="track-heading" className="text-[28px] font-bold tracking-tight text-[#08222e] sm:text-[34px]">
          Track your cargo
        </h2>
        <p className="mt-2 text-[15px] text-[#5a6e77]">Enter the console, FCL or LCL number from your booking confirmation.</p>

        <form onSubmit={submit} role="search" aria-label="Track your cargo" className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Cargo number</span>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Cargo number, e.g. CO-26-000002"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              className="h-14 w-full rounded-xl border border-[#08222e]/15 bg-white px-5 text-[17px] font-semibold uppercase tracking-wide text-[#08222e] outline-none transition-shadow placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[#08222e]/40 focus:border-[#176579] focus:ring-4 focus:ring-[#176579]/15"
            />
          </label>
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#08222e] px-9 text-[16px] font-semibold text-white transition-colors hover:bg-[#176579] disabled:opacity-70"
          >
            {state.kind === "loading" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            Track
          </button>
        </form>

        <div aria-live="polite" className="mt-8">
          {state.kind === "found" && <Result cargo={state.cargo} />}
          {state.kind === "missing" && (
            <div className="rounded-2xl border border-[#08222e]/10 bg-white p-6 sm:p-8">
              <p className="text-[17px] font-semibold text-[#08222e]">We couldn&apos;t find cargo {state.ref.toUpperCase()}.</p>
              <p className="mt-2 text-[15px] leading-relaxed text-[#5a6e77]">
                Check the number on your booking confirmation: it looks like CO-26-000002 or FCL-26-000004. If it still does not
                show, <Link href="/contact/" className="font-semibold text-[#176579] hover:underline">contact us</Link> and we will look it up.
              </p>
            </div>
          )}
          {state.kind === "error" && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-5 py-4 text-[14px] font-medium text-red-700">
              {state.message}
            </p>
          )}
          {state.kind === "loading" && (
            <div className="animate-pulse rounded-2xl border border-[#08222e]/10 bg-white p-8" aria-hidden="true">
              <div className="h-6 w-48 rounded bg-[#08222e]/10" />
              <div className="mt-6 grid grid-cols-3 gap-6">
                <div className="h-10 rounded bg-[#08222e]/[0.07]" />
                <div className="h-10 rounded bg-[#08222e]/[0.07]" />
                <div className="h-10 rounded bg-[#08222e]/[0.07]" />
              </div>
              <div className="mt-8 space-y-3">
                <div className="h-4 w-full rounded bg-[#08222e]/[0.07]" />
                <div className="h-4 w-5/6 rounded bg-[#08222e]/[0.07]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Result({ cargo }: { cargo: CargoTrack }) {
  const current = Math.max(0, CARGO_STATUSES.indexOf(cargo.status));
  const stages = CARGO_STATUSES.length;
  const now = CARGO_STATUSES[current];
  const NowIcon = STAGE_ICON[now];
  const next = current < stages - 1 ? CARGO_STATUSES[current + 1] : null;
  const fact = "text-[16px] font-semibold text-[#08222e]";
  const factLabel = "text-[13px] text-[#5a6e77]";
  return (
    <article id="cargo-result" aria-label={`Cargo ${cargo.reference}`} className="overflow-hidden rounded-2xl border border-[#08222e]/10 bg-white">
      {/* Printing shows the result alone. */}
      <style>{`@media print { body * { visibility: hidden !important; } #cargo-result, #cargo-result * { visibility: visible !important; } #cargo-result { position: absolute; left: 0; top: 0; width: 100%; border: 0; } .cargo-noprint { display: none !important; } }`}</style>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#08222e]/10 px-6 py-5 sm:px-8">
        <div className="min-w-0">
          <p className={factLabel}>Cargo number</p>
          <p className="break-all text-[24px] font-bold tracking-tight text-[#08222e]">{cargo.reference}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="cargo-noprint inline-flex items-center gap-1.5 rounded-lg border border-[#08222e]/15 px-3 py-2 text-[13px] font-semibold text-[#08222e] transition-colors hover:bg-[#08222e]/[0.04]"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
      </header>

      {/* Where it stands and when, as a carrier's tracker opens with them (the owner, 2026-10-26: ETD and ETA shown). */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-[#08222e]/10 px-6 py-5 sm:grid-cols-3 sm:px-8">
        <div className="col-span-2 sm:col-span-1">
          <dt className={factLabel}>Status</dt>
          <dd className={`mt-0.5 flex items-center gap-2 ${fact}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CARGO_STATUS_META[now].dot}`} aria-hidden="true" />
            {CARGO_STATUS_META[now].label}
          </dd>
        </div>
        <div>
          <dt className={factLabel}>ETD</dt>
          <dd className={`mt-0.5 tabular-nums ${fact}`}>{fmtTrackDay(cargo.etd) || "To be confirmed"}</dd>
        </div>
        <div>
          <dt className={factLabel}>ETA</dt>
          <dd className={`mt-0.5 tabular-nums ${fact}`}>{fmtTrackDay(cargo.eta) || "To be confirmed"}</dd>
        </div>
      </dl>

      {/* The six stages, the cargo's own one marked, the ones behind it done. A phone has no room for six names in a
          row: there, the stage as a step of six, over a bar of six, and the one after it. */}
      <div className="border-b border-[#08222e]/10 px-6 py-6 sm:px-8">
        <div className="sm:hidden">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#08222e] ${CARGO_STATUS_META[now].dot}`}>
              <NowIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] text-[#5a6e77]">
                Step {current + 1} of {stages}
              </p>
              <p className="text-[17px] font-bold leading-tight text-[#08222e]">{CARGO_STATUS_META[now].label}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-1.5" aria-hidden="true">
            {CARGO_STATUSES.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full ${i < current ? "bg-[#176579]" : i === current ? CARGO_STATUS_META[s].dot : "bg-[#08222e]/10"}`} />
            ))}
          </div>
          {next && (
            <p className="mt-2.5 text-[13px] text-[#5a6e77]">
              Next: <span className="font-semibold text-[#08222e]">{CARGO_STATUS_META[next].label}</span>
            </p>
          )}
        </div>
        <ol className="relative hidden grid-cols-6 sm:grid" aria-label="Where your cargo stands">
          {/* The line runs from the first stage's centre to the last's: a twelfth in from each side. */}
          <span className="absolute left-[8.333%] right-[8.333%] top-[18px] h-[3px] rounded-full bg-[#08222e]/10" aria-hidden="true" />
          <span
            className="absolute left-[8.333%] top-[18px] h-[3px] rounded-full bg-[#176579] transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${(current / (stages - 1)) * 83.333}%` }}
            aria-hidden="true"
          />
          {CARGO_STATUSES.map((s, i) => {
            const Icon = STAGE_ICON[s];
            const step = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li key={s} className="relative flex flex-col items-center text-center" aria-current={step === "now" ? "step" : undefined}>
                <span
                  className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-white ${
                    step === "now" ? `${CARGO_STATUS_META[s].dot} text-[#08222e]` : step === "done" ? "bg-[#176579] text-white" : "bg-[#eef1f2] text-[#08222e]/35"
                  }`}
                >
                  <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className={`mt-2.5 px-1 text-[12.5px] leading-tight ${step === "now" ? "font-bold text-[#08222e]" : step === "done" ? "font-medium text-[#08222e]/75" : "text-[#08222e]/40"}`}>
                  {CARGO_STATUS_META[s].label}
                </span>
                {step === "now" && <span className="sr-only">(current)</span>}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Every update, oldest first, as a carrier's tracker lists them (the owner's reference, 2026-10-26): plain
          columns, plain text. A phone has room for two: there the status sits under the event. */}
      <div className="overflow-x-auto px-2 sm:px-4">
        <table className="w-full text-left text-[14px] text-[#08222e]">
          <thead>
            <tr className="border-b border-[#08222e]/10 text-[13px] text-[#5a6e77]">
              <th className="px-4 py-3 font-medium">Event Date</th>
              <th className="px-4 py-3 font-medium">Event Name</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {cargo.events.map((e, i) => (
              <tr key={`${e.date}-${i}`} className="border-b border-[#08222e]/[0.06] last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3.5 align-top tabular-nums">{fmtTrackDay(e.date)}</td>
                <td className="px-4 py-3.5 align-top">
                  {e.name}
                  <span className="mt-1 block text-[13px] text-[#5a6e77] sm:hidden">{CARGO_STATUS_META[e.status].label}</span>
                </td>
                <td className="hidden px-4 py-3.5 align-top sm:table-cell">{CARGO_STATUS_META[e.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#08222e]/10 px-6 py-4 text-[12.5px] text-[#5a6e77] sm:px-8">ETD and ETA can change with the vessel&apos;s schedule.</p>
    </article>
  );
}

export default CargoTracker;

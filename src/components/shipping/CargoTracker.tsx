"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Anchor, Container, Loader2, PackageCheck, Printer, Ship, Stamp, Warehouse } from "lucide-react";
import { SITE_URL } from "@/lib/brand";
import { CARGO_STATUSES, CARGO_STATUS_META, cargoKey, fmtTrackDay, trackDays, type CargoStatus, type CargoTrack } from "@/lib/cargo-shared";
import { isNativeApp } from "@/lib/nativeCamera";

/**
 * Track your cargo, on /shipping/ under the hero (the owner, 2026-10-24): a customer types the console, FCL or LCL
 * number we gave them and sees where their cargo stands. Not the carrier's tracker, with its modules, vessels and
 * voyages: our own, in our own six stages (the owner's, 2026-10-26: loaded, vessel loading, sailing, discharged,
 * customs, warehouse), and every update our assigners post.
 *
 * Laid out as a carrier's tracker reads (the owner, 2026-10-26: the first one "feels like AI", everything pushed to
 * the right under a poster heading): one column, a plain heading, the box, then the cargo: its number, its status,
 * ETD and ETA, the six stages, and the updates as a plain table (Event Date, Event Name, Status), each change once
 * (the server leaves repeats out), oldest first, a row a day: two updates on one date are one row, both names under
 * the date and the status the day ended on (trackDays). No "updated … ago" and no Live badge: not for the customer.
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

/** The printout's clock: "30-Oct-2026, 4:05 PM", the tracker's own date style. */
function printedAt(): string {
  const d = new Date();
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${String(d.getDate()).padStart(2, "0")}-${month}-${d.getFullYear()}, ${time}`;
}

/**
 * What Print puts on paper (the owner, 2026-10-30: "print vela seiyala"). Printing the page itself had hidden all
 * but the result with `visibility`, which keeps every hidden thing's room: one card, then fourteen blank pages of an
 * invisible /shipping/; and the stage circles are backgrounds, which a browser leaves off paper by default, so their
 * white icons vanished. This sheet is a child of <body> of its own (a portal), the only thing shown in print, so a
 * printout is the cargo alone on one page whatever surrounds the tracker; the company and the time head it, the link
 * back ends it, and its colours print as they show.
 */
function PrintSheet({ cargo }: { cargo: CargoTrack }) {
  const sheet = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // The tracker's own typeface, which its section sets and the sheet, outside it, would not inherit.
    const track = document.getElementById("track");
    if (sheet.current && track) sheet.current.style.fontFamily = getComputedStyle(track).fontFamily;
    // The time of printing, not of the lookup.
    const tick = () => {
      if (stamp.current) stamp.current.textContent = printedAt();
    };
    tick();
    window.addEventListener("beforeprint", tick);
    return () => window.removeEventListener("beforeprint", tick);
  }, []);
  const link = `${SITE_URL.replace(/^https?:\/\//, "")}/shipping/?track=${encodeURIComponent(cargo.reference)}`;
  return (
    <div ref={sheet} className="cargo-paper bg-white text-[#08222e]">
      <style>{`.cargo-paper { display: none; } @media print { @page { margin: 12mm; } html, body { background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; } body > :not(.cargo-paper) { display: none !important; } body > .cargo-paper { display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="mb-5 flex items-center justify-between gap-6 border-b border-[#08222e]/15 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- eager on purpose: it must be loaded before Print is pressed */}
          <img src="/logo.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" />
          <div>
            <p className="text-[16px] font-bold leading-tight">AFFHAN International Pvt Ltd</p>
            <p className="mt-0.5 text-[13px] text-[#5a6e77]">Cargo tracking</p>
          </div>
        </div>
        <p className="text-right text-[12.5px] text-[#5a6e77]">
          Printed <span ref={stamp} className="tabular-nums" />
        </p>
      </div>
      <Result cargo={cargo} onPaper />
      <p className="mt-4 text-[12.5px] text-[#5a6e77]">
        Track online: <span className="font-medium text-[#08222e]">{link}</span>
      </p>
    </div>
  );
}

function Result({ cargo, onPaper = false }: { cargo: CargoTrack; onPaper?: boolean }) {
  const current = Math.max(0, CARGO_STATUSES.indexOf(cargo.status));
  const stages = CARGO_STATUSES.length;
  const now = CARGO_STATUSES[current];
  const NowIcon = STAGE_ICON[now];
  const next = current < stages - 1 ? CARGO_STATUSES[current + 1] : null;
  const fact = "text-[16px] font-semibold text-[#08222e]";
  const factLabel = "text-[13px] text-[#5a6e77]";
  // Print, wherever a browser can print: the app's Android shell ignores window.print(), so it has no button there.
  // Read while rendering, which is safe because a result is only ever drawn in the browser, after the lookup.
  const canPrint = !onPaper && !isNativeApp();
  return (
    <article
      id={onPaper ? undefined : "cargo-result"}
      aria-label={`Cargo ${cargo.reference}`}
      className="overflow-hidden rounded-2xl border border-[#08222e]/10 bg-white"
    >
      {/* One line, as the carrier's tracker heads its result ("Container # FFAU8299138", the owner's reference). */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#08222e]/10 px-6 py-4 sm:px-8">
        <p className="min-w-0 break-all text-[17px] text-[#08222e]">
          Cargo # <span className="font-bold">{cargo.reference}</span>
        </p>
        {canPrint && (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#08222e]/15 px-3 py-2 text-[13px] font-semibold text-[#08222e] transition-colors hover:bg-[#08222e]/[0.04]"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Print
          </button>
        )}
      </header>
      {canPrint && createPortal(<PrintSheet cargo={cargo} />, document.body)}

      {/* Where it stands and when, as a carrier's tracker opens with them (the owner, 2026-10-26: ETD and ETA shown). */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-[#08222e]/10 px-6 py-5 sm:grid-cols-3 sm:px-8">
        <div className="col-span-2 sm:col-span-1">
          <dt className={factLabel}>Status</dt>
          <dd className={`mt-0.5 ${fact}`}>{CARGO_STATUS_META[now].label}</dd>
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

      {/* The six stages, the cargo's own one marked, the ones behind it done: in the brand's two colours, navy for
          where it is and teal for where it has been, never a colour per stage (the owner, 2026-10-26: "colour dots
          feel like AI"). A phone has no room for six names in a row: there, the stage as a step of six, over a bar of
          six, and the one after it. */}
      <div className="border-b border-[#08222e]/10 px-6 py-6 sm:px-8">
        <div className="sm:hidden">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#08222e] text-white">
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
              <span key={s} className={`h-1.5 rounded-full ${i < current ? "bg-[#176579]" : i === current ? "bg-[#08222e]" : "bg-[#08222e]/10"}`} />
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
                    step === "now" ? "bg-[#08222e] text-white" : step === "done" ? "bg-[#176579] text-white" : "bg-[#eef1f2] text-[#08222e]/35"
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
          columns, plain text, each date once with its updates' names under it, the old first, and the status the
          day ended on. A phone has room for two: there the status sits under the names. */}
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
            {trackDays(cargo.events).map((day) => (
              <tr key={day.date} className="break-inside-avoid border-b border-[#08222e]/[0.06] last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3.5 align-top tabular-nums">{fmtTrackDay(day.date)}</td>
                <td className="px-4 py-3.5 align-top">
                  <div className="space-y-1.5">
                    {day.names.map((name, i) => (
                      <span key={i} className="block">
                        {name}
                      </span>
                    ))}
                  </div>
                  <span className="mt-1 block text-[13px] text-[#5a6e77] sm:hidden">{CARGO_STATUS_META[day.status].label}</span>
                </td>
                <td className="hidden px-4 py-3.5 align-top sm:table-cell">{CARGO_STATUS_META[day.status].label}</td>
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

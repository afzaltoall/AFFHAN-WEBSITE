"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, KeyRound, Lock, LockOpen } from "lucide-react";
import { BREAK, LOCKING_S, TripLockOverlay } from "@/components/TripAccess/TripLockOverlay";
import { LIGHT_THEME, type Theme } from "@/components/admin/console-theme";
import { announceTripLock } from "@/components/admin/TripLockRailStatus";

interface LockState {
  locked: boolean;
  unlockedAt: string | null;
  changedBy: string | null;
  changedAt: string | null;
}

/** What the preview is showing: the lock at rest, breaking, gone, or going back on. */
type Preview = "locked" | "breaking" | "open" | "locking";

/** How long the key is held to turn it. */
const HOLD_MS = 1200;
/** The ring the key turns in: r 14, so this round. */
const RING = 2 * Math.PI * 14;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

/**
 * The Free China Business Trip's lock, from the console (lib/trip-lock.ts,
 * the owner's requests of 2026-10-05 and 2026-10-06): the key to it. Locked,
 * the trip is closed to visitors, its banner, its pages and its application
 * alike; an admin signed in here can still open them, to check them.
 *
 * On the left, the banner as visitors see it, drawn by the same lock
 * (TripLockOverlay): when the key turns, it opens here exactly as it opens
 * for everyone on the homepage, and locking it again shows the lock going
 * back on. On the right, the key: press and hold it for a second (the ring
 * fills as the key turns) to unlock, and the same again to lock. Holding is
 * the confirmation, so it never asks in a popup, and a slip of the mouse
 * cannot open it. The keyboard holds it with Space or Enter. A click from
 * assistive technology, which cannot hold, asks in words under the key.
 *
 * Read again every 30 seconds, so a change made by another admin shows here.
 *
 * On the console's Free China Trip page, and at the top of its dashboard (the
 * owner's request of 2026-10-06: the unlock where an admin lands), in the
 * console's own palette, light or dark (`t`, `dark`).
 */
export function TripLockPanel({ t = LIGHT_THEME, dark = false }: { t?: Theme; dark?: boolean }) {
  const [lock, setLock] = useState<LockState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<LockState | null>(null);
  const titleId = useId();

  // A new reading: the first one is shown as it is, a change is played.
  const show = useCallback((next: LockState) => {
    const prev = last.current;
    last.current = next;
    setLock(next);
    // The rail's "Locked" / "Open" says the same at once (TripLockRailStatus).
    announceTripLock(next.locked);
    if (!prev) setPreview(next.locked ? "locked" : "open");
    else if (prev.locked !== next.locked) setPreview(next.locked ? "locking" : "breaking");
  }, []);

  // Arriving from the rail's "Trip lock" row (#trip-lock): the key, brought
  // into view and lit for a moment, so it is plain where it is.
  const sectionRef = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (window.location.hash !== "#trip-lock") return;
    sectionRef.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setLit(true);
    const id = window.setTimeout(() => setLit(false), 1800);
    return () => window.clearTimeout(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/trip-lock/", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as LockState | null;
      if (!res.ok || typeof json?.locked !== "boolean") throw new Error();
      setError(null);
      show(json);
    } catch {
      setError("Could not read the lock. Until it can be read, the trip stays locked for visitors.");
    }
  }, [show]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  // The preview's breaking and locking end in their rest states.
  useEffect(() => {
    if (preview !== "breaking" && preview !== "locking") return;
    const t = window.setTimeout(() => setPreview(preview === "breaking" ? "open" : "locked"), (preview === "breaking" ? BREAK.done : LOCKING_S) * 1000);
    return () => window.clearTimeout(t);
  }, [preview]);

  const act = useCallback(
    async (action: "unlock" | "lock") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/trip-lock/", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.status === 401) throw new Error("Your session has ended. Sign in again, then turn the key.");
        const json = (await res.json().catch(() => null)) as LockState | null;
        if (!res.ok || typeof json?.locked !== "boolean") throw new Error("That change did not save. Try again.");
        show(json);
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "That change did not save. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [show],
  );

  const locked = lock?.locked ?? true;
  const pill = !lock
    ? null
    : locked
      ? { label: "Locked", cls: dark ? "bg-amber-400/15 text-amber-300" : "bg-amber-500/15 text-amber-800", Icon: Lock }
      : { label: "Open", cls: dark ? "bg-emerald-400/15 text-emerald-300" : "bg-emerald-500/12 text-emerald-700", Icon: LockOpen };
  const line = !lock
    ? "Reading the lock…"
    : locked
      ? "Closed to visitors: the homepage banner is behind frosted glass, and every trip page shows \"Opening soon\" however it is reached; applications are refused, the app's too. You can still open the trip while signed in here. Unlock it, and it opens for everyone within about 15 seconds."
      : "Open to everyone: the banner, the trip's pages and its application. Lock it again, and it closes for every visit from then on.";
  const changed = !lock
    ? null
    : lock.changedBy && lock.changedAt
      ? locked
        ? `Locked again by ${lock.changedBy}, ${fmt(lock.changedAt)}.`
        : `Unlocked by ${lock.changedBy}, ${fmt(lock.unlockedAt ?? lock.changedAt)}.`
      : "Nobody has unlocked it yet.";

  return (
    <section
      ref={sectionRef}
      id="trip-lock"
      data-trip-lock-panel
      aria-labelledby={titleId}
      className={`mb-5 flex scroll-mt-24 flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl p-4 shadow-sm ring-1 sm:p-5 ${t.card} ${lit ? "outline outline-2 outline-offset-2 outline-brand" : ""}`}
    >
      <div className={`relative h-[90px] w-[240px] shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ${dark ? "ring-white/[0.1]" : "ring-black/[0.08]"}`}>
        <Image src="/china-trip-hero.webp" alt="" width={640} height={240} sizes="240px" loading="eager" className="h-full w-full object-cover" />
        {preview && preview !== "open" && <TripLockOverlay state={preview} />}
      </div>

      <div className="min-w-[240px] flex-1">
        <h2 id={titleId} className={`flex flex-wrap items-center gap-2 text-[15px] font-semibold ${t.strong}`}>
          Free China Trip
          {pill && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${pill.cls}`}>
              <pill.Icon size={12} aria-hidden />
              {pill.label}
            </span>
          )}
        </h2>
        <p className={`mt-1 max-w-[62ch] text-[13px] leading-snug ${t.mid}`}>{line}</p>
        {changed && (
          <p className={`mt-1 text-[12px] ${t.soft}`}>{changed}</p>
        )}
        {lock && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-medium">
            <a href="/free-china-trip/" target="_blank" rel="noopener" className={`inline-flex items-center gap-1 underline-offset-4 hover:underline ${t.strong}`}>
              Open the trip
              <ArrowUpRight size={13} aria-hidden />
            </a>
            {locked && (
              <a href="/free-china-trip/locked/" target="_blank" rel="noopener" className={`inline-flex items-center gap-1 underline-offset-4 hover:underline ${t.mid}`}>
                What visitors see
                <ArrowUpRight size={13} aria-hidden />
              </a>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className={`mt-1.5 text-[12.5px] font-medium ${dark ? "text-red-400" : "text-red-700"}`}>
            {error}
          </p>
        )}
      </div>

      {lock && <HoldKey action={locked ? "unlock" : "lock"} busy={busy} dark={dark} soft={t.soft} onTurn={() => void act(locked ? "unlock" : "lock")} />}
    </section>
  );
}

/**
 * The key: press and hold (HOLD_MS) to turn it. The ring fills and the key
 * turns while it is held; let go early and both spring back, and nothing
 * happens. Space or Enter hold it from the keyboard. A click that comes
 * from neither a pointer nor a key (a screen reader's) asks in words.
 */
function HoldKey({ action, busy, dark, soft, onTurn }: { action: "unlock" | "lock"; busy: boolean; dark: boolean; soft: string; onTurn: () => void }) {
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const timer = useRef(0);
  const keyDown = useRef(false);
  const yes = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const unlock = action === "unlock";
  // The unlock is the solid button (black on light, white on dark), the lock
  // the quiet one; the ring is gold on the dark face, amber on the light one.
  const solid = unlock;
  const darkFace = solid !== dark;
  const face = solid
    ? dark ? "bg-white text-[#1d1d1f] hover:bg-white/90" : "bg-[#1d1d1f] text-white hover:bg-black"
    : dark ? "bg-white/[0.06] text-white ring-1 ring-white/[0.12] hover:bg-white/[0.1]" : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.1] hover:bg-black/[0.03]";
  const track = darkFace ? "stroke-white/15" : "stroke-black/[0.08]";
  const gold = darkFace ? "#f2c76b" : "#b45309";

  const start = () => {
    if (busy || timer.current) return;
    setAsking(false);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      setHolding(false);
      onTurn();
    }, HOLD_MS);
  };
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (asking) yes.current?.focus();
  }, [asking]);

  const isKey = (k: string) => k === " " || k === "Enter";
  const label = busy ? (unlock ? "Unlocking…" : "Locking…") : holding ? "Keep holding…" : unlock ? "Hold to unlock" : "Hold to lock again";

  return (
    <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-center">
      <button
        type="button"
        disabled={busy}
        aria-describedby={hintId}
        onPointerDown={(e) => {
          if (e.button === 0) start();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          if (e.repeat) return;
          keyDown.current = true;
          start();
        }}
        onKeyUp={(e) => {
          if (!isKey(e.key)) return;
          e.preventDefault();
          keyDown.current = false;
          cancel();
        }}
        onBlur={cancel}
        onClick={(e) => {
          if (e.detail === 0 && !keyDown.current && !busy) setAsking(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`inline-flex h-11 select-none items-center justify-center gap-2.5 rounded-full pl-2 pr-5 text-[13.5px] font-medium shadow-sm transition-[scale,background-color] duration-200 [touch-action:none] [-webkit-touch-callout:none] disabled:opacity-60 ${face} ${holding ? "scale-[0.98]" : ""}`}
      >
        <span aria-hidden className="relative grid h-8 w-8 place-items-center">
          <svg viewBox="0 0 32 32" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="16" cy="16" r="14" fill="none" strokeWidth="2.5" className={track} />
            <circle
              cx="16"
              cy="16"
              r="14"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={RING}
              stroke={gold}
              className={`transition-[stroke-dashoffset] ${holding ? "ease-linear" : "duration-200 ease-out"}`}
              style={{ strokeDashoffset: holding ? 0 : RING, transitionDuration: holding ? `${HOLD_MS}ms` : undefined }}
            />
          </svg>
          <span
            className={`transition-[rotate] ${holding ? "rotate-90 ease-in" : "duration-200"}`}
            style={{ color: gold, transitionDuration: holding ? `${HOLD_MS}ms` : undefined }}
          >
            {unlock ? <KeyRound size={15} /> : <Lock size={15} />}
          </span>
        </span>
        {label}
      </button>
      <p id={hintId} className={`text-center text-[11.5px] ${soft}`}>
        {unlock ? "Press and hold for a second: the key turns, and the trip opens." : "Press and hold for a second to lock the trip again."}
      </p>
      {asking && (
        <div role="group" aria-label={unlock ? "Unlock the trip" : "Lock the trip"} className="flex items-center justify-center gap-2 text-[12.5px]">
          <span>{unlock ? "Unlock it now?" : "Lock it again?"}</span>
          <button
            ref={yes}
            type="button"
            onClick={() => {
              setAsking(false);
              onTurn();
            }}
            className={`rounded-full px-3 py-1 font-medium ${dark ? "bg-white text-[#1d1d1f]" : "bg-[#1d1d1f] text-white"}`}
          >
            {unlock ? "Yes, unlock" : "Yes, lock"}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={`rounded-full px-3 py-1 font-medium ring-1 ${dark ? "ring-white/[0.15]" : "ring-black/[0.1]"}`}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

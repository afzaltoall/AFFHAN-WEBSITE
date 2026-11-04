"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2, Lock, LockOpen } from "lucide-react";

/**
 * The ID proof lock in the console (2026-11-04, the owner: "users upload their original ID proof ... keep it secure
 * ... with a password, a strong lock, access only for admin"). Applicants' ID proofs show as locked tiles until the
 * admin types their password; then they open for ten minutes on every screen of the console at once (Participants and
 * Employee tasks alike, in every tab), and lock again by themselves, with Lock now, or on signing out.
 *
 * The server holds the lock: /api/admin/trip-documents/[id] refuses a file without the unlock cookie, which only
 * /api/admin/trip-documents/unlock/ sets, after the password (lib/server/id-proof-lock.ts). This only keeps the screen
 * in step with it, so no file is even asked for while locked.
 */
type LockView = { state: "unknown" | "locked" | "open"; until: number | null };

const UNKNOWN: LockView = { state: "unknown", until: null };
const LOCKED: LockView = { state: "locked", until: null };
const URL = "/api/admin/trip-documents/unlock/";

let current: LockView = UNKNOWN;
const listeners = new Set<() => void>();
let lockTimer: number | undefined;
let asking: Promise<void> | null = null;
/** Every console tab hears an unlock or a lock made in another. */
let channel: BroadcastChannel | null | undefined;

function tabs(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel = new BroadcastChannel("affhan:id-proofs");
      channel.onmessage = (e: MessageEvent<LockView>) => show(e.data, false);
    } catch {
      channel = null;
    }
  }
  return channel;
}

function show(next: LockView, tell = true) {
  current = next.state === "open" && next.until && next.until > Date.now() ? next : next.state === "unknown" ? UNKNOWN : LOCKED;
  window.clearTimeout(lockTimer);
  if (current.state === "open" && current.until) lockTimer = window.setTimeout(() => show(LOCKED, false), current.until - Date.now());
  if (tell) tabs()?.postMessage(current);
  for (const l of listeners) l();
}

/** Where the server says things stand, asked once at a time. */
function refresh(): Promise<void> {
  if (asking) return asking;
  asking = fetch(URL, { cache: "no-store" })
    .then(async (res) => {
      const j = (await res.json().catch(() => ({}))) as { open?: boolean; until?: number | null };
      show(res.ok && j.open && j.until ? { state: "open", until: j.until } : LOCKED, false);
    })
    .catch(() => show(LOCKED, false))
    .finally(() => {
      asking = null;
    });
  return asking;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  tabs();
  // Back to a tab: the lock may have closed while it was hidden, or been changed elsewhere.
  const onVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    listeners.delete(fn);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** The password, sent to open ID proofs. Resolves null when they opened, or the sentence to show when not. */
async function openWith(password: string): Promise<string | null> {
  try {
    const res = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }), cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { open?: boolean; until?: number; error?: string };
    if (res.ok && j.open && j.until) {
      show({ state: "open", until: j.until });
      return null;
    }
    if (res.status === 401) return "Your admin session has ended. Sign in again.";
    return j.error || "That did not work. Try again.";
  } catch {
    return "No connection. Try again.";
  }
}

/** Lock now: the screen at once, the server straight after. */
async function lockNow() {
  show(LOCKED);
  await fetch(URL, { method: "DELETE", cache: "no-store" }).catch(() => {});
}

/** Whether ID proofs are open in this console, and until when. */
export function useIdProofLock(): LockView {
  const view = useSyncExternalStore(subscribe, () => current, () => UNKNOWN);
  useEffect(() => {
    if (current.state === "unknown") void refresh();
  }, []);
  return view;
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * The lock's line: locked, with the way to open them, or open, until when, with Lock now. Shown once where ID proofs
 * are listed (the Participants panel's ID proof, the top of an employee's applications).
 */
export function IdProofLockLine({ className = "" }: { className?: string }) {
  const lock = useIdProofLock();
  const [asking, setAsking] = useState(false);
  if (lock.state === "unknown") return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] ${className}`}>
      {lock.state === "open" && lock.until ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[#48484a]">
            <LockOpen size={14} aria-hidden="true" /> ID proofs open until {timeOf(lock.until)}
          </span>
          <button type="button" onClick={() => void lockNow()} className="font-medium text-[#0058b0] hover:underline">
            Lock now
          </button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-[#48484a]">
            <Lock size={14} aria-hidden="true" /> ID proofs are locked
          </span>
          <button type="button" onClick={() => setAsking(true)} className="font-medium text-[#0058b0] hover:underline">
            Open with your password
          </button>
        </>
      )}
      {asking && <OpenIdProofs onClose={() => setAsking(false)} />}
    </div>
  );
}

/**
 * The window that asks for the password: the console's own, never the browser's. Escape and a press beside it close
 * it (and only it); a wrong password says so and stays, the box emptied for another try.
 */
export function OpenIdProofs({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);
  // Escape answers this window only: caught on the way down, so the panel under it stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setProblem(null);
    const answer = await openWith(password);
    setBusy(false);
    if (!answer) return onClose();
    setProblem(answer);
    setPassword("");
    input.current?.focus();
  };

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="id-proofs-title"
        aria-describedby="id-proofs-body"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f7]">
          <Lock size={18} aria-hidden="true" />
        </span>
        <h2 id="id-proofs-title" className="mt-3 text-[16px] font-semibold tracking-tight">
          Open ID proofs
        </h2>
        <p id="id-proofs-body" className="mt-1.5 text-[13.5px] leading-relaxed text-[#48484a]">
          Applicants&apos; ID proofs stay locked. Type your admin password to see them for 10 minutes.
        </p>
        <label htmlFor="id-proofs-password" className="mt-4 block text-[13px] font-medium">
          Password
        </label>
        <input
          ref={input}
          id="id-proofs-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={200}
          className="mt-1.5 h-10 w-full rounded-lg bg-white px-3 text-[14px] outline-none ring-1 ring-black/[0.15] focus:ring-2 focus:ring-[#0071e3]/40"
        />
        {problem && (
          <p role="alert" className="mt-2 text-[13px] text-red-600">
            {problem}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-full px-4 text-[13px] font-medium ring-1 ring-black/[0.08] hover:bg-black/[0.03] disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
            Open for 10 minutes
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

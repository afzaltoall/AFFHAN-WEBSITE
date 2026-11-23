"use client";

import { useEffect, useRef } from "react";
import { timeAgo } from "@/lib/relative-time";
import { accountDone, accountToCheck, type InstagramAccountView, type InstagramSettingsView } from "@/lib/instagram-task-shared";

/**
 * The Instagram task's screens share these: the staff page, HR's board and the console's page. They are drawn in the
 * console's light colours only, each one in the console's dark table (scripts/build_admin_dark_css.mjs), so the
 * console's Dark mode turns them with everything else and the staff workspace keeps them light.
 */

export const card = "rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]";
export const pill =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors disabled:opacity-50";
export const pillPlain = `${pill} bg-white text-[#1d1d1f] hover:bg-black/[0.03]`;
export const pillDark = `${pill} bg-[#1d1d1f] text-white ring-[#1d1d1f] hover:bg-black`;
export const pillDanger = `${pill} bg-red-500 text-white ring-red-500 hover:bg-red-600`;
export const field =
  "h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-[14px] text-[#1d1d1f] outline-none placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20";
export const label = "text-[13px] font-medium text-[#1d1d1f]";

const IST = "Asia/Kolkata";
/** "20 Nov" */
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
/** "20 Nov, 3:40 pm" */
export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST });
export const num = (n: number) => n.toLocaleString("en-IN");

/** "2 hours ago", its date and time on hover. It reads differently in the browser a moment after the server drew it. */
export function Ago({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning title={fmtWhen(iso)}>
      {timeAgo(iso)}
    </span>
  );
}

/** A count against what the task asks, as Team tasks draws one. */
export function Bar({ value, of, name, thin = false }: { value: number; of: number; name: string; thin?: boolean }) {
  const share = of > 0 ? Math.max(0, Math.min(value / of, 1)) : 0;
  return (
    <div
      className={`${thin ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full bg-black/[0.06]`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={of}
      aria-valuenow={Math.min(value, of)}
      aria-label={name}
    >
      <div className="h-full rounded-full bg-brand-dark" style={{ width: `${share * 100}%` }} />
    </div>
  );
}

/** Escape for a window over a panel: heard first (the capture phase) and stopped there, so the panel stays open. */
export function useEscape(onEscape: () => void, busy = false) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onEscape();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onEscape, busy]);
}

/** A question in the page's own window, never the browser's. */
export function ConfirmWindow({
  title,
  children,
  confirm,
  working,
  danger = false,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirm: string;
  working: string;
  danger?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  useEscape(onCancel, busy);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ig-window-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <h2 id="ig-window-title" className="text-[17px] font-semibold">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-[#48484a]">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} onClick={onCancel} className={`${pillPlain} h-9 px-4`}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`${danger ? pillDanger : pillDark} h-9 px-4`}>
            {busy ? working : confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export type Sent<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** A write to the task's routes, its refusal in the route's own words. */
export async function sendJson<T = unknown>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<Sent<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
    if (!res.ok) {
      const said = data && typeof data.error === "string" ? data.error : null;
      return { ok: false, status: res.status, error: said ?? (res.status === 401 ? "Your session has ended. Sign in again." : "That didn't go through. Try again.") };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "No connection. Check the internet and try again." };
  }
}

export type AccountTone = "done" | "wait" | "bad" | "quiet";

/**
 * An account's one status word: Done (checked done), waiting for a check, Doesn't count, Checked (not there yet), or
 * none (nothing on it to check yet). The brand's colour only where it waits, red where it does not count.
 */
export function accountWord(a: InstagramAccountView, s: InstagramSettingsView, waiting: string): { word: string; tone: AccountTone } | null {
  if (accountDone(a, s)) return { word: "Done", tone: "done" };
  if (accountToCheck(a, s)) return { word: waiting, tone: "wait" };
  if (a.checkState === "rejected") return { word: "Doesn't count", tone: "bad" };
  if (a.checkState === "checked") return { word: "Checked", tone: "quiet" };
  return null;
}

export const toneClass: Record<AccountTone, string> = {
  done: "font-semibold text-[#1d1d1f]",
  wait: "font-semibold text-brand-dark",
  bad: "font-semibold text-red-700",
  quiet: "text-[#86868b]",
};

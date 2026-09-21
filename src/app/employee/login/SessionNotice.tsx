"use client";

import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";

/**
 * Why a session ended, in the words of the person it happened to.
 *
 * The guard in the workspace layout puts one of these on the URL when it sends
 * somebody here, because a login form that appears with no explanation reads as
 * a bug — and "you were signed out" and "your account was switched off" want
 * different responses from the reader.
 *
 * WHY THIS IS ITS OWN COMPONENT. useSearchParams makes Next bail out of
 * server rendering for everything inside the nearest <Suspense>, emitting the
 * fallback instead. The whole login screen used to sit inside that boundary,
 * so the server sent `null` for all of it: the shell, the headline, the
 * description, the stats and the form existed only in the RSC payload and
 * appeared after hydration. Production proved it — "The sales desk" and
 * "Staff workspace" returned zero matches in the HTML while the stat values
 * sat in the flight data.
 *
 * Only this notice needs the query string, so only this is wrapped. Everything
 * else is server-rendered again.
 */
const REASONS: Record<string, string> = {
  expired: "Your session timed out after 30 minutes of inactivity. Please sign in again.",
  disabled: "That account is no longer active. Ask an administrator to re-enable it.",
  signedout: "You were signed out. Please sign in again.",
};

export function SessionNotice() {
  const params = useSearchParams();
  let notice: string | null = null;
  for (const key of Object.keys(REASONS)) if (params.get(key)) { notice = REASONS[key]; break; }
  if (!notice) return null;

  return (
    // role="status" rather than "alert": it is the expected consequence of a
    // timeout, not an error, and it is present on first paint so an assertive
    // live region would interrupt the reader for something they already know.
    <div
      role="status"
      className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-900"
    >
      <Info className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>{notice}</span>
    </div>
  );
}

export default SessionNotice;

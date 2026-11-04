"use client";

import { useEffect } from "react";
import { REFERRAL_DROPPED_EVENT, REFERRAL_EVENT, REFERRAL_STORAGE_KEY, referralFromSearch } from "@/lib/trip-referral-shared";

/** How long the server has to say whether a link is live; unanswered by then, the code stays and the application decides. */
const CHECK_MS = 10_000;

/**
 * An employee's link (affhan.com/free-china-trip/apply/?ref=RAHIM7, the owner's referral task, 2026-11-02) keeps its code in
 * this browser, so the application goes with it (useApplication) and credits that employee, whether the visitor
 * applies now, after reading the trip's page, or days later (REFERRAL_STORAGE_DAYS). The latest live link wins.
 * On the trip's page and its application. Draws nothing, and the visitor is never shown a code or asked for one
 * (the owner: only somebody who came through the employee's link is theirs).
 *
 * Kept the moment the page opens, before the server has answered (2026-11-04, the owner: "sometimes the document part
 * is not showing ... they apply but it doesn't count"): it was kept only once the server said the link was live, so
 * an answer that came late (25 s on a slow phone), never came, or went unheard left the application without its ID
 * proof and its employee. Now only a clear answer that the link credits nobody (a former employee's, a mistyped code;
 * only an active employee's is live, /api/trip-applications/referral) takes it back, and puts back the live link this
 * browser kept before it. The question is never cancelled on leaving the page, only given up after CHECK_MS.
 */
export function TripRefCapture() {
  useEffect(() => {
    const code = referralFromSearch(window.location.search);
    if (!code) return;
    const before = read();
    write(JSON.stringify({ code, at: Date.now() }));
    window.dispatchEvent(new CustomEvent<string>(REFERRAL_EVENT, { detail: code }));
    const ask = new AbortController();
    const timer = window.setTimeout(() => ask.abort(), CHECK_MS);
    void (async () => {
      let live: boolean | null = null;
      try {
        const res = await fetch(`/api/trip-applications/referral/?code=${encodeURIComponent(code)}`, { cache: "no-store", signal: ask.signal });
        if (res.ok) live = ((await res.json()) as { live?: unknown }).live === true;
      } catch {
        /* not answered, or not in time: kept, and the application decides */
      } finally {
        window.clearTimeout(timer);
      }
      if (live !== false) return;
      // Credits nobody: forgotten, with the live link kept before it back in its place (when it was another one).
      if (keptCode(read()) === code) write(before && keptCode(before) !== code ? before : null);
      window.dispatchEvent(new CustomEvent<string>(REFERRAL_DROPPED_EVENT, { detail: code }));
    })();
  }, []);
  return null;
}

function read(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(REFERRAL_STORAGE_KEY);
    else localStorage.setItem(REFERRAL_STORAGE_KEY, value);
  } catch {
    /* storage blocked: the application on this page takes the code from the address, and from the event */
  }
}

function keptCode(raw: string | null): string {
  try {
    return String((JSON.parse(raw ?? "null") as { code?: unknown } | null)?.code ?? "");
  } catch {
    return "";
  }
}

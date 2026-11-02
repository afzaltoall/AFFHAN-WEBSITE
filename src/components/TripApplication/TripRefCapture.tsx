"use client";

import { useEffect } from "react";
import { REFERRAL_EVENT, REFERRAL_STORAGE_KEY, normalizeReferralCode } from "@/lib/trip-referral-shared";

/**
 * An employee's link (affhan.com/free-china-trip/apply/?ref=RAHIM7, the owner's referral task, 2026-11-02) keeps its code in
 * this browser, so the application goes with it (useApplication) and credits that employee, whether the visitor
 * applies now, after reading the trip's page, or days later (REFERRAL_STORAGE_DAYS). The latest live link wins.
 * On the trip's page and its application. Draws nothing, and the visitor is never shown a code or asked for one
 * (the owner: only somebody who came through the employee's link is theirs).
 *
 * Only a live link is kept, an active employee's (/api/trip-applications/referral): such a visitor is asked for ID
 * proof, and nobody else is (the owner, 2026-11-02), so a former employee's or a mistyped link is forgotten here.
 * When the check cannot be made (offline, a refusal), the code is kept, and the server decides with the application.
 * Never cancelled on leaving the page: the trip's page is often left for the application before the answer comes.
 */
export function TripRefCapture() {
  useEffect(() => {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    if (code.length < 3) return;
    void (async () => {
      let live = true;
      try {
        const res = await fetch(`/api/trip-applications/referral/?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        if (res.ok) live = ((await res.json()) as { live?: unknown }).live === true;
      } catch {
        /* not answered: keep it, the application decides */
      }
      if (!live) return;
      try {
        localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, at: Date.now() }));
      } catch {
        /* storage blocked: an application open on this page still gets it, from the event */
      }
      window.dispatchEvent(new CustomEvent<string>(REFERRAL_EVENT, { detail: code }));
    })();
  }, []);
  return null;
}

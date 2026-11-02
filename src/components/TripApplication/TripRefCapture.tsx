"use client";

import { useEffect } from "react";
import { REFERRAL_STORAGE_KEY, normalizeReferralCode } from "@/lib/trip-referral-shared";

/**
 * An employee's link (affhan.com/free-china-trip/?ref=RAHIM7, the owner's referral task, 2026-11-02) keeps its code in
 * this browser, so the application goes with it (useApplication) and credits that employee, whether the visitor
 * applies now, after reading the trip's page, or days later (REFERRAL_STORAGE_DAYS). The latest link visited wins.
 * On the trip's page and its application. Draws nothing, and the visitor is never shown a code or asked for one
 * (the owner: only somebody who came through the employee's link is theirs).
 */
export function TripRefCapture() {
  useEffect(() => {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    if (code.length < 3) return;
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, at: Date.now() }));
    } catch {
      /* storage blocked: the application goes without the code */
    }
  }, []);
  return null;
}

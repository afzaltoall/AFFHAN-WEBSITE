"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { wt } from "@/components/employee/workspace-ui";

/**
 * The staff pages' Refresh, one look on every page (2026-11-09: switching between My referrals and Profile, the two
 * had different buttons in different places, "the ui no perfect"): the word on a phone as well as on a computer.
 */
export function RefreshPill({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold disabled:opacity-70 sm:h-9 sm:gap-1.5 sm:text-[13px] ${wt.pill}`}
    >
      <RefreshCw aria-hidden className={`size-4 sm:size-3.5 ${refreshing ? "animate-spin" : ""}`} />
      {refreshing ? "Updating…" : "Refresh"}
    </button>
  );
}

/**
 * My referrals read again from the server, without reloading the page (2026-11-08, the owner: "refresh button kudu ipo
 * refresh panadha evalo avndhurukunu paaka mudiyum"), as the console's Employee tasks has: the figures and the list
 * follow, and an opened person stays open.
 */
export function ReferralRefresh() {
  const router = useRouter();
  const [refreshing, start] = useTransition();
  return <RefreshPill refreshing={refreshing} onRefresh={() => start(() => router.refresh())} />;
}

export default ReferralRefresh;

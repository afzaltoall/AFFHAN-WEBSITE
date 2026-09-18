"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";

/**
 * The Refresh pill the console already has, plus the one thing it never said:
 * how fresh the screen in front of you is. The page refreshes itself (see
 * useLiveRefresh), so the button is for "now, please" and the caption is the
 * proof that it has been happening anyway.
 */
export function LiveRefreshButton({
  onRefresh,
  refreshing,
  updatedAt,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  updatedAt: number;
}) {
  // Re-render the caption as it ages; nothing else here changes on its own.
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-[12px] text-[#86868b] sm:inline" aria-live="polite">
        {refreshing ? "Updating…" : `Updated ${timeAgo(new Date(updatedAt))}`}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[#1d1d1f] shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:opacity-70"
      >
        <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        <span className="hidden sm:inline">Refresh</span>
      </button>
    </div>
  );
}

export default LiveRefreshButton;

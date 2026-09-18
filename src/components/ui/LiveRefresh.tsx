"use client";

import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { LiveRefreshButton } from "@/components/ui/LiveRefreshButton";

/**
 * Live refresh for a server-rendered page that has no client component of its
 * own to hang it on — the activity feed, a staff member's page. Drop it in the
 * header and the page keeps itself current, with a Refresh button for "now".
 */
export function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const { refresh, refreshing, updatedAt } = useLiveRefresh(intervalMs);
  return <LiveRefreshButton onRefresh={refresh} refreshing={refreshing} updatedAt={updatedAt} />;
}

export default LiveRefresh;

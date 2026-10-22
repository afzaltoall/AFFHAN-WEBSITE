import Link from "next/link";
import { Hand } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { POOL_EVENT, poolKindLabel } from "@/lib/lead-pool-rules";
import type { PoolEventRow } from "@/lib/lead-pool";

/**
 * The open pool's moves, newest first: who took, released or lost a customer, and which held customers an
 * administrator put back. Read from the trail (LeadQueueEvent) by lib/lead-pool.ts, poolEvents. For
 * /admin/activity (everybody) and /admin/employees/[id] (one person). The names link to the people; the customer is
 * named by name and number, as in the console's lists. Exact times, as an audit wants them, and the same wherever the
 * list is drawn.
 */
export function PoolMoves({ rows, empty }: { rows: PoolEventRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="rounded-2xl bg-white px-5 py-12 text-center text-[13px] text-[#86868b] shadow-sm ring-1 ring-black/[0.04]">{empty}</p>;
  }
  const person = (p: { id: string | null; name: string | null }) =>
    p.id ? (
      <Link href={`/admin/employees/${p.id}/`} className="font-semibold hover:underline">
        {p.name}
      </Link>
    ) : (
      <span className="font-semibold">{p.name}</span>
    );
  return (
    <ol className="space-y-2">
      {rows.map((e) => {
        // Who did it, and to whom: a Take names the taker; a release or an auto-release the one who lost them; an
        // administrator's move both ends.
        const by =
          e.kind === POOL_EVENT.TAKEN ? (
            <>{person(e.to)} took</>
          ) : e.kind === POOL_EVENT.ADMIN_ASSIGNED ? (
            <>
              {e.from.name ? <>{person(e.from)} → </> : null}
              {person(e.to)}
            </>
          ) : e.from.name ? (
            person(e.from)
          ) : null;
        return (
          <li key={e.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] ring-1 ring-black/10">
                <Hand className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-snug">
                  <span className="font-semibold">{poolKindLabel(e.kind)}</span>
                  {by && <span className="text-[#48484a]"> · {by}</span>}
                  <span className="text-[#48484a]"> · {e.customerName}</span>
                  {e.code && <span className="ml-1.5 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#48484a]">{e.code}</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-[#86868b]">
                  <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default PoolMoves;

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Loader2, Package, Trash2 } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { Card, EmptyState, Fade, SectionHeader } from "@/components/account/AccountShell";

/**
 * The products this customer has opened, newest first.
 *
 * Recorded only while signed in, one row per product, moved to the top when
 * they look again — so this is a trail to pick back up, not a count of how
 * often anything was viewed. CLAUDE.md rules out user tracking, and this stays
 * on the right side of that line: it holds nothing the customer could not read
 * out of their own browser history, it is visible to them, and the Clear
 * button empties it for good.
 */

interface HistoryRow {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  viewedAt: string;
}

/** "Today" and "Yesterday" are what people actually navigate by. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/web/account/history", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.history) ? json.history : []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = async () => {
    setClearing(true);
    try {
      await fetch("/api/web/account/history", { method: "DELETE", credentials: "include" });
      setRows([]);
    } catch {
      // Leave the list alone; a failed delete is not a reason to show an empty
      // page that would suggest it worked.
    } finally {
      setClearing(false);
    }
  };

  // Grouped by day so a long trail reads as a diary rather than one flat wall.
  const groups: Array<[string, HistoryRow[]]> = [];
  for (const row of rows ?? []) {
    const label = dayLabel(row.viewedAt);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(row);
    else groups.push([label, [row]]);
  }

  return (
    <Fade>
      <SectionHeader
        title="Browsing history"
        subtitle="Products you opened while signed in. Only you can see this."
        action={
          rows && rows.length > 0 ? (
            <button
              onClick={() => void clear()}
              disabled={clearing}
              className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-[13px] font-medium text-red-600 shadow-sm ring-1 ring-black/[0.04] transition-colors hover:bg-red-50 disabled:opacity-60 cursor-pointer"
            >
              {clearing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Clear
            </button>
          ) : undefined
        }
      />

      {rows === null ? (
        <Card>
          <div className="flex justify-center py-16">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Clock}
            title="Nothing here yet"
            body="Open a product while you're signed in and it will show up here, so you can pick up where you left off."
            action={
              <Link
                href="/products/"
                className="inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                Browse products
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, items]) => (
            <div key={label}>
              <h2 className="mb-2.5 px-1 text-[12px] font-bold uppercase tracking-wider text-slate-400">
                {label}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((row) => (
                  <Link
                    key={row.id}
                    href={`/products/${row.id}/`}
                    className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-square bg-slate-100">
                      {row.imageUrl ? (
                        <Image
                          src={getCdnUrl(row.imageUrl) ?? row.imageUrl}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 50vw, 220px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <Package size={22} className="text-slate-300" />
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-800 group-hover:text-brand">
                        {row.name}
                      </p>
                      {row.category && (
                        <p className="mt-1 truncate text-[11px] text-slate-400">{row.category}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Fade>
  );
}

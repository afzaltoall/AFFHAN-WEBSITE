"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Loader2, Package } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { useFavourites } from "@/context/FavouritesContext";
import { Card, EmptyState, Fade, SectionHeader } from "@/components/account/AccountShell";

/**
 * The products this customer saved.
 *
 * The list is fetched here rather than read out of FavouritesContext: the
 * context holds ids, which is all a grid of hearts needs, and turning those
 * into names and images is a job for the server. The context is still the
 * source of truth for what is saved — unsaving from this page goes through it,
 * so a heart elsewhere on the site cannot end up disagreeing.
 */

interface FavouriteRow {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  savedAt: string;
}

export default function FavouritesPage() {
  const [rows, setRows] = useState<FavouriteRow[] | null>(null);
  const { ids, toggle } = useFavourites();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/web/account/favourites", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      setRows(Array.isArray(json?.favourites) ? json.favourites : []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Unsaving removes the tile immediately. Leaving a hollow heart on a page
  // titled "Favourites" is a row claiming to be something it no longer is —
  // the list is filtered by the context so the two can never disagree.
  const visible = (rows ?? []).filter((r) => ids.has(r.id));

  return (
    <Fade>
      <SectionHeader
        title="Favourites"
        subtitle="Products you saved. Only you can see this list."
      />

      {rows === null ? (
        <Card>
          <div className="flex justify-center py-16">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Heart}
            title="Nothing saved yet"
            body="Tap the heart on any product to keep it here — a shortlist to come back to before you ask for a quote."
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
        <>
          <p className="mb-3 px-1 text-[13px] text-slate-500">
            {visible.length} {visible.length === 1 ? "product" : "products"} saved
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((row) => (
              <div
                key={row.id}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md"
              >
                {/* Outside the Link: a button nested in an anchor is invalid
                    HTML and the two would fight over the click. */}
                <button
                  type="button"
                  aria-label="Remove from favourites"
                  onClick={() => void toggle(row.id)}
                  className="absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-black/[0.06] backdrop-blur-sm transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                >
                  <Heart size={15} className="fill-red-500 text-red-500" />
                </button>

                <Link href={`/products/${row.id}/`} className="block">
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
              </div>
            ))}
          </div>
        </>
      )}
    </Fade>
  );
}

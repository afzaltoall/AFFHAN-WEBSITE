"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFavourites } from "@/context/FavouritesContext";

/**
 * The labelled version of the heart, for the product page.
 *
 * The icon alone works in a grid, where a row of hearts explains itself by
 * repetition. Standing on its own next to "Request a Quote" it does not, so
 * here it says what it does — and says what it did, which is the part a bare
 * icon cannot confirm.
 */
export function SaveProductButton({ productId }: { productId: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const { isSaved, toggle } = useFavourites();
  const saved = isSaved(productId);

  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        if (!user) {
          router.push(`/login/?redirect=${encodeURIComponent(`/products/${productId}/`)}`);
          return;
        }
        void toggle(productId);
      }}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-bold transition-all cursor-pointer ${
        saved
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <Heart size={17} className={saved ? "fill-red-500 text-red-500" : ""} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}

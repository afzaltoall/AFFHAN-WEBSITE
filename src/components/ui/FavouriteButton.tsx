"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFavourites } from "@/context/FavouritesContext";

/**
 * Save a product to the customer's own list.
 *
 * Sits over a product image, which is nearly always inside a link — so it
 * stops the click before the browser starts navigating. Without that, tapping
 * the heart would open the product page instead of saving it.
 *
 * A signed-out visitor is sent to sign in rather than being told off. Saving
 * needs an account, but "you can't do that" is a dead end where "sign in and
 * we'll bring you straight back" is not.
 */
export function FavouriteButton({
  productId,
  size = "md",
  className = "",
}: {
  productId: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { isSaved, toggle } = useFavourites();

  const saved = isSaved(productId);
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const icon = size === "sm" ? 14 : 17;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from favourites" : "Save to favourites"}
      title={saved ? "Saved" : "Save"}
      onClick={(e) => {
        // The heart is layered over a Link; without these the click navigates.
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          router.push(`/login/?redirect=${encodeURIComponent(`/products/${productId}/`)}`);
          return;
        }
        void toggle(productId);
      }}
      className={`flex ${box} items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-black/[0.06] backdrop-blur-sm transition-all hover:scale-110 hover:bg-white active:scale-95 cursor-pointer ${className}`}
    >
      <Heart
        size={icon}
        // Filled is the whole signal — an outline that only changes colour is
        // hard to read at a glance across a grid.
        className={`transition-colors ${saved ? "fill-red-500 text-red-500" : "text-slate-500"}`}
      />
    </button>
  );
}

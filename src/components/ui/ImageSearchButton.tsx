"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Camera, Check, Loader2, X } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { cn } from "@/lib/utils";

type Result = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
};

type Category = { id: string; name: string; parentName: string | null };

type Response = {
  isProduct?: boolean;
  productType?: string;
  terms?: string[];
  categories?: Category[];
  products?: Result[];
  message?: string;
  error?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** Each step names a phase that genuinely happens server-side, in the order it
 *  happens. The timings are approximations of a ~2s round trip rather than
 *  progress reported by the server — but nothing here claims work that is not
 *  being done, which matters more than the animation. */
const STEPS = [
  { label: "Reading your image", detail: "Checking format and size", at: 0 },
  { label: "Identifying the product", detail: "Working out what the object is", at: 350 },
  { label: "Searching the catalogue", detail: "Across 10 lakh+ products", at: 1300 },
  { label: "Matching categories", detail: "Finding the branch it belongs to", at: 1900 },
];

function ThinkingSteps() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-md py-8">
      <p className="mb-5 text-center text-sm font-semibold text-slate-900">
        AFFHAN is looking through the catalogue
      </p>
      <ol className="space-y-3.5">
        {STEPS.map((s, i) => {
          const started = elapsed >= s.at;
          // A step counts as done once the next one has begun; the last stays
          // spinning until the response lands and this whole block unmounts.
          const done = i < STEPS.length - 1 && elapsed >= STEPS[i + 1].at;
          return (
            <li
              key={s.label}
              className={cn(
                "flex items-start gap-3 transition-opacity duration-300",
                started ? "opacity-100" : "opacity-35",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done
                    ? "border-[#1d7e93] bg-[#1d7e93] text-white"
                    : started
                      ? "border-[#1d7e93] text-[#1d7e93]"
                      : "border-slate-300 text-slate-300",
                )}
              >
                {done ? (
                  <Check size={12} strokeWidth={3} />
                ) : started ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{s.label}</span>
                <span className="block text-xs text-slate-500">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Search the catalogue by photograph.
 *
 * Posts the file to /api/search/image, which identifies what the object is and
 * then runs the ordinary catalogue search on those terms. Everything shown
 * below is a real row from the product table — the model never sees product
 * data and never produces any, so there is nothing here it could have invented.
 *
 * The dialog is portalled to document.body, and that is not optional. This
 * button lives inside the search pill, which carries `liquid-glass-card` and
 * therefore `backdrop-filter`. An element with a backdrop-filter becomes the
 * containing block for fixed-position descendants, so `fixed inset-0` rendered
 * in place was sized to the search bar rather than the viewport — which is
 * exactly what the broken overlay looked like.
 *
 * The preview is a local object URL rather than an upload to storage: the file
 * only needs to exist for the length of the request, and keeping it client-side
 * avoids putting customer photographs in S3 for no reason.
 */
export function ImageSearchButton({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Response | null>(null);
  const [inquiry, setInquiry] = useState<Result | null>(null);

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setResult(null);
    setInquiry(null);
    setBusy(false);
    setOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // Escape closes, and the page behind stops scrolling while the dialog is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, reset]);

  const onPick = useCallback(async (file: File) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(file);
    previewUrl.current = url;
    setPreview(url);
    setResult(null);
    setOpen(true);
    setBusy(true);

    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/search/image", { method: "POST", body });
      const data: Response = await res.json().catch(() => ({ error: "Something went wrong." }));
      setResult(res.ok ? data : { error: data.error ?? "Something went wrong." });
    } catch {
      setResult({ error: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }, []);

  const products = result?.products ?? [];
  const categories = result?.categories ?? [];

  const dialog = !open ? null : (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search by photo results"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      <div className="my-auto flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start gap-4 border-b border-slate-200 p-5">
          {preview ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, nothing for next/image to optimise */}
              <img src={preview} alt="The photo you uploaded" className="size-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">
              {busy ? "Search by photo" : result?.productType || "Search by photo"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {busy
                ? "Reading the image and matching it to the catalogue."
                : result?.error
                  ? result.error
                  : result?.isProduct === false
                    ? result.message
                    : products.length
                      ? `${products.length} similar ${products.length === 1 ? "product" : "products"} we can source.`
                      : "Nothing close in the catalogue — send it to us and we will find who makes it."}
            </p>
            {!busy && result?.terms?.length ? (
              <p className="mt-1.5 text-xs text-slate-400">Matched on: {result.terms.join(", ")}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {busy ? (
            <ThinkingSteps />
          ) : (
            <>
              {/* Categories first. A photograph tells us the kind of thing
                  somebody wants, and the branch of the catalogue it sits in is
                  often more useful to a sourcing buyer than any one listing. */}
              {categories.length > 0 && (
                <div className="mb-6">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Categories to explore
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <Link
                        key={c.id}
                        href={`/products/?categoryId=${c.id}`}
                        onClick={reset}
                        className="group inline-flex items-baseline gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm transition-colors hover:border-[#27a8c4] hover:bg-white"
                      >
                        {c.parentName ? (
                          <span className="text-xs text-slate-400 group-hover:text-slate-500">
                            {c.parentName} ›
                          </span>
                        ) : null}
                        <span className="font-medium text-slate-700 group-hover:text-[#176579]">
                          {c.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {products.length ? (
                <div
                  className={cn(
                    "mx-auto grid gap-4",
                    products.length === 1
                      ? "max-w-[220px] grid-cols-1"
                      : products.length === 2
                        ? "max-w-md grid-cols-2"
                        : products.length === 3
                          ? "max-w-2xl grid-cols-2 sm:grid-cols-3"
                          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
                  )}
                >
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => setInquiry(p)} />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="mx-auto max-w-md text-sm text-slate-500">
                    The catalogue is a guide to what we can source, not stock we hold — so a close match is
                    normal and an exact one is not required.
                  </p>
                  <Link
                    href="/contact/"
                    onClick={reset}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] transition-colors hover:text-[#27a8c4] hover:underline"
                  >
                    Send us the product instead
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Search by photo"
        title="Search by photo"
        className={cn(
          "inline-flex items-center justify-center rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#176579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          className,
        )}
      >
        <Camera size={18} />
      </button>

      {mounted && dialog ? createPortal(dialog, document.body) : null}

      {/* Same quick-quote modal the product grids use, so an image search
          ends where every other route through the catalogue ends. */}
      {mounted && inquiry
        ? createPortal(
            <InquiryModal product={inquiry} onClose={() => setInquiry(null)} />,
            document.body,
          )
        : null}
    </>
  );
}

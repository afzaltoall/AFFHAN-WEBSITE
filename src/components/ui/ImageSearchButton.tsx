"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { cn } from "@/lib/utils";

type Result = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
};

type Response = {
  isProduct?: boolean;
  productType?: string;
  terms?: string[];
  products?: Result[];
  message?: string;
  error?: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/**
 * Search the catalogue by photograph.
 *
 * Posts the file to /api/search/image, which identifies what the object is and
 * then runs the ordinary catalogue search on those terms. Everything shown
 * below is a real row from the product table — the model never sees product
 * data and never produces any, so there is nothing here it could have invented.
 *
 * The preview is a local object URL rather than an upload to storage: the file
 * only needs to exist for the length of the request, and keeping it client-side
 * avoids putting customer photographs in S3 for no reason.
 */
export function ImageSearchButton({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Response | null>(null);
  const [inquiry, setInquiry] = useState<Result | null>(null);

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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search by photo results"
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) reset();
          }}
        >
          <div className="w-full max-w-4xl rounded-3xl bg-white shadow-xl">
            <div className="flex items-start gap-4 border-b border-slate-200 p-5">
              {preview ? (
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, nothing for next/image to optimise */}
                  <img src={preview} alt="The photo you uploaded" className="size-full object-cover" />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900">
                  {busy ? "Looking through the catalogue…" : result?.productType || "Search by photo"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {busy
                    ? "Identifying the product."
                    : result?.error
                      ? result.error
                      : result?.isProduct === false
                        ? result.message
                        : products.length
                          ? `${products.length} similar ${products.length === 1 ? "product" : "products"} we can source.`
                          : "Nothing close in the catalogue — send it to us and we will find who makes it."}
                </p>
                {result?.terms?.length ? (
                  <p className="mt-1.5 text-xs text-slate-400">Matched on: {result.terms.join(", ")}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={reset}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5">
              {busy ? (
                <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">One moment</span>
                </div>
              ) : products.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} onClick={() => setInquiry(p)} />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-sm text-slate-500">
                    The catalogue is a guide to what we can source, not stock we hold — so a close match is
                    normal and an exact one is not required.
                  </p>
                  <a
                    href="/contact/"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] transition-colors hover:text-[#27a8c4] hover:underline"
                  >
                    Send us the product instead
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Same quick-quote modal the product grids use, so an image search
          ends where every other route through the catalogue ends. */}
      <InquiryModal product={inquiry} onClose={() => setInquiry(null)} />
    </>
  );
}

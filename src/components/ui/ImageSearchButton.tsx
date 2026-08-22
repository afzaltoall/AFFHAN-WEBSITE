"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Camera, Check, X } from "lucide-react";
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
 *  happens, with a rough duration so its bar can fill while it runs. The
 *  timings approximate a ~2s round trip rather than being progress reported by
 *  the server — nothing here claims work that is not being done, but it is an
 *  estimate and worth saying so. */
const STEPS = [
  { label: "Reading your image", detail: "Checking the file format, size and orientation", at: 0, dur: 400 },
  { label: "Identifying the product", detail: "Working out what the object in the photo actually is", at: 400, dur: 900 },
  { label: "Searching the catalogue", detail: "Matching those terms across 10 lakh+ products", at: 1300, dur: 700 },
  { label: "Matching categories", detail: "Finding which branch of the catalogue it belongs to", at: 2000, dur: 900 },
];

/** Rotates inside the mascot's speech bubble. Deliberately about the service
 *  rather than the search in progress, so no line can turn out to be wrong
 *  about a particular result. */
const QUOTES = [
  "Send me a photo and I will find who makes it.",
  "A close match is enough — we source to your specification.",
  "Nothing in here is stock. It is what our factories can build.",
  "Our buyers check the plant before your deposit moves.",
];

function ThinkingSteps() {
  const [elapsed, setElapsed] = useState(0);
  const [quote, setQuote] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - started), 100);
    const rotate = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 3600);
    return () => {
      clearInterval(tick);
      clearInterval(rotate);
    };
  }, []);

  const startedCount = STEPS.filter((s) => elapsed >= s.at).length;
  const railPct = ((Math.max(1, startedCount) - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="mx-auto max-w-2xl px-1 py-4">
      {/* Mascot and bubble sit together on one row so the quote is clearly his,
          and the pair uses the full width instead of a narrow centred column. */}
      <div className="mb-8 flex items-center gap-4 sm:gap-5">
        <div className="affhan-drift shrink-0" aria-hidden="true">
          <Image
            src="/affhan-robot.webp"
            alt=""
            width={72}
            height={71}
            className="size-16 object-contain drop-shadow-[0_8px_18px_rgba(39,168,196,0.35)] sm:size-[72px]"
            priority
          />
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Tail: a rotated square tucked under the bubble's left edge, so it
              reads as pointing at the mascot without needing an SVG. */}
          <span
            className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-b border-l border-white/70 bg-white/80"
            aria-hidden="true"
          />
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
            <p key={quote} className="text-sm leading-snug text-slate-700 motion-safe:animate-[fadeIn_450ms_ease-out]">
              {QUOTES[quote]}
            </p>
          </div>
        </div>
      </div>

      <ol className="relative">
        <span className="absolute left-[11px] top-3 bottom-6 w-0.5 rounded-full bg-slate-200/80" aria-hidden="true" />
        <span
          className="step-rail-fill absolute left-[11px] top-3 w-0.5 rounded-full bg-gradient-to-b from-[#27a8c4] to-[#176579]"
          style={{ height: `calc((100% - 2.25rem) * ${railPct / 100})` }}
          aria-hidden="true"
        />

        {STEPS.map((s, i) => {
          const started = elapsed >= s.at;
          const done = i < STEPS.length - 1 && elapsed >= STEPS[i + 1].at;
          // The final step holds just short of full while the response is still
          // in flight — showing it complete would be a lie about the state.
          const raw = started ? Math.min(1, (elapsed - s.at) / s.dur) : 0;
          const pct = done ? 100 : Math.round((i === STEPS.length - 1 ? Math.min(raw, 0.92) : raw) * 100);

          return (
            <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
              <span
                className={cn(
                  "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 bg-white transition-all duration-500",
                  done
                    ? "border-[#1d7e93] bg-[#1d7e93] text-white"
                    : started
                      ? "border-[#27a8c4] text-[#1d7e93] shadow-[0_0_0_4px_rgba(39,168,196,0.14)]"
                      : "border-slate-200 text-slate-300",
                )}
              >
                {done ? (
                  <Check size={13} strokeWidth={3} />
                ) : (
                  <span className={cn("size-2 rounded-full bg-current", started && "motion-safe:animate-pulse")} />
                )}
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 transition-opacity duration-500",
                  started ? "opacity-100" : "opacity-45",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
                    {done ? "Done" : started ? `${pct}%` : "Waiting"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{s.detail}</span>

                {/* The horizontal line under each step: full width, filling as
                    that stage runs. This is the part a spinner cannot express. */}
                <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-slate-200/70">
                  <span
                    className="step-bar-fill block h-full rounded-full bg-gradient-to-r from-[#27a8c4] to-[#176579]"
                    style={{ width: `${pct}%` }}
                  />
                </span>
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
 * in place was sized to the search bar rather than the viewport.
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

  // Flags the panel while it is actively scrolling. Cheap: a data attribute
  // written straight to the node, so it never re-renders the grid.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.dataset.scrolling = "true";
    if (scrollIdle.current) clearTimeout(scrollIdle.current);
    scrollIdle.current = setTimeout(() => {
      el.dataset.scrolling = "false";
    }, 140);
  }, []);

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
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-md sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      {/* Glass panel: translucent white over the blurred page, a light top-left
          border to catch the light, and a soft ring so it reads as a raised
          surface rather than a flat sheet. */}
      <div className="my-auto flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5">
        <div className="flex shrink-0 items-start gap-4 border-b border-slate-200/70 bg-gradient-to-b from-white/80 to-white/40 p-5">
          {preview ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-white/80 bg-slate-100 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, nothing for next/image to optimise */}
              <img src={preview} alt="The photo you uploaded" className="size-full object-cover" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-900">
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

        <div
          ref={scrollerRef}
          onScroll={onScroll}
          data-scrolling="false"
          className="scroll-panel min-h-0 flex-1 overflow-y-auto p-5"
        >
          {busy ? (
            <ThinkingSteps />
          ) : (
            <>
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
                        className="group inline-flex items-baseline gap-1.5 rounded-full border border-slate-200/80 bg-white/70 px-3.5 py-2 text-sm shadow-sm transition-all hover:border-[#27a8c4] hover:bg-white hover:shadow"
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

      {mounted && inquiry
        ? createPortal(
            <InquiryModal product={inquiry} onClose={() => setInquiry(null)} />,
            document.body,
          )
        : null}
    </>
  );
}

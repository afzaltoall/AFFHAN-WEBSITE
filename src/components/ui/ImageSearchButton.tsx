"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Camera, Check, Upload, X } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
import { InquiryModal } from "@/components/ui/InquiryModal";
import { lockBodyScroll } from "@/lib/scrollLock";
import { useBackDismiss } from "@/lib/useBackDismiss";
import { capturePhoto, hasNativeCamera, CameraCancelled } from "@/lib/nativeCamera";
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
  searchQuery?: string;
  categories?: Category[];
  products?: Result[];
  message?: string;
  error?: string;
};

/* Kept in step with ACCEPTED_IMAGE_TYPES in lib/imageSearch. Anything beyond
   JPEG/PNG/WebP is transcoded to JPEG server-side before it reaches a vision
   provider, so the wide list here is real support rather than a filter that
   lets a file through only for the API to reject it.

   .heic and .heif appear as bare extensions too: iOS and some desktop file
   pickers report an empty MIME type for them, and an accept list of MIME types
   alone greys those photos out in the chooser. */
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif,image/tiff,image/bmp,.heic,.heif,.avif";
const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/avif",
  "image/gif", "image/heic", "image/heif", "image/tiff", "image/bmp",
];
/** Some pickers hand back an empty type for HEIC/AVIF. Falling back to the
 *  extension stops a valid phone photo being refused before it is ever sent;
 *  the server re-checks and can still decline it. */
const ACCEPTED_EXTS = /\.(jpe?g|png|webp|avif|gif|heic|heif|tiff?|bmp)$/i;

/** Mirrors MAX_IMAGE_BYTES in lib/imageSearch. Deliberately re-declared rather
 *  than imported: that module resolves provider API keys, and it has no place
 *  in a client bundle. The server still enforces the real limit — this only
 *  saves the user a 5MB upload that was going to be refused. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Width of the upload panel, and the margin it keeps from the viewport edge. */
const PANEL_W = 380;
const PANEL_MARGIN = 12;

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
            className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] border-b border-l border-slate-200 bg-slate-50"
            aria-hidden="true"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
            <p key={quote} className="text-sm leading-snug text-slate-800 motion-safe:animate-[fadeIn_450ms_ease-out]">
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
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
                    {done ? "Done" : started ? `${pct}%` : "Waiting"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{s.detail}</span>

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

  /* Whether a real camera can be opened, which is true only inside the Android
     app. Resolved in an effect rather than during render because the Capacitor
     bridge is a client-side global: reading it while rendering would make the
     server and the browser disagree about the markup and trip hydration. It
     stays false for one paint, which is correct — the file input works for
     everyone and the camera button is the addition. */
  const [nativeCamera, setNativeCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // The upload panel that drops from the camera: paste, drag-drop, or browse.
  const camRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  // Windows says Ctrl, macOS says Cmd. Showing the wrong one is a small lie in
  // the one place the panel is actually instructing the user.
  const [isMac, setIsMac] = useState(false);

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

  useEffect(() => {
    setMounted(true);
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
    setNativeCamera(hasNativeCamera());
  }, []);

  /* The panel is portalled to document.body and positioned from the button's
     own rect, rather than absolutely inside the search pill. The pill carries
     liquid-glass-card, so it has a backdrop-filter — which makes it a
     containing block for fixed descendants and a stacking context, and its
     rounded overflow would clip a dropdown hanging below it. Measuring is the
     way out of all three at once. */
  const placePanel = useCallback(() => {
    const b = camRef.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(PANEL_W, window.innerWidth - PANEL_MARGIN * 2);
    const centred = b.left + b.width / 2 - width / 2;
    const left = Math.max(PANEL_MARGIN, Math.min(centred, window.innerWidth - width - PANEL_MARGIN));
    setPanelPos({ top: b.bottom + 10, left, width });
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setDragOver(false);
    setPanelError(null);
  }, []);

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
      if (e.key !== "Escape") return;
      // Peel one layer. With the quote form open on top, Escape belongs to it
      // — calling reset() here would close the results underneath as well and
      // lose the search the user is still working through.
      if (inquiry) setInquiry(null);
      else reset();
    };
    // Counted, not saved and restored: the inquiry modal opens on top of this
    // panel and locks scrolling too, so two independent restores would fight
    // over which value goes back and could leave the page frozen.
    const unlock = lockBodyScroll();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, reset, inquiry]);

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

  /* One gate for all three routes in — paste, drop and browse. Checking here
     rather than in each handler means a 20MB TIFF is refused identically
     however it arrived, and the user is told which rule it broke instead of
     watching the panel open and fail. */
  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) {
        setPanelError("That did not contain an image.");
        return;
      }
      const looksRight = file.type
        ? ACCEPTED_TYPES.includes(file.type)
        : ACCEPTED_EXTS.test(file.name);
      if (!looksRight) {
        setPanelError("That file type will not work. Use a JPEG, PNG, WebP, AVIF, HEIC, GIF, TIFF or BMP.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setPanelError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`);
        return;
      }
      closePanel();
      void onPick(file);
    },
    [closePanel, onPick],
  );

  /* The fourth way in, and the only one that needs the app: photograph the
     thing you want sourced. Everything after the shutter is shared — the
     capture becomes a File and goes through acceptFile like a pasted or
     dropped one, so the size and type rules apply to it unchanged. */
  const takePhoto = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    setPanelError(null);
    try {
      acceptFile(await capturePhoto());
    } catch (err) {
      // Backing out of the camera is a decision, not a failure. Saying
      // anything here would put an error under a panel the user just chose to
      // leave.
      if (err instanceof CameraCancelled) return;
      setPanelError(
        "The camera would not open. Check the app's camera permission, or upload a photo instead.",
      );
    } finally {
      setCapturing(false);
    }
  }, [acceptFile, capturing]);

  // Back closes the results, then the upload panel, before it touches the page.
  useBackDismiss(open, reset);
  useBackDismiss(panelOpen, closePanel);

  // Ctrl/Cmd+V anywhere while the panel is open. Bound to the window rather
  // than to a focused input, because there is no text field here to paste into
  // and asking the user to click a box first would be a step for nothing.
  useEffect(() => {
    if (!panelOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) {
        setPanelError("There is no image on the clipboard. Copy an image first, then paste.");
        return;
      }
      e.preventDefault();
      acceptFile(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [panelOpen, acceptFile]);

  // Dismissal and re-anchoring. Scroll is captured so the panel also follows
  // when an inner scroller moves, not just the page.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || camRef.current?.contains(t)) return;
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [panelOpen, closePanel, placePanel]);

  const products = result?.products ?? [];
  const categories = result?.categories ?? [];

  const uploadPanel = !panelOpen || !panelPos ? null : (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Search by photo"
      style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
      className="fixed z-[210] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-12px_rgba(8,31,42,0.35)] motion-safe:animate-[fadeIn_140ms_ease-out]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-slate-900">
          Find products with a photo
        </h2>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={16} />
        </button>
      </div>

      {/* The drop target. onDragOver must preventDefault or the browser
          refuses the drop and navigates to the file instead. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-150",
          dragOver ? "border-[#27a8c4] bg-[#27a8c4]/[0.07]" : "border-slate-300 bg-slate-50/70",
        )}
      >
        {nativeCamera ? (
          <>
            <Camera size={26} className="mx-auto mb-2.5 text-[#176579]" aria-hidden="true" />

            <p className="text-[13px] font-semibold text-slate-800">Photograph the product</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-slate-600">
              Point the camera at a sample and we&rsquo;ll search the catalogue for
              what matches it.
            </p>

            <button
              type="button"
              onClick={() => void takePhoto()}
              disabled={capturing}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#27a8c4] to-[#176579] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(39,168,196,0.32)] transition-all duration-200 hover:shadow-[0_10px_22px_rgba(23,101,121,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
            >
              <Camera size={15} aria-hidden="true" />
              {capturing ? "Opening camera…" : "Take a photo"}
            </button>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mx-auto mt-3 block rounded text-[13px] font-semibold text-[#176579] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/50"
            >
              Choose an existing photo
            </button>
          </>
        ) : (
          <>
            <Upload
              size={26}
              className={cn("mx-auto mb-2.5 transition-colors", dragOver ? "text-[#176579]" : "text-slate-500")}
              aria-hidden="true"
            />

            <p className="text-[13px] text-slate-700">
              Paste an image with{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-700 shadow-sm">
                {isMac ? "⌘" : "Ctrl"}
              </kbd>{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-700 shadow-sm">
                V
              </kbd>
            </p>
            <p className="mt-1 text-[13px] text-slate-600">or drag and drop one here</p>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#27a8c4] to-[#176579] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(39,168,196,0.32)] transition-all duration-200 hover:shadow-[0_10px_22px_rgba(23,101,121,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/50 focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0"
            >
              Upload a file
            </button>
          </>
        )}
      </div>

      {panelError ? (
        <p role="alert" className="mt-3 text-[12px] font-semibold text-red-600">
          {panelError}
        </p>
      ) : (
        <p className="mt-3 text-center text-[11px] text-slate-500">
          JPEG, PNG, WebP, AVIF, HEIC, GIF, TIFF or BMP · up to 5MB
        </p>
      )}
    </div>
  );

  const dialog = !open ? null : (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search by photo results"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-[#081f2a]/50 p-4 backdrop-blur-md sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      {/* Glass panel: translucent white over the blurred page, a light top-left
          border to catch the light, and a soft ring so it reads as a raised
          surface rather than a flat sheet. */}
      <div className="my-auto flex max-h-[90svh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5">
        <div className="flex shrink-0 items-start gap-4 border-b border-slate-200 bg-slate-50/60 p-5">
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
            <p className="mt-0.5 text-sm text-slate-700">
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
              <p className="mt-1.5 text-xs text-slate-600">Matched on: {result.terms.join(", ")}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
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
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Categories to explore
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <Link
                        key={c.id}
                        href={`/products/?categoryId=${c.id}`}
                        onClick={reset}
                        className="group inline-flex items-baseline gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm shadow-sm transition-all hover:border-[#27a8c4] hover:bg-slate-50 hover:shadow"
                      >
                        {c.parentName ? (
                          <span className="text-xs text-slate-500 group-hover:text-slate-600">
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
              ) : null}

              {products.length >= 48 && result?.searchQuery ? (
                <p className="mt-6 text-center text-sm text-slate-600">
                  Showing the closest {products.length}.{" "}
                  <Link
                    href={`/products/?q=${encodeURIComponent(result.searchQuery)}`}
                    onClick={reset}
                    className="font-semibold text-[#176579] transition-colors hover:text-[#27a8c4] hover:underline"
                  >
                    See every match for &ldquo;{result.searchQuery}&rdquo;
                  </Link>
                </p>
              ) : null}

              {products.length ? null : (
                <div className="py-10 text-center">
                  <p className="mx-auto max-w-md text-sm text-slate-600">
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
          // Through the same gate as paste and drop, so an oversized or wrong
          // file is reported the same way however it was chosen. Clearing the
          // value afterwards matters: without it, picking the same file again
          // fires no change event and the panel appears to ignore the click.
          e.target.value = "";
          acceptFile(f);
        }}
      />

      {/* A bare icon between an input and a solid button reads as decoration,
          and this is a feature nobody knows to look for. A rule to separate it
          from the typing area, a filled target so it looks pressable, and a
          tooltip on hover or keyboard focus so the affordance is named. */}
      <span className={cn("relative flex shrink-0 items-center", className)}>
        <span className="mr-1.5 h-5 w-px bg-slate-200" aria-hidden="true" />

        {/* The tooltip is centred with left-1/2, so its positioning context has
            to be exactly the button. It used to be the outer span, which also
            holds the divider and its 6px margin — 43px wide against the
            button's 36px, putting the centre 3.5px to the left and visibly
            missing the arrow. Wrapping the button alone fixes it at any button
            size, where a hand-tuned offset would not.

            group/cam moves here too, so the hairline divider no longer
            triggers the tooltip. */}
        <span className="group/cam relative flex">
          <button
            ref={camRef}
            type="button"
            onClick={() => {
              if (panelOpen) return closePanel();
              placePanel();
              setPanelOpen(true);
            }}
            aria-label="Search by photo"
            aria-haspopup="dialog"
            aria-expanded={panelOpen}
          // Hover inverts to the same dark the tooltip uses, so the button and
          // the label read as one object rather than a pale chip with an
          // unrelated black box under it. focus-visible mirrors hover, so the
          // keyboard path gets the same state and not just a ring.
            className="inline-flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-all duration-200 hover:bg-[#081f2a] hover:text-white hover:shadow-[0_4px_14px_rgba(8,31,42,0.35)] focus-visible:bg-[#081f2a] focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1 motion-safe:hover:scale-105 motion-safe:active:scale-95 md:size-9"
          >
            <Camera size={16} className="md:size-[18px]" />
          </button>

          {/* Hidden from assistive tech: aria-label already names the button, so
              announcing this too would repeat it. */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-1/2 top-[calc(100%+12px)] z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#081f2a] px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover/cam:opacity-100 group-focus-within/cam:opacity-100",
              panelOpen && "!opacity-0",
            )}
          >
            Search by photo
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-[#081f2a]" />
          </span>
        </span>
      </span>

      {mounted && uploadPanel ? createPortal(uploadPanel, document.body) : null}

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

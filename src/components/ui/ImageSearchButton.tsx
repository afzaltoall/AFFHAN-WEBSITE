"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Camera, CameraOff, ImagePlus, Link2, Loader2, RefreshCw, Search, SwitchCamera, Upload, Video, X } from "lucide-react";
import { ProductCard } from "@/components/ui/ProductCard";
// Loaded on demand, not with the page.
//
// This button lives in the hero search bar, so a static import here reaches
// every homepage visit — and InquiryModal pulls in react-zoom-pan-pinch (52 KB)
// for its lightbox. That quietly defeated the dynamic({ ssr: false }) imports
// the three homepage sections already use for the same component: one static
// import anywhere in the tree is enough to put it back in the initial bundle.
const InquiryModal = dynamic(() => import("@/components/ui/InquiryModal").then((m) => m.InquiryModal), { ssr: false });
import { lockBodyScroll } from "@/lib/scrollLock";
import { useBackDismiss, overlayHandoff, overlayWillNavigate } from "@/lib/useBackDismiss";
import { capturePhoto, hasNativeCamera, CameraCancelled } from "@/lib/nativeCamera";
import { cn } from "@/lib/utils";
import "./image-search.css";

type Hit = { id: number; name: string; imageUrl: string | null; category: string | null };
/** `best`: the category the words name, rather than one the matches happen to sit in. */
type Cat = { id: string; name: string; parentName: string | null; total?: number; best?: boolean };
/** One product the photo holds, as /api/search/image found it: what to call it, what to search, where it is (0–1000). */
type Item = { label: string; query: string; terms: string[]; box: [number, number, number, number] | null };
/** What the catalogue has for one search. */
/** `failed`: the catalogue did not answer (an error, or no answer in time), which is not the same as finding nothing. */
type View = { query: string; products: Hit[]; categories: Cat[]; total: number; capped: boolean; loose: boolean; failed?: boolean };
/** `deferred`: the items only, asked for with phase=items; the products are this page's to fetch. */
type Reply = Partial<View> & { isProduct?: boolean; items?: Item[]; searchQuery?: string; message?: string; error?: string; deferred?: boolean };
type Phase = "camera" | "reading" | "results" | "none" | "error";

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

/** Products shown per search; the rest are a link away (the server sends the same number). */
const SHOWN = 24;

const fmt = (n: number) => n.toLocaleString("en-US");

/** Longest edge uploaded: what the vision step reads at (MAX_EDGE in lib/imageSearch). */
const UPLOAD_EDGE = 1024;

/**
 * The photo at the size the search reads it, drawn here before it is sent: a
 * phone's 4–12MB picture becomes ~150KB, which on a mobile connection was
 * most of the wait. Turned upright first (EXIF), on white (a cut-out PNG
 * would otherwise turn black), and the file name kept, since it can name
 * one of our own products. Anything the browser cannot draw (HEIC outside
 * Safari) goes as it is, and the server converts it.
 */
async function shrinkForUpload(file: File): Promise<File> {
  if (file.size < 300 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const emptyView = (query: string): View => ({ query, products: [], categories: [], total: 0, capped: false, loose: false });
/** A search the catalogue did not answer: said as such, with a way to ask again, never as "nothing like this". */
const failedView = (query: string): View => ({ ...emptyView(query), failed: true });

/**
 * How long the page waits. The photo's own answer comes in 2–3s (measured on
 * affhan.com, 2026-10-07), and the server gives up on the image service at
 * 12s; past these the request is stuck (a stalled upload, a server that never
 * answered), and the shopper is told so rather than left watching the sweep
 * (the owner's report of the same day: "the scanner sticks sometimes").
 */
const PHOTO_WAIT_MS = 25_000;
const PRODUCTS_WAIT_MS = 15_000;
/** When the photo is still being read after this, the page says it is taking longer than usual. */
const SLOW_READ_MS = 6_000;

/** Dispatched on window to open the photo panel from elsewhere: the search box's "Search with a photo" row. */
export const OPEN_PHOTO_SEARCH = "affhan:open-photo-search";

/** Why a file cannot be searched, or null when it can. One rule for every way in: paste, drop, browse, camera. */
function refuse(file: File): string | null {
  const looksRight = file.type ? ACCEPTED_TYPES.includes(file.type) : ACCEPTED_EXTS.test(file.name);
  if (!looksRight) return "That file type will not work. Use a JPEG, PNG, WebP, AVIF, HEIC, GIF, TIFF or BMP.";
  if (file.size > MAX_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.`;
  return null;
}

/**
 * The catalogue's search for some words, the way the photo results show it:
 * the same /api/products the results page reads, so an item picked from the
 * photo, or words typed into the box, find what they would anywhere else.
 */
async function fetchView(query: string): Promise<View> {
  const params = new URLSearchParams({ q: query, limit: String(SHOWN), page: "1", sortBy: "relevance", getChips: "true" });
  const res = await fetch(`/api/products/?${params}`, { signal: AbortSignal.timeout(PRODUCTS_WAIT_MS) });
  if (!res.ok) throw new Error(`products ${res.status}`);
  const j = (await res.json()) as {
    data?: { id: number; name: string; imageUrl: string | null; category: string | null; categoryRef?: { name: string | null } | null }[];
    facets?: { id: string; name: string; label?: string; parentName: string | null; count: number }[];
    search?: { primary?: { id: string; name: string; label?: string; total: number; path?: string[] }[]; loose?: boolean } | null;
    pagination?: { total?: number; totalCapped?: boolean };
  };
  const seen = new Set<string>();
  const categories: Cat[] = [];
  // One match in a category is a coincidence ("Brooches 1" for water shoes), and so is a
  // hundredth of the largest ("Furniture 3" beside 1,859 boots for "men shoes"): not a branch to offer.
  const floor = Math.max(2, 0.01 * Math.max(0, ...(j.facets ?? []).map((f) => f.count)));
  for (const c of [
    // As a chip says it ("Solid T-Shirts", not "Solid").
    ...(j.search?.primary ?? []).map((h) => ({ id: h.id, name: h.label ?? h.name, parentName: h.path?.[h.path.length - 1] ?? null, total: h.total, best: true })),
    ...(j.facets ?? []).filter((f) => f.count >= floor).map((f) => ({ id: f.id, name: f.label ?? f.name, parentName: f.parentName ?? null, total: f.count })),
  ]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    categories.push(c);
    if (categories.length >= 6) break;
  }
  const products = (j.data ?? []).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl ?? null, category: p.categoryRef?.name ?? p.category ?? null }));
  return { query, products, categories, total: j.pagination?.total ?? products.length, capped: !!j.pagination?.totalCapped, loose: !!j.search?.loose };
}

/** A search worth showing: it names a category, or finds plenty with every word. */
const strong = (v: View) => !v.loose && (v.categories.some((c) => c.best) || v.total >= 24);

/**
 * An item's products, the way the server finds the first one's
 * (searchItem in /api/search/image): its full words ("cream leather office
 * chair") and its plain name ("office chair"), the first worth showing.
 */
async function fetchItemView(item: Item): Promise<View> {
  const ladder = [...new Set([item.query, item.label].map((s) => s.trim().toLowerCase()).filter(Boolean))];
  // One of the two not answering leaves the other's answer, which is still worth showing.
  const settled = await Promise.allSettled(ladder.map((q) => fetchView(q)));
  const found = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (!found.length) throw new Error("the catalogue did not answer");
  return found.find(strong) ?? [...found].filter((v) => !v.loose).sort((a, b) => b.total - a.total)[0] ?? found[0];
}

/** A box's place on the stage: boxes are 0–1000 of the upright image, and the stage is exactly the image's size. */
const boxStyle = (b: NonNullable<Item["box"]>) => ({
  top: `${b[0] / 10}%`,
  left: `${b[1] / 10}%`,
  height: `${(b[2] - b[0]) / 10}%`,
  width: `${(b[3] - b[1]) / 10}%`,
});
const boxArea = (b: Item["box"]) => (b ? (b[2] - b[0]) * (b[3] - b[1]) : 0);

/**
 * Where each label sits, in pixels of the stage: the first of six spots by
 * its box (inside its top corner, over it, inside its foot, under it, then
 * the right-hand corners) that no label placed before it overlaps. The
 * smallest box is placed first, so the tightest gets the spot in its own
 * corner, and the order does not depend on which item is chosen: labels
 * stay where they are as the choice moves.
 *
 * When there is not room for every label apart (a phone's small photo, four
 * things close together), the chosen one's goes first and any that would
 * cover another is left off (null); its item is still on its box and in the
 * chips above.
 */
function placeTags(items: Item[], stage: HTMLElement, tags: (HTMLElement | null)[], active: number): ({ x: number; y: number } | null)[] {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (!W || !H) return items.map(() => null);
  const run = (order: number[], strict: boolean) => {
    const spots: ({ x: number; y: number } | null)[] = items.map(() => null);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    let clashes = 0;
    for (const i of order) {
      const b = items[i].box;
      const el = tags[i];
      if (!b || !el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const top = (b[0] / 1000) * H;
      const left = (b[1] / 1000) * W;
      const bottom = (b[2] / 1000) * H;
      const right = (b[3] / 1000) * W;
      const fit = (x: number, y: number) => ({ x: Math.min(Math.max(x, 4), Math.max(4, W - w - 4)), y: Math.min(Math.max(y, 4), Math.max(4, H - h - 4)) });
      const spotsToTry = [
        fit(left + 6, top + 6),
        fit(left, top - h - 5),
        fit(left + 6, bottom - h - 6),
        fit(left, bottom + 5),
        fit(right - w - 6, top + 6),
        fit(right - w - 6, bottom - h - 6),
      ];
      const clash = (c: { x: number; y: number }) =>
        placed.reduce((sum, r) => sum + Math.max(0, Math.min(c.x + w + 3, r.x + r.w) - Math.max(c.x - 3, r.x)) * Math.max(0, Math.min(c.y + h + 3, r.y + r.h) - Math.max(c.y - 3, r.y)), 0);
      let best = spotsToTry[0];
      let least = Infinity;
      for (const c of spotsToTry) {
        const o = clash(c);
        if (o < least) {
          best = c;
          least = o;
        }
        if (o === 0) break;
      }
      if (least > 0) {
        clashes++;
        if (strict && i !== active) continue;
      }
      placed.push({ ...best, w, h });
      spots[i] = best;
    }
    return { spots, clashes };
  };
  const bySize = items
    .map((it, i) => ({ i, area: boxArea(it.box) }))
    .sort((a, b) => a.area - b.area)
    .map((o) => o.i);
  const steady = run(bySize, false);
  if (!steady.clashes) return steady.spots;
  return run([active, ...bySize.filter((i) => i !== active)], true).spots;
}

/**
 * The shopper's photo, as the stage: a sweep down it while it is read, then
 * each product found outlined where it is, the one being searched lit and
 * the rest of the picture dimmed.
 *
 * Every box can be pressed, a box inside another included (a shirt under a
 * blazer, a microphone in a hand, the owner's photo of 2026-10-06): bigger
 * boxes sit under smaller ones, so a press lands on the smallest box under
 * it, and the dimming is a layer of its own that takes no presses. Each box's
 * label is set where no other label is (placeTags), measured, so labels never
 * pile up, and pressing a label chooses its item too.
 */
function PhotoStage({ src, items, active, scanning, onSelect }: { src: string; items: Item[]; active: number; scanning: boolean; onSelect: (i: number) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [spots, setSpots] = useState<({ x: number; y: number } | null)[]>([]);
  const boxed = !scanning && items.some((it) => it.box);

  // Placed before the browser paints, and again whenever the stage or a label changes size (or, short of room, the choice).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!boxed || !stage) return;
    const place = () => setSpots(placeTags(items, stage, tagRefs.current, active));
    place();
    const watch = new ResizeObserver(place);
    watch.observe(stage);
    tagRefs.current.forEach((t) => t && watch.observe(t));
    return () => watch.disconnect();
  }, [items, boxed, active]);

  // How many boxes are bigger than each: its place in the stack, the smallest on top.
  const areas = items.map((it) => boxArea(it.box));
  const lit = items[active]?.box;

  return (
    <div ref={stageRef} className="isx-stage">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: or remote URL, nothing for next/image to optimise */}
      <img src={src} alt="Your photo" className="max-h-[28svh] w-auto md:max-h-[62svh]" />
      {scanning ? (
        <div className="isx-layer isx-scan" aria-hidden="true">
          <span className="isx-corner" data-c="tl" />
          <span className="isx-corner" data-c="tr" />
          <span className="isx-corner" data-c="bl" />
          <span className="isx-corner" data-c="br" />
        </div>
      ) : boxed ? (
        <div className="isx-layer">
          {items.map((it, i) =>
            it.box ? (
              <button
                key={`${it.query}-${i}`}
                type="button"
                className="isx-box"
                data-active={i === active}
                aria-pressed={i === active}
                aria-label={`Search for ${it.label}`}
                onClick={() => onSelect(i)}
                style={{ ...boxStyle(it.box), zIndex: 1 + areas.filter((a) => a > areas[i]).length, animationDelay: `${i * 90}ms` }}
              />
            ) : null,
          )}
          {lit && <span aria-hidden="true" className="isx-dim" style={boxStyle(lit)} />}
          {items.map((it, i) =>
            it.box ? (
              <button
                key={`tag-${it.query}-${i}`}
                ref={(el) => {
                  tagRefs.current[i] = el;
                }}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="isx-tag"
                data-active={i === active}
                data-placed={spots[i] ? "" : undefined}
                onClick={() => onSelect(i)}
                style={{ ...(spots[i] ? { left: spots[i]!.x, top: spots[i]!.y } : null), animationDelay: `${i * 90 + 120}ms` }}
              >
                {it.label}
              </button>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Why the camera did not open, in words a shopper can act on. Browsers name
 * the reason (a DOMException's name), and Chrome adds "by system" when the
 * computer's own privacy settings, not the site, are what refused.
 */
function cameraTrouble(e: unknown): string {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return /system/i.test(message)
      ? "Your computer's privacy settings are keeping the browser from the camera. On Windows: Settings › Privacy & security › Camera, and let your browser use it. On a Mac: System Settings › Privacy & Security › Camera."
      : "The camera is blocked for this site. Allow it from the camera icon in the address bar, or in this site's settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "No camera was found on this computer.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "The camera is busy in another app, such as a video call. Close it, then try again.";
  if (name === "SecurityError") return "The camera opens only on a secure (https) page.";
  return "The camera could not be opened.";
}

/**
 * A camera in the page, for a computer: hold the thing up to the webcam and
 * press the shutter. Phones get their own camera app instead (the capture
 * input), which takes a far better picture than a video frame.
 *
 * When it cannot open, it says why, in words that say what to do (the
 * owner's report, 2026-10-06: "declined", on a laptop whose camera nobody
 * had refused; the site's own Permissions-Policy had banned it, next.config),
 * and offers to try again or to upload a photo. The shutter shows only for a
 * camera that is on.
 */
function WebcamView({ onCapture, onUpload }: { onCapture: (file: File) => void; onUpload: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [canFlip, setCanFlip] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Each "Try again" asks the browser afresh. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let stream: MediaStream | null = null;
    setReady(false);
    setError(null);
    const open = async () => {
      const wanted: MediaStreamConstraints = { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
      try {
        return await navigator.mediaDevices.getUserMedia(wanted);
      } catch (e) {
        // A camera that cannot do what was hoped for still does a picture.
        if (e instanceof DOMException && e.name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        throw e;
      }
    };
    open()
      .then(async (s) => {
        if (!live) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        // A laptop's camera faces the user, and a mirror is what people expect to see.
        setMirrored(s.getVideoTracks()[0]?.getSettings().facingMode !== "environment");
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => {});
        }
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (live) setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
      })
      .catch((e: unknown) => {
        if (live) setError(cameraTrouble(e));
      });
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, attempt]);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && onCapture(new File([b], "webcam.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92);
  };

  return (
    <div className="flex w-full flex-col bg-[#0b1f29]">
      <div className="relative flex min-h-[46svh] flex-1 items-center justify-center overflow-hidden md:min-h-[60svh]">
        <video ref={videoRef} playsInline muted className={cn("h-full max-h-[70svh] w-full object-contain", mirrored && "-scale-x-100", error && "invisible")} />
        {ready && (
          <div className="isx-layer" aria-hidden="true">
            <span className="isx-corner" data-c="tl" />
            <span className="isx-corner" data-c="tr" />
            <span className="isx-corner" data-c="bl" />
            <span className="isx-corner" data-c="br" />
          </div>
        )}
        {!ready && !error && <Loader2 size={28} className="absolute animate-spin text-white/70" />}
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-white/10 text-white/80">
              <CameraOff size={24} aria-hidden />
            </span>
            <p className="max-w-md text-[14.5px] leading-relaxed text-white/85">{error}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-[#0b2a36] transition hover:bg-white/90"
              >
                <RefreshCw size={15} aria-hidden /> Try again
              </button>
              <button
                type="button"
                onClick={onUpload}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-[13px] font-bold text-white ring-1 ring-white/25 transition hover:bg-white/20"
              >
                <Upload size={15} aria-hidden /> Upload a photo
              </button>
            </div>
          </div>
        )}
      </div>
      {!error && (
        <>
          <div className="flex items-center justify-center gap-6 px-4 py-4">
            <span className="w-11" />
            <button
              type="button"
              onClick={snap}
              disabled={!ready}
              aria-label="Take the photo"
              className="grid size-16 place-items-center rounded-full border-4 border-white/90 bg-white/15 transition hover:bg-white/25 disabled:opacity-40"
            >
              <span className="size-11 rounded-full bg-white" />
            </button>
            {canFlip ? (
              <button
                type="button"
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                aria-label="Switch camera"
                className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <SwitchCamera size={18} />
              </button>
            ) : (
              <span className="w-11" />
            )}
          </div>
          <p className="pb-4 text-center text-[12px] text-white/60">Hold the product up to the camera, filling the frame.</p>
        </>
      )}
    </div>
  );
}

/**
 * Search the catalogue by photograph, the way a shopper would point at a
 * thing: a product shot, a screenshot, a photo of someone wearing it.
 *
 * Posts the file to /api/search/image, which finds every product in the
 * photo and where it is, and searches the catalogue for the first. The page
 * draws them on the photo; tapping one, or a chip, searches that one instead,
 * and the words can be edited ("red football jersey" → "… for kids"). Every
 * product shown is a real row: the model never sees product data and never
 * produces any.
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
export function ImageSearchButton({ className, onOpen }: { className?: string; /** Called as the photo panel opens: the search box closes its own dropdown, so the two never stack. */ onOpen?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("reading");
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [describe, setDescribe] = useState("");
  const [dropping, setDropping] = useState(false);
  const [inquiry, setInquiry] = useState<Hit | null>(null);
  /** Searches already made for this photo, by their words. */
  const views = useRef(new Map<string, View>());
  /** Each item's products, by its place in the list: being found, and found. */
  const itemViews = useRef(new Map<number, Promise<View>>());
  const itemFound = useRef(new Map<number, View>());
  /** The last photo sent, for "Try again". */
  const lastInput = useRef<{ file: File | null; url?: string } | null>(null);
  const [retryable, setRetryable] = useState(false);
  // The photo has been reading for longer than usual (SLOW_READ_MS): the page says so.
  const [slowRead, setSlowRead] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guards against an older answer landing after a newer request. */
  const pickSeq = useRef(0);
  const viewSeq = useRef(0);

  /* Whether a real camera can be opened, which is true only inside the Android
     app. Resolved in an effect rather than during render because the Capacitor
     bridge is a client-side global: reading it while rendering would make the
     server and the browser disagree about the markup and trip hydration. It
     stays false for one paint, which is correct — the file input works for
     everyone and the camera button is the addition. */
  const [nativeCamera, setNativeCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);
  /** A touch-first device: its own camera app and photo library, not paste and drag. */
  const [touch, setTouch] = useState(false);
  /** A computer with a camera the page may ask for. */
  const [webcam, setWebcam] = useState(false);

  // The upload panel that drops from the camera: paste, drag-drop, or browse.
  const camRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [link, setLink] = useState("");
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
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);
    setWebcam(!coarse && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

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

  // The search box's own dropdown goes first, every way the panel opens.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  const openPanel = useCallback(() => {
    onOpenRef.current?.();
    placePanel();
    setPanelOpen(true);
  }, [placePanel]);

  // "Search with a photo" in the search box's dropdown (SearchAssist) opens
  // this panel from there.
  useEffect(() => {
    const on = () => openPanel();
    window.addEventListener(OPEN_PHOTO_SEARCH, on);
    return () => window.removeEventListener(OPEN_PHOTO_SEARCH, on);
  }, [openPanel]);

  const reset = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    pickSeq.current++;
    viewSeq.current++;
    views.current.clear();
    itemViews.current.clear();
    itemFound.current.clear();
    setPreview(null);
    setItems([]);
    setActive(0);
    setQuery("");
    setView(null);
    setViewLoading(false);
    setMessage(null);
    setDescribe("");
    setDropping(false);
    setInquiry(null);
    setPhase("reading");
    if (slowTimer.current) clearTimeout(slowTimer.current);
    setSlowRead(false);
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

  // Into the dialog when it opens, so the keyboard is where the eyes are.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  /** Shows the catalogue's answer for some words, from this photo's searches if already made. */
  const showQuery = useCallback(async (words: string) => {
    const text = words.trim();
    if (!text) return;
    const seq = ++viewSeq.current;
    const cached = views.current.get(text.toLowerCase());
    if (cached) {
      setView(cached);
      setViewLoading(false);
      return;
    }
    setViewLoading(true);
    try {
      const v = await fetchView(text);
      views.current.set(text.toLowerCase(), v);
      if (seq === viewSeq.current) setView(v);
    } catch {
      if (seq === viewSeq.current) setView(failedView(text));
    } finally {
      if (seq === viewSeq.current) setViewLoading(false);
    }
  }, []);

  const onPick = useCallback(async (file: File | null, sourceUrl?: string) => {
    const seq = ++pickSeq.current;
    lastInput.current = { file, url: sourceUrl };
    setRetryable(true);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    if (file) {
      const url = URL.createObjectURL(file);
      previewUrl.current = url;
      setPreview(url);
    } else {
      setPreview(sourceUrl ?? null);
    }
    viewSeq.current++;
    views.current.clear();
    itemViews.current.clear();
    itemFound.current.clear();
    setItems([]);
    setActive(0);
    setQuery("");
    setView(null);
    setViewLoading(false);
    setMessage(null);
    setDescribe("");
    setOpen(true);
    setPhase("reading");
    setSlowRead(false);
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => {
      if (seq === pickSeq.current) setSlowRead(true);
    }, SLOW_READ_MS);

    try {
      const body = new FormData();
      if (file) {
        const sent = await shrinkForUpload(file);
        if (seq !== pickSeq.current) return;
        body.append("image", sent);
        if (file.name) body.append("fileName", file.name);
      }
      if (sourceUrl) body.append("sourceUrl", sourceUrl);
      body.append("phase", "items");
      // Never longer than PHOTO_WAIT_MS: a request that has not answered by then is stuck, not slow.
      const res = await fetch("/api/search/image/", { method: "POST", body, signal: AbortSignal.timeout(PHOTO_WAIT_MS) });
      // A gateway's own error page (504 at the server's time limit) is not JSON: said as what it was.
      const data: Reply = await res.json().catch(() => ({ error: res.status === 504 ? "That took too long. Try again in a moment." : "Something went wrong." }));
      if (seq !== pickSeq.current) return;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      if (!res.ok || data.error) {
        setMessage(data.error ?? "Something went wrong.");
        setPhase("error");
        return;
      }
      if (data.isProduct === false || !data.items?.length) {
        setMessage(data.message ?? null);
        setPhase("none");
        return;
      }
      if (data.deferred) {
        // What the photo holds, drawn at once; its products follow, the first
        // item's straight away and the others' once those are in.
        const found = data.items;
        setItems(found);
        setActive(0);
        setQuery(found[0].query);
        setView(null);
        setViewLoading(true);
        setPhase("results");
        const v0 = ++viewSeq.current;
        const load = (i: number) => {
          // Already asked for (the shopper tapped it first): the same answer, not a second request.
          const pending = itemViews.current.get(i) ?? fetchItemView(found[i]).catch(() => failedView(found[i].query));
          itemViews.current.set(i, pending);
          return pending.then((v) => {
            if (seq !== pickSeq.current) return;
            itemFound.current.set(i, v);
            if (i === 0 && v0 === viewSeq.current) {
              setView(v);
              setQuery(v.query);
              setViewLoading(false);
            }
          });
        };
        void load(0).then(() => found.slice(1).forEach((_, k) => void load(k + 1)));
        return;
      }
      const words = data.query ?? data.searchQuery ?? data.items[0].query;
      const first: View = {
        query: words,
        products: data.products ?? [],
        categories: data.categories ?? [],
        total: data.total ?? data.products?.length ?? 0,
        capped: !!data.capped,
        loose: !!data.loose,
      };
      views.current.set(words.toLowerCase(), first);
      itemViews.current.set(0, Promise.resolve(first));
      itemFound.current.set(0, first);
      setItems(data.items);
      setActive(0);
      setQuery(words);
      setView(first);
      setPhase("results");
      // The other things in the photo, ready before they are tapped.
      data.items.slice(1).forEach((it, k) => {
        const i = k + 1;
        const pending = fetchItemView(it).catch(() => failedView(it.query));
        itemViews.current.set(i, pending);
        void pending.then((v) => seq === pickSeq.current && itemFound.current.set(i, v));
      });
    } catch (err) {
      if (seq !== pickSeq.current) return;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      const name = err instanceof DOMException || err instanceof Error ? err.name : "";
      setMessage(
        name === "TimeoutError" || name === "AbortError"
          ? "That took too long, so we stopped waiting. Try again in a moment."
          : "Could not reach the server. Check your connection and try again.",
      );
      setPhase("error");
    }
  }, []);

  /* One gate for every route in — paste, drop, browse, camera, link. Checking
     here rather than in each handler means a 20MB TIFF is refused identically
     however it arrived, and the user is told which rule it broke instead of
     watching the dialog open and fail. */
  const acceptFile = useCallback(
    (file: File | null | undefined, sourceUrl?: string) => {
      if (!file && !sourceUrl) {
        setPanelError("That did not contain an image.");
        return;
      }
      const why = file ? refuse(file) : null;
      if (why) {
        if (panelOpenRef.current) setPanelError(why);
        else {
          setMessage(why);
          setPhase("error");
        }
        return;
      }
      // The panel is closing because the results are opening. Without this the
      // panel's history pop arrives after the dialog has pushed its own entry
      // and closes it on the spot — the photo is taken and nothing appears.
      if (panelOpenRef.current) {
        overlayHandoff();
        closePanel();
      }
      void onPick(file || null, sourceUrl);
    },
    [closePanel, onPick],
  );

  /* The Android app's camera: photograph the thing you want sourced.
     Everything after the shutter is shared — the capture becomes a File and
     goes through acceptFile like a pasted or dropped one, so the size and
     type rules apply to it unchanged. */
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
      setPanelError("The camera would not open. Check the app's camera permission, or upload a photo instead.");
    } finally {
      setCapturing(false);
    }
  }, [acceptFile, capturing]);

  /** A camera for this device: the app's, the phone's own camera app, or the webcam in the page. */
  const openCamera = useCallback(() => {
    if (nativeCamera) return void takePhoto();
    if (touch || !webcam) return cameraInputRef.current?.click();
    if (panelOpenRef.current) {
      overlayHandoff();
      closePanel();
    }
    pickSeq.current++;
    setPreview(null);
    setOpen(true);
    setPhase("camera");
  }, [closePanel, nativeCamera, takePhoto, touch, webcam]);

  /** Another photo, from wherever this device takes them. */
  const anotherPhoto = useCallback(() => inputRef.current?.click(), []);

  const selectItem = useCallback(
    (i: number) => {
      const it = items[i];
      if (!it) return;
      setActive(i);
      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      const seq = ++viewSeq.current;
      const done = itemFound.current.get(i);
      if (done) {
        setView(done);
        setQuery(done.query);
        setViewLoading(false);
        return;
      }
      setQuery(it.query);
      setViewLoading(true);
      let pending = itemViews.current.get(i);
      if (!pending) {
        pending = fetchItemView(it).catch(() => failedView(it.query));
        itemViews.current.set(i, pending);
      }
      void pending.then((v) => {
        itemFound.current.set(i, v);
        if (seq !== viewSeq.current) return;
        setView(v);
        setQuery(v.query);
        setViewLoading(false);
      });
    },
    [items],
  );

  /** Asks the catalogue again for products that did not load: the item's own search, or the words typed. */
  const retryView = useCallback(() => {
    if (!view) return;
    const words = view.query.trim().toLowerCase();
    const it = items[active];
    if (it && [it.query, it.label].some((s) => s.trim().toLowerCase() === words)) {
      itemViews.current.delete(active);
      itemFound.current.delete(active);
      selectItem(active);
    } else {
      views.current.delete(words);
      void showQuery(view.query);
    }
  }, [view, items, active, selectItem, showQuery]);

  const refine = (e: FormEvent) => {
    e.preventDefault();
    void showQuery(query);
  };

  /** No product found: the words instead, searched the same way. */
  const searchDescribed = (e: FormEvent) => {
    e.preventDefault();
    const text = describe.trim();
    if (!text) return;
    setItems([]);
    setQuery(text);
    setPhase("results");
    void showQuery(text);
  };

  // Back closes the results, then the upload panel, before it touches the page.
  useBackDismiss(open, reset);
  useBackDismiss(panelOpen, closePanel);

  /* Closing the dialog on the way to another page.
     reset() alone pops the dialog's history entry, and that pop cancels the
     <Link> navigation that triggered it — Next routes asynchronously, so the
     pop lands first. Every link out of the results was dead because of it. */
  const navigateAway = useCallback(() => {
    overlayWillNavigate();
    reset();
  }, [reset]);

  // Ctrl/Cmd+V: into the panel while it is open, and into the dialog too, so
  // one image after another can be searched without closing anything. Bound
  // to the window because there is no text field to paste into.
  useEffect(() => {
    if (!panelOpen && !(open && phase !== "camera")) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      let sourceUrl = "";
      const html = e.clipboardData?.getData("text/html") || "";
      const text = e.clipboardData?.getData("text/plain") || "";
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) sourceUrl = imgMatch[1];
      else if (/^https?:\/\/\S+$/i.test(text.trim())) sourceUrl = text.trim();
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item && !sourceUrl) {
        if (panelOpenRef.current) setPanelError("There is no image on the clipboard. Copy an image first, then paste.");
        return;
      }
      e.preventDefault();
      acceptFile(item?.getAsFile() ?? null, sourceUrl || undefined);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [panelOpen, open, phase, acceptFile]);

  // A picture pasted into the search box this button sits in is searched as a
  // photo, the way a search engine takes one; text pastes in as text. Only
  // while neither the panel nor the dialog is open: they take pastes above.
  useEffect(() => {
    if (panelOpen || open) return;
    const onPaste = (e: ClipboardEvent) => {
      const form = camRef.current?.closest("form");
      if (!form || !(e.target instanceof Node) || !form.contains(e.target)) return;
      const file = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      onOpenRef.current?.();
      acceptFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [panelOpen, open, acceptFile]);

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

  /** An image dropped from the desktop, or dragged from another page (its file, or its address). */
  const takeDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    let sourceUrl = "";
    const uri = e.dataTransfer.getData("text/uri-list");
    const html = e.dataTransfer.getData("text/html");
    if (uri) sourceUrl = uri.split("\n")[0].trim();
    else if (html) {
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) sourceUrl = m[1];
    }
    let file = e.dataTransfer.files?.[0];
    if (!file && sourceUrl) {
      try {
        const res = await fetch(sourceUrl);
        if (res.ok) {
          const blob = await res.blob();
          const cleanName = sourceUrl.split("/").pop()?.split("?")[0] || "product.jpg";
          file = new File([blob], cleanName, { type: blob.type || "image/jpeg" });
        }
      } catch {
        // Fetching it here failed (CORS, most likely): the server fetches the address instead.
      }
    }
    acceptFile(file, sourceUrl || undefined);
  };

  const submitLink = (e: FormEvent) => {
    e.preventDefault();
    const url = link.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setPanelError("Paste a full image link, starting with http:// or https://.");
      return;
    }
    setLink("");
    acceptFile(null, url);
  };

  const hint = (
    <p className="mt-3 text-center text-[11.5px] leading-relaxed text-slate-500">
      Works best with the item in view: a product shot, a screenshot, or someone wearing or holding it.
    </p>
  );

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
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-slate-900">Find products with a photo</h2>
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={16} />
        </button>
      </div>

      {touch || nativeCamera ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={openCamera}
            disabled={capturing}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#27a8c4] to-[#176579] text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(39,168,196,0.32)] disabled:opacity-60"
          >
            <Camera size={17} aria-hidden="true" />
            {capturing ? "Opening camera…" : "Take a photo"}
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
          >
            <ImagePlus size={17} aria-hidden="true" />
            Choose from your photos
          </button>
        </div>
      ) : (
        <>
          {/* The drop target. onDragOver must preventDefault or the browser
              refuses the drop and navigates to the file instead. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              setDragOver(false);
              void takeDrop(e);
            }}
            className={cn(
              "rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors duration-150",
              dragOver ? "border-[#27a8c4] bg-[#27a8c4]/[0.07]" : "border-slate-300 bg-slate-50/70",
            )}
          >
            <Upload size={24} className={cn("mx-auto mb-2 transition-colors", dragOver ? "text-[#176579]" : "text-slate-500")} aria-hidden="true" />
            <p className="text-[13px] text-slate-700">
              Drop an image here, or paste it with{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-700 shadow-sm">{isMac ? "⌘" : "Ctrl"}</kbd>{" "}
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-slate-700 shadow-sm">V</kbd>
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#27a8c4] to-[#176579] px-4 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(39,168,196,0.32)] transition-all duration-200 hover:shadow-[0_10px_22px_rgba(23,101,121,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/50 focus-visible:ring-offset-2"
              >
                <ImagePlus size={15} aria-hidden="true" />
                Upload a photo
              </button>
              {webcam && (
                <button
                  type="button"
                  onClick={openCamera}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:border-[#27a8c4] hover:text-[#176579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/50"
                >
                  <Video size={15} aria-hidden="true" />
                  Use your webcam
                </button>
              )}
            </div>
          </div>
          <form onSubmit={submitLink} className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 focus-within:border-[#27a8c4] focus-within:ring-2 focus-within:ring-[#27a8c4]/20">
            <Link2 size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Or paste an image link"
              aria-label="Image link"
              className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-500"
            />
            {link.trim() && (
              <button type="submit" className="rounded-lg bg-[#176579] px-3 py-1.5 text-[12px] font-bold text-white">
                Search
              </button>
            )}
          </form>
        </>
      )}

      {panelError ? (
        <p role="alert" className="mt-3 text-[12px] font-semibold text-red-600">
          {panelError}
        </p>
      ) : (
        hint
      )}
    </div>
  );

  const countLine = (v: View) =>
    v.loose
      ? "Close matches: nothing listed has every word"
      : v.total > 0
        ? `${v.capped ? `${fmt(v.total)}+` : fmt(v.total)} ${v.total === 1 ? "product" : "products"} like this`
        : "Nothing listed like this yet";

  const results = view && (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {view.categories.map((c) => (
          <Link
            key={c.id}
            href={`/products/?categoryId=${c.id}`}
            onClick={navigateAway}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              c.best ? "border-[#27a8c4]/50 bg-[#27a8c4]/[0.07] text-[#176579] hover:border-[#176579]" : "border-slate-200 bg-white text-slate-700 hover:border-[#27a8c4]/60 hover:text-[#176579]",
            )}
          >
            {c.best && <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#176579]/80">Best match</span>}
            {c.name}
            {c.total ? <span className="font-medium text-slate-400">{fmt(c.total)}</span> : null}
          </Link>
        ))}
      </div>

      {(!view.failed || viewLoading) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold tabular-nums text-slate-800">{view.failed ? "" : countLine(view)}</p>
          {viewLoading && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#176579]">
              <Loader2 size={13} className="animate-spin" /> Searching…
            </span>
          )}
        </div>
      )}

      {view.failed && !viewLoading ? (
        <div role="alert" className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-5 py-7 text-center">
          <p className="text-sm font-semibold text-slate-800">These products didn&rsquo;t load</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">The catalogue didn&rsquo;t answer just now. Your photo is still here.</p>
          <button
            type="button"
            onClick={retryView}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#176579] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#1b7389]"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : view.failed ? (
        <div aria-hidden="true" className="mt-3 h-44 animate-pulse rounded-2xl bg-slate-100" />
      ) : view.products.length ? (
        <div
          className={cn("mt-3 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3", viewLoading && "opacity-50")}
          // A card's picture and name link to the product's page (ProductCard): the
          // dialog closes on the way, as for every link out of the results
          // (navigateAway), or the page opened behind it and the press looked
          // dead (the owner's report, 2026-10-06). "Inquire Now" is a button,
          // and opens the quote form over the dialog.
          onClickCapture={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (e.target instanceof Element && e.target.closest("a[href]")) navigateAway();
          }}
        >
          {view.products.map((p) => (
            <ProductCard key={p.id} product={p} onClick={() => setInquiry(p)} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
          <p className="mx-auto max-w-sm text-sm text-slate-600">
            The catalogue is a guide to what we can source, not stock we hold: we can find who makes it.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {view.total > view.products.length ? (
          <Link
            href={`/products/?q=${encodeURIComponent(view.query)}`}
            onClick={navigateAway}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] hover:text-[#27a8c4]"
          >
            See all {view.capped ? `${fmt(view.total)}+` : fmt(view.total)} results <ArrowRight size={15} />
          </Link>
        ) : (
          <span />
        )}
        <Link
          href={`/contact/?message=${encodeURIComponent(`I'm looking for: ${view.query} (found with a photo search)`)}`}
          onClick={navigateAway}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#081f2a] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#176579]"
        >
          Request a quote for this <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );

  const skeletonGrid = (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="aspect-square animate-pulse bg-slate-100" />
          <div className="space-y-2 p-3">
            <div className="h-3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );

  const body =
    phase === "reading" ? (
      <div aria-live="polite">
        <p className="text-lg font-bold tracking-[-0.01em] text-slate-900">{slowRead ? "Still looking at your photo" : "Looking for products in your photo"}</p>
        <p className="mt-1 text-sm text-slate-600">
          {slowRead ? "This one is taking longer than usual. It is still working, and will tell you if it can't finish." : "Spotting each item, then matching it across 10 lakh+ products."}
        </p>
        <div className="mt-5 flex gap-2" aria-hidden="true">
          {[96, 120, 84].map((w) => (
            <span key={w} className="h-8 animate-pulse rounded-full bg-slate-100" style={{ width: w }} />
          ))}
        </div>
        {skeletonGrid}
      </div>
    ) : phase === "results" ? (
      <div>
        {items.length > 0 && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {items.length > 1 ? `${items.length} things in your photo` : "In your photo"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {items.map((it, i) => (
                <button
                  key={`${it.query}-${i}`}
                  type="button"
                  onClick={() => selectItem(i)}
                  aria-pressed={i === active}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                    i === active ? "border-[#176579] bg-[#176579] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#27a8c4]/60 hover:text-[#176579]",
                  )}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>
        )}
        <form onSubmit={refine} className={items.length ? "mt-4" : ""}>
          <label htmlFor="isx-query" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Searching for
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 focus-within:border-[#27a8c4] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#27a8c4]/20">
            <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              id="isx-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
            />
            {query.trim() && query.trim().toLowerCase() !== view?.query.toLowerCase() && (
              <button type="submit" className="rounded-lg bg-[#176579] px-3 py-1.5 text-[12px] font-bold text-white">
                Search
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-slate-500">Add a detail to narrow it: a colour, a material, &ldquo;for kids&rdquo;.</p>
        </form>
        {results || (viewLoading ? skeletonGrid : null)}
      </div>
    ) : phase === "none" ? (
      <div>
        <p className="text-lg font-bold tracking-[-0.01em] text-slate-900">We couldn&rsquo;t spot a product here</p>
        <p className="mt-1 text-sm text-slate-600">
          It works best with the item in view: a product shot, a screenshot, or someone wearing or holding it.
        </p>
        <button
          type="button"
          onClick={anotherPhoto}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#27a8c4] to-[#176579] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(39,168,196,0.32)]"
        >
          <ImagePlus size={15} /> Try another photo
        </button>
        <form onSubmit={searchDescribed} className="mt-6">
          <label htmlFor="isx-describe" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Or describe what you&rsquo;re looking for
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#27a8c4] focus-within:ring-2 focus-within:ring-[#27a8c4]/20">
            <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              id="isx-describe"
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder="e.g. red football jersey"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
            />
            {describe.trim() && (
              <button type="submit" className="rounded-lg bg-[#176579] px-3 py-1.5 text-[12px] font-bold text-white">
                Search
              </button>
            )}
          </div>
        </form>
        <Link href="/contact/" onClick={navigateAway} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#176579] hover:text-[#27a8c4]">
          Or send it to our sourcing team <ArrowRight size={15} />
        </Link>
      </div>
    ) : phase === "error" ? (
      <div role="alert">
        <p className="text-lg font-bold tracking-[-0.01em] text-slate-900">That didn&rsquo;t work</p>
        <p className="mt-1 text-sm text-slate-600">{message ?? "Something went wrong."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {retryable && (
            <button
              type="button"
              onClick={() => lastInput.current && void onPick(lastInput.current.file, lastInput.current.url)}
              className="inline-flex items-center gap-2 rounded-full bg-[#176579] px-5 py-2.5 text-[13px] font-bold text-white"
            >
              <RefreshCw size={15} /> Try again
            </button>
          )}
          <button
            type="button"
            onClick={anotherPhoto}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-[13px] font-semibold text-slate-700"
          >
            <ImagePlus size={15} /> Try another photo
          </button>
        </div>
      </div>
    ) : null;

  const dialog = !open ? null : (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search by photo"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#081f2a]/55 p-3 backdrop-blur-md sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) reset();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[94svh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.5)] outline-none ring-1 ring-slate-900/5 md:max-h-[88svh] md:flex-row"
        onDragOver={(e) => {
          if (phase === "camera") return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          // Leaving for a child is not leaving.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (phase === "camera") return;
          setDropping(false);
          void takeDrop(e);
        }}
      >
        <button
          type="button"
          onClick={reset}
          aria-label="Close"
          className="absolute right-3 top-3 z-30 grid size-9 place-items-center rounded-full bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-900/10 transition-colors hover:bg-white hover:text-slate-900"
        >
          <X size={18} />
        </button>

        {phase === "camera" ? (
          <WebcamView onCapture={(f) => void onPick(f)} onUpload={() => inputRef.current?.click()} />
        ) : (
          <>
            <div className="flex shrink-0 flex-col items-center justify-center gap-3 bg-[#0b1f29] px-4 pb-4 pt-12 md:w-[42%] md:px-6 md:py-8">
              {preview ? (
                <PhotoStage src={preview} items={items} active={active} scanning={phase === "reading"} onSelect={selectItem} />
              ) : null}
              <button
                type="button"
                onClick={anotherPhoto}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/20"
              >
                <ImagePlus size={14} /> Try another photo
              </button>
              {!touch && <p className="hidden text-center text-[11.5px] text-white/55 md:block">or drop or paste an image anywhere here</p>}
            </div>
            <div ref={scrollerRef} onScroll={onScroll} data-scrolling="false" className="scroll-panel min-h-0 flex-1 overflow-y-auto p-5 md:p-7 md:pt-8">
              {body}
            </div>
          </>
        )}
        {dropping && <div className="isx-drop">Drop to search this image</div>}
      </div>
    </div>
  );

  return (
    <>
      {/* The visible camera button below is labelled, but this input is a
          separate focusable control and needs its own name: a screen reader
          lands on it and would otherwise announce only "file upload button".
          Named here rather than with a <label for>, because the input is
          sr-only and the thing a sighted user clicks is the button. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label="Search by image — upload a product photo"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Through the same gate as paste and drop, so an oversized or wrong
          // file is reported the same way however it was chosen. Clearing the
          // value afterwards matters: without it, picking the same file again
          // fires no change event and the panel appears to ignore the click.
          e.target.value = "";
          if (f) acceptFile(f);
        }}
      />
      {/* The phone's own camera app, straight away: capture asks for the
          camera rather than the photo library. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Search by image — take a photo"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) acceptFile(f);
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
        <span className="group/cam isx-cam relative flex">
          <button
            ref={camRef}
            type="button"
            onClick={() => (panelOpen ? closePanel() : openPanel())}
            aria-label="Search by photo"
            aria-haspopup="dialog"
            aria-expanded={panelOpen}
            // Hover inverts to the same dark the tooltip uses, so the button and
            // the label read as one object rather than a pale chip with an
            // unrelated black box under it. focus-visible mirrors hover, so the
            // keyboard path gets the same state and not just a ring.
            className="inline-flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-all duration-200 hover:bg-[#081f2a] hover:text-white hover:shadow-[0_4px_14px_rgba(8,31,42,0.35)] focus-visible:bg-[#081f2a] focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-1 motion-safe:hover:scale-105 motion-safe:active:scale-95 md:size-9"
          >
            <Camera size={16} className="md:size-[18px]" />
          </button>

          {/* What the button does, above it: below, it sat under the search
              box's own dropdown whenever the box was in use, and only its
              top edge showed (the owner's screenshot, 2026-10-06). A card
              rather than a bare label, since nobody knows to look for this:
              what it takes, and the paste that also works. Hidden from
              assistive tech, which has the button's aria-label; not on
              phones, which have no hover. */}
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-50 w-[240px] -translate-x-1/2 translate-y-1 rounded-2xl bg-[#081f2a] p-3 text-left text-white opacity-0 shadow-[0_16px_36px_-12px_rgba(8,31,42,0.65)] ring-1 ring-white/10 transition-[opacity,transform] duration-200 ease-out group-hover/cam:translate-y-0 group-hover/cam:opacity-100 group-focus-within/cam:translate-y-0 group-focus-within/cam:opacity-100 motion-reduce:transition-none max-sm:hidden",
              panelOpen && "!opacity-0",
            )}
          >
            <span className="flex items-center gap-2.5">
              <span className="isx-tip-lens" />
              <span className="text-[12.5px] font-bold leading-tight">Search by photo</span>
            </span>
            <span className="mt-1.5 block text-[11.5px] leading-snug text-white/70">
              Snap, upload or drop a picture of what you need, and we find it in the catalogue.
            </span>
            {!touch && (
              <span className="mt-2 flex items-center gap-1 text-[10.5px] text-white/55">
                Or paste one into the search box
                <kbd className="ml-0.5 rounded border border-white/20 bg-white/10 px-1 font-sans text-[10px] font-semibold text-white/80">{isMac ? "⌘" : "Ctrl"}</kbd>
                <kbd className="rounded border border-white/20 bg-white/10 px-1 font-sans text-[10px] font-semibold text-white/80">V</kbd>
              </span>
            )}
            <span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 bg-[#081f2a]" />
          </span>
        </span>
      </span>

      {mounted && uploadPanel ? createPortal(uploadPanel, document.body) : null}

      {mounted && dialog ? createPortal(dialog, document.body) : null}

      {mounted && inquiry ? createPortal(<InquiryModal product={inquiry} onClose={() => setInquiry(null)} onNavigate={navigateAway} />, document.body) : null}
    </>
  );
}

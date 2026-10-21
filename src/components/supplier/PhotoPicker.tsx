"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { preparePhoto } from "@/lib/prepare-photo";
import { PHOTOS_MAX } from "@/lib/supplier-offer";

/** Product photos are read for detail, so they keep more than a profile picture's 800px. */
const PHOTO_EDGE = 1600;

interface Item {
  key: string;
  preview: string;
  file: File;
  state: "uploading" | "done" | "failed";
  url?: string;
  error?: string;
}

/**
 * Up to five photos of the supplier's own product, all optional (the owner, 2026-10-21).
 *
 * Each photo is made fit before it leaves (preparePhoto: turned the right way up, 1600px on the long edge, a
 * JPEG of a few hundred KB, whatever the camera produced), then sent straight to S3 with a presigned upload
 * from /api/supplier/upload-url, the way the staff photo goes. Only the finished URLs reach the form; while any
 * photo is still on its way the form is told, so it can wait rather than send without it.
 */
export function PhotoPicker({
  onChange,
  onBusyChange,
}: {
  onChange: (urls: string[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    onChange(items.filter((i) => i.state === "done" && i.url).map((i) => i.url as string));
    onBusyChange(items.some((i) => i.state === "uploading"));
  }, [items, onChange, onBusyChange]);

  // The previews are object URLs: let each go when its photo leaves the list or the form closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const kept = previews.current;
    return () => kept.forEach((p) => URL.revokeObjectURL(p));
  }, []);

  const patch = (key: string, change: Partial<Item>) =>
    live.current && setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));

  const upload = async (key: string, chosen: File) => {
    patch(key, { state: "uploading", error: undefined });
    try {
      const file = await preparePhoto(chosen, PHOTO_EDGE);
      const ticket = await fetch("/api/supplier/upload-url/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      const t = await ticket.json().catch(() => ({}));
      if (!ticket.ok || !t?.uploadUrl) throw new Error(t?.error || "The photo could not be uploaded.");
      const form = new FormData();
      for (const [k, v] of Object.entries(t.uploadFields as Record<string, string>)) form.append(k, v);
      form.append("file", file);
      const sent = await fetch(t.uploadUrl, { method: "POST", body: form });
      if (!sent.ok) throw new Error("The photo could not be uploaded. Try again.");
      patch(key, { state: "done", url: t.publicUrl });
    } catch (e) {
      patch(key, { state: "failed", error: e instanceof Error ? e.message : "The photo could not be uploaded." });
    }
  };

  const add = (files: FileList | File[]) => {
    setNote(null);
    const room = PHOTOS_MAX - items.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > chosen.length) setNote(`Up to ${PHOTOS_MAX} photos. The first ${chosen.length || "few"} were added.`);
    if (!chosen.length) return;
    const fresh: Item[] = chosen.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, preview, file, state: "uploading" };
    });
    setItems((list) => [...list, ...fresh]);
    fresh.forEach((i) => void upload(i.key, i.file));
  };

  const remove = (key: string) => {
    setNote(null);
    setItems((list) => {
      const gone = list.find((i) => i.key === key);
      if (gone) {
        URL.revokeObjectURL(gone.preview);
        previews.current.delete(gone.preview);
      }
      return list.filter((i) => i.key !== key);
    });
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {items.map((i) => (
          <div key={i.key} className="relative aspect-square overflow-hidden rounded-xl bg-[#eef3f4] ring-1 ring-[#dde5e8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.preview} alt="" className={`h-full w-full object-cover ${i.state === "done" ? "" : "opacity-60"}`} />
            {i.state === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/30">
                <Loader2 className="h-5 w-5 animate-spin text-brand-dark" aria-label="Uploading" />
              </span>
            )}
            {i.state === "failed" && (
              <button
                type="button"
                onClick={() => void upload(i.key, i.file)}
                title={i.error}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-50/85 text-[11px] font-semibold text-red-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(i.key)}
              aria-label="Remove this photo"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {items.length < PHOTOS_MAX && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files?.length) add(e.dataTransfer.files);
            }}
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11.5px] font-semibold transition-colors ${
              dragging ? "border-brand bg-brand/5 text-brand-dark" : "border-[#c9d6da] text-[#5b6f76] hover:border-brand hover:text-brand-dark"
            }`}
          >
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
            {items.length ? "Add more" : "Add photos"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) add(e.target.files);
          e.target.value = "";
        }}
      />
      {items.some((i) => i.state === "failed") && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-red-600">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {items.find((i) => i.state === "failed")?.error} Press the photo to try again, or remove it.
        </p>
      )}
      {note && <p className="mt-2 text-[12px] text-[#5b6f76]">{note}</p>}
    </div>
  );
}

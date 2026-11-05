"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import {
  ID_DOCUMENTS_MAX,
  ID_DOCUMENT_MAX_BYTES,
  ID_PROOFS,
  ID_PROOF_NEEDED,
  idDocumentExtension,
  idProofLabel,
  isIdDocumentType,
  type IdDocumentType,
  type IdProof,
} from "@/lib/trip-referral-shared";
import { LABEL } from "./fields";
import type { ApplicationApi } from "./useApplication";

const TOO_BIG = "That file is over 10 MB. Please add a smaller photo or PDF.";
const NOT_A_DOCUMENT = "Please add a photo or a PDF of your ID.";
const NOT_SENT = "That file didn't upload. Please check your connection and add it again.";

/**
 * A file made ready to send. A photo is turned upright, brought to at most 2000 px on its longer side and saved as
 * JPEG, which keeps an ID readable, sends in seconds on a phone, and drops what the camera wrote into it (where it
 * was taken). A PDF goes as it is. A photo this browser cannot draw goes as it is too, when S3 will take its type.
 */
async function prepare(file: File): Promise<{ blob: Blob; type: IdDocumentType; kind: "image" | "pdf" } | { error: string }> {
  if (file.type === "application/pdf") return file.size <= ID_DOCUMENT_MAX_BYTES ? { blob: file, type: "application/pdf", kind: "pdf" } : { error: TOO_BIG };
  if (!file.type.startsWith("image/")) return { error: NOT_A_DOCUMENT };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // A PNG's transparent parts, white rather than JPEG's black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob && blob.size <= ID_DOCUMENT_MAX_BYTES) return { blob, type: "image/jpeg", kind: "image" };
    }
  } catch {
    /* a format this browser cannot draw */
  }
  if (isIdDocumentType(file.type) && file.size <= ID_DOCUMENT_MAX_BYTES) return { blob: file, type: file.type, kind: "image" };
  return { error: file.size > ID_DOCUMENT_MAX_BYTES ? TOO_BIG : NOT_A_DOCUMENT };
}

/** One file, straight to the private bucket: a ticket from our server for the ID it is, then the file to S3. Its key,
 *  or why not. */
async function send(code: string, proof: IdProof, blob: Blob, type: IdDocumentType): Promise<{ key: string } | { error: string; notLive?: boolean }> {
  try {
    const res = await fetch("/api/trip-applications/document-url/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, proof, contentType: type }),
    });
    const t = (await res.json().catch(() => ({}))) as { uploadUrl?: string; uploadFields?: Record<string, string>; key?: string; error?: string; reason?: string };
    if (!res.ok || !t.uploadUrl || !t.uploadFields || !t.key) return { error: t.error || NOT_SENT, notLive: t.reason === "not_live" };
    const form = new FormData();
    for (const [k, v] of Object.entries(t.uploadFields)) form.append(k, v);
    // The file last: S3 reads the policy's fields before it.
    form.append("file", blob, `id.${idDocumentExtension(type)}`);
    const up = await fetch(t.uploadUrl, { method: "POST", body: form });
    return up.ok ? { key: t.key } : { error: NOT_SENT };
  } catch {
    return { error: NOT_SENT };
  }
}

/** What to add of each ID, under the choice once one is picked. */
const PROOF_NOTE: Record<IdProof, string> = {
  aadhaar: "Add both sides. A masked Aadhaar is fine.",
  pan: "Add the front of the card.",
  voter: "Add both sides.",
  licence: "Add both sides.",
  passport: "Add the page with your photo.",
  emirates: "Add both sides.",
  other: "Any other ID with your photo. Add both sides if it has two.",
};

/**
 * ID proof, asked only of someone who came through an employee's link (the owner, 2026-11-02: compulsory for them,
 * never shown to anyone applying on their own). One of the IDs in ID_PROOFS (2026-11-03: "aadhar / pan / voter id /
 * license / passport ... only these"; Emirates ID and Other ID since 2026-11-04), chosen first as the form's other
 * choices are; then photos or PDFs of it, up to
 * three (both sides of an Aadhaar), each sent the moment it is chosen and shown as a tile named by its ID, which can
 * be taken off again. Its complaint, the form's or the server's, sits under it like any field's; Submit waits for
 * files still on their way. Nothing under the choices until one is picked (the owner, 2026-11-05: "Choose any one of
 * these, then add a photo or a PDF of it." taken out, "indha text matu dha", that line only); then what to add of it.
 */
export function IdDocumentField({ app }: { app: ApplicationApi }) {
  const input = useRef<HTMLInputElement>(null);
  const { files, uploading } = app.state.documents;
  // Which ID the next file is: the last one added's, until another is chosen.
  const [proof, setProof] = useState<IdProof | null>(() => files.at(-1)?.proof ?? null);
  const room = ID_DOCUMENTS_MAX - files.length - uploading;
  const error = app.errors.idDocument;

  const choose = (next: IdProof) => {
    setProof(next);
    if (app.errors.idDocument === ID_PROOF_NEEDED) app.setErrors((e) => ({ ...e, idDocument: undefined }));
  };
  const add = () => {
    if (!proof) {
      app.setErrors((e) => ({ ...e, idDocument: ID_PROOF_NEEDED }));
      document.getElementById("ax-idProof")?.focus();
      return;
    }
    input.current?.click();
  };

  // The previews' object URLs, let go when the form goes.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = files.map((f) => f.preview).filter((p): p is string => !!p);
  }, [files]);
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p)), []);

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).slice(0, Math.max(0, room));
    if (input.current) input.current.value = "";
    const code = app.state.referral.code;
    const as = proof;
    if (!as) return;
    for (const file of chosen) {
      app.documentStarted();
      void (async () => {
        const ready = await prepare(file);
        if ("error" in ready) {
          app.documentSettled(null);
          app.setErrors((e) => ({ ...e, idDocument: ready.error }));
          return;
        }
        const sent = await send(code, as, ready.blob, ready.type);
        if ("error" in sent) {
          app.documentSettled(null);
          // The link stopped crediting anyone since it was kept: nothing more is asked.
          if (sent.notLive) app.dropReferral();
          else app.setErrors((e) => ({ ...e, idDocument: sent.error }));
          return;
        }
        app.documentSettled({ key: sent.key, proof: as, kind: ready.kind, preview: ready.kind === "image" ? URL.createObjectURL(ready.blob) : null });
      })();
    }
  };

  const remove = (key: string, preview: string | null) => {
    if (preview) URL.revokeObjectURL(preview);
    app.removeDocument(key);
  };

  const tile = "relative grid size-24 shrink-0 place-items-center overflow-hidden border border-(--cx-white)/22 sm:size-28";
  return (
    <fieldset
      id="ax-idDocument"
      tabIndex={-1}
      aria-describedby={[proof ? "ax-idDocument-note" : "", error ? "ax-idDocument-error" : ""].filter(Boolean).join(" ") || undefined}
      className="grid gap-3 outline-none sm:col-span-2"
    >
      <legend className={LABEL}>
        ID proof
        <span aria-hidden className="text-(--cx-gold)"> *</span>
      </legend>
      {/* The IDs, drawn as the form's other choices are (Pills), and nothing to type. */}
      <div role="radiogroup" aria-label="Which ID" className="mt-1 flex flex-wrap gap-2.5">
        {ID_PROOFS.map((p, i) => (
          <label key={p.id} className="group relative cursor-pointer">
            <input
              id={i === 0 ? "ax-idProof" : undefined}
              type="radio"
              name="ax-idProof"
              value={p.id}
              checked={proof === p.id}
              onChange={() => choose(p.id)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 items-center border border-(--cx-white)/22 px-4 text-[14px] text-(--cx-white) transition-colors duration-300 group-hover:border-(--cx-white)/45 peer-checked:border-(--cx-gold) peer-checked:bg-(--cx-gold) peer-checked:text-(--cx-ink) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-(--cx-white)">
              {p.label}
            </span>
          </label>
        ))}
      </div>
      {proof && (
        <p id="ax-idDocument-note" className="max-w-[34rem] text-[13px] leading-relaxed text-(--cx-mute)">
          {`${PROOF_NOTE[proof]} A photo or a PDF.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {files.map((f, i) => (
          <div key={f.key} className={tile}>
            {f.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
              <img src={f.preview} alt={`${idProofLabel(f.proof)}, file ${i + 1}`} className="size-full object-cover" />
            ) : (
              <span className="grid justify-items-center gap-1 text-[12px] font-semibold tracking-[0.12em] text-(--cx-white)">
                <FileText size={22} aria-hidden />
                PDF
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-(--cx-ink)/80 px-1.5 py-1 text-center text-[11px] text-(--cx-white)">{idProofLabel(f.proof)}</span>
            <button
              type="button"
              onClick={() => remove(f.key, f.preview)}
              aria-label={`Remove ${idProofLabel(f.proof)}, file ${i + 1}`}
              className="absolute right-1 top-1 grid size-7 place-items-center bg-(--cx-ink)/80 text-(--cx-white) transition-colors hover:bg-(--cx-ink) focus-visible:outline-2 focus-visible:outline-(--cx-gold)"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up-${i}`} className={`${tile} border-dashed`} role="status">
            <span className="text-[12px] text-(--cx-mute)">Uploading…</span>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={add}
            className="inline-flex min-h-11 items-center gap-2 border border-(--cx-white)/22 px-4 text-[14px] text-(--cx-white) transition-colors duration-300 hover:border-(--cx-white)/45 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--cx-white)"
          >
            <Plus size={16} aria-hidden />
            {files.length || uploading ? "Add another document" : "Add document"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => pick(e.target.files)}
      />
      {error && (
        <p id="ax-idDocument-error" className="text-[13px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </fieldset>
  );
}

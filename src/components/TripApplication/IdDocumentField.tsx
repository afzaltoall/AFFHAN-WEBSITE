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
const HEIC = "This photo is saved as HEIC, which can't be sent. Please add a screenshot of it, a JPEG photo or a PDF.";
const NOT_SENT = "That file didn't upload. Please check your connection and add it again.";

/** How long our server has to give a file its ticket, each time it is asked. */
const TICKET_MS = 20_000;
/**
 * How long an upload may go without another byte leaving (or, once all have gone, without S3's answer) before it is
 * given up and sent again: a slow upload that is moving is never cut off. The first bytes get longer (the browser asks
 * S3 first whether it may send, and a phone may still be waking its connection).
 */
const STALL_MS = 30_000;
const FIRST_BYTES_MS = 45_000;
/** Once every byte has gone, S3 answers in a moment: this long without its answer, the answer is taken as lost. */
const ANSWER_MS = 15_000;
/** Each file is tried this many times before its complaint is shown. */
const TRIES = 3;

type Kind = "image" | "pdf";
type Ticket = { uploadUrl: string; uploadFields: Record<string, string>; key: string };

/** What the file's first bytes say it is, whatever the phone called it (some file pickers name no type at all). */
async function sniff(file: File): Promise<"pdf" | IdDocumentType | null> {
  try {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const text = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
    if (text(0, 5) === "%PDF-") return "pdf";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
    if (b[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
    if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  } catch {
    /* unreadable: the type the phone gave decides */
  }
  return null;
}

/**
 * A file made ready to send. A photo is turned upright, brought to at most 2000 px on its longer side and saved as
 * JPEG, which keeps an ID readable, sends in seconds on a phone, and drops what the camera wrote into it (where it
 * was taken). A PDF goes as it is. A photo this browser cannot draw goes as it is too, when S3 will take its type.
 * A file the phone gave no type (or a vague one) is known by its first bytes (2026-11-10).
 */
async function prepare(file: File): Promise<{ blob: Blob; type: IdDocumentType; kind: Kind } | { error: string }> {
  let type = file.type.toLowerCase();
  if (type !== "application/pdf" && !type.startsWith("image/")) {
    const seen = await sniff(file);
    if (!seen) return { error: NOT_A_DOCUMENT };
    type = seen === "pdf" ? "application/pdf" : seen;
  }
  if (type === "application/pdf") return file.size <= ID_DOCUMENT_MAX_BYTES ? { blob: file, type: "application/pdf", kind: "pdf" } : { error: TOO_BIG };
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
  if (isIdDocumentType(type) && file.size <= ID_DOCUMENT_MAX_BYTES) return { blob: file, type, kind: "image" };
  if (/hei[cf]/.test(type)) return { error: HEIC };
  return { error: file.size > ID_DOCUMENT_MAX_BYTES ? TOO_BIG : NOT_A_DOCUMENT };
}

/** A pause between tries, cut short when the file is taken off. */
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Our server's ticket for one file: where to post it, with what, and its key. Its own refusal is final; its trouble,
 *  or no answer in time, is tried again. */
async function ticketFor(code: string, proof: IdProof, type: IdDocumentType, signal: AbortSignal): Promise<Ticket | { error: string; notLive?: boolean; again: boolean }> {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal.addEventListener("abort", stop, { once: true });
  const timer = window.setTimeout(stop, TICKET_MS);
  try {
    const res = await fetch("/api/trip-applications/document-url/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, proof, contentType: type }),
      cache: "no-store",
      signal: ctl.signal,
    });
    const t = (await res.json().catch(() => ({}))) as Partial<Ticket> & { error?: string; reason?: string };
    if (res.ok && t.uploadUrl && t.uploadFields && t.key) return { uploadUrl: t.uploadUrl, uploadFields: t.uploadFields, key: t.key };
    return { error: t.error || NOT_SENT, notLive: t.reason === "not_live", again: res.status >= 500 };
  } catch {
    return { error: NOT_SENT, again: true };
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", stop);
  }
}

/**
 * The file to S3 with its ticket, telling how much has gone (0 to 1). XMLHttpRequest, not fetch: fetch says nothing
 * until the end, and has no way to tell a slow upload from a dead one. "sent" when S3 has it; "refused" when S3 says
 * no (its ticket ran out); "lost" when the line dropped, or nothing moved for STALL_MS.
 */
function toS3(ticket: Ticket, blob: Blob, type: IdDocumentType, onProgress: (part: number) => void, signal: AbortSignal): Promise<"sent" | "refused" | "lost"> {
  return new Promise((resolve) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(ticket.uploadFields)) form.append(k, v);
    // The file last: S3 reads the policy's fields before it.
    form.append("file", blob, `id.${idDocumentExtension(type)}`);
    const xhr = new XMLHttpRequest();
    let timer = 0;
    let over = false;
    const finish = (how: "sent" | "refused" | "lost") => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(how);
    };
    const cancel = () => {
      xhr.abort();
      finish("lost");
    };
    const wait = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        xhr.abort();
        finish("lost");
      }, ms);
    };
    xhr.upload.onprogress = (e) => {
      const all = e.lengthComputable && e.total > 0 && e.loaded >= e.total;
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      wait(all ? ANSWER_MS : STALL_MS);
    };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? "sent" : xhr.status >= 400 && xhr.status < 500 ? "refused" : "lost");
    xhr.onerror = () => finish("lost");
    xhr.onabort = () => finish("lost");
    signal.addEventListener("abort", cancel, { once: true });
    xhr.open("POST", ticket.uploadUrl);
    wait(FIRST_BYTES_MS);
    xhr.send(form);
  });
}

/**
 * One file into the private bucket: a ticket from our server for the ID it is, then the file to S3, tried up to TRIES
 * times (2026-11-10, the owner: "after uploading any document ... not sending"). Before, one request that never
 * answered left its tile at "Uploading…" for good, Submit saying "still uploading", and no way to take it off: only
 * leaving the page, and everything typed with it. A file sent again goes to the same key with the same ticket, so a
 * try that reached S3 and lost only its answer leaves nothing behind; one S3 refused gets a fresh ticket.
 */
async function upload(
  code: string,
  proof: IdProof,
  blob: Blob,
  type: IdDocumentType,
  onProgress: (part: number) => void,
  signal: AbortSignal,
): Promise<{ key: string } | { error: string; notLive?: boolean } | { cancelled: true }> {
  let ticket: Ticket | null = null;
  let error = NOT_SENT;
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    if (signal.aborted) return { cancelled: true };
    if (!ticket) {
      const t = await ticketFor(code, proof, type, signal);
      if (signal.aborted) return { cancelled: true };
      if ("error" in t) {
        if (!t.again) return { error: t.error, notLive: t.notLive };
        error = t.error;
        await pause(1000 * attempt, signal);
        continue;
      }
      ticket = t;
    }
    onProgress(0);
    const how = await toS3(ticket, blob, type, onProgress, signal);
    if (signal.aborted) return { cancelled: true };
    if (how === "sent") return { key: ticket.key };
    if (how === "refused") ticket = null;
    error = NOT_SENT;
    await pause(1000 * attempt, signal);
  }
  return { error };
}

/** A file on its way: which ID, and how much of it has gone (0 to 1). */
interface Sending {
  id: string;
  proof: IdProof;
  part: number;
}

/**
 * ID proof, asked only of someone who came through an employee's link (the owner, 2026-11-02: compulsory for them,
 * never shown to anyone applying on their own). One of the IDs in ID_PROOFS (2026-11-03: "aadhar / pan / voter id /
 * license / passport ... only these"; Emirates ID and Other ID since 2026-11-04), chosen first as the form's other
 * choices are; then photos or PDFs of it, up to
 * three (both sides of an Aadhaar), each sent the moment it is chosen and shown as a tile named by its ID, which can
 * be taken off again. A file on its way shows how much of it has gone, and can be taken off too (2026-11-10). Its
 * complaint, the form's or the server's, sits under it like any field's; Submit pressed while a file is on its way
 * sends the application the moment it has arrived (ApplyExperience). No line of words under the choices, before an ID
 * is picked or after (the owner: "Choose any one of these, then add a photo or a PDF of it." taken out 2026-11-05; the
 * picked ID's tip, "Add both sides…", 2026-11-06: "after slecting also dont show").
 */
export function IdDocumentField({ app }: { app: ApplicationApi }) {
  const input = useRef<HTMLInputElement>(null);
  const { files, pending } = app.state.documents;
  // Which ID the next file is: the last one added's, until another is chosen.
  const [proof, setProof] = useState<IdProof | null>(() => files.at(-1)?.proof ?? null);
  // The files on their way, as this field draws them (app.state.documents.pending holds their ids for the page).
  const [sending, setSending] = useState<Sending[]>([]);
  const stops = useRef(new Map<string, AbortController>());
  const room = ID_DOCUMENTS_MAX - files.length - pending.length;
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

  // The previews' object URLs, let go when the form goes; and any file still on its way, stopped.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = files.map((f) => f.preview).filter((p): p is string => !!p);
  }, [files]);
  useEffect(() => {
    const live = stops.current;
    return () => {
      previews.current.forEach((p) => URL.revokeObjectURL(p));
      live.forEach((c) => c.abort());
    };
  }, []);

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).slice(0, Math.max(0, room));
    if (input.current) input.current.value = "";
    const code = app.state.referral.code;
    const as = proof;
    if (!as) return;
    for (const file of chosen) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const stop = new AbortController();
      stops.current.set(id, stop);
      setSending((s) => [...s, { id, proof: as, part: 0 }]);
      app.documentStarted(id);
      // Whole percents only: a progress event comes every few milliseconds.
      let shown = -1;
      const onProgress = (part: number) => {
        const pc = Math.floor(part * 100);
        if (pc === shown) return;
        shown = pc;
        setSending((s) => s.map((x) => (x.id === id ? { ...x, part } : x)));
      };
      const settle = (done: Parameters<ApplicationApi["documentSettled"]>[1]) => {
        stops.current.delete(id);
        setSending((s) => s.filter((x) => x.id !== id));
        app.documentSettled(id, done);
      };
      void (async () => {
        const ready = await prepare(file);
        if (stop.signal.aborted) return settle(null);
        if ("error" in ready) {
          settle(null);
          app.setErrors((e) => ({ ...e, idDocument: ready.error }));
          return;
        }
        const sent = await upload(code, as, ready.blob, ready.type, onProgress, stop.signal);
        if ("cancelled" in sent) return settle(null);
        if ("error" in sent) {
          settle(null);
          // The link stopped crediting anyone since it was kept: nothing more is asked.
          if (sent.notLive) app.dropReferral();
          else app.setErrors((e) => ({ ...e, idDocument: sent.error }));
          return;
        }
        settle({ key: sent.key, proof: as, kind: ready.kind, preview: ready.kind === "image" ? URL.createObjectURL(ready.blob) : null });
      })();
    }
  };

  const remove = (key: string, preview: string | null) => {
    if (preview) URL.revokeObjectURL(preview);
    app.removeDocument(key);
  };
  /** A file on its way, taken off: stopped, as if never chosen. */
  const cancel = (id: string) => stops.current.get(id)?.abort();

  const tile = "relative grid size-24 shrink-0 place-items-center overflow-hidden border border-(--cx-white)/22 sm:size-28";
  const corner =
    "absolute right-1 top-1 grid size-7 place-items-center bg-(--cx-ink)/80 text-(--cx-white) transition-colors hover:bg-(--cx-ink) focus-visible:outline-2 focus-visible:outline-(--cx-gold)";
  return (
    <fieldset
      id="ax-idDocument"
      tabIndex={-1}
      aria-describedby={error ? "ax-idDocument-error" : undefined}
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
            <button type="button" onClick={() => remove(f.key, f.preview)} aria-label={`Remove ${idProofLabel(f.proof)}, file ${i + 1}`} className={corner}>
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
        {sending.map((s) => {
          const pc = Math.round(s.part * 100);
          return (
            <div key={s.id} className={`${tile} border-dashed`} role="status" aria-label={`${idProofLabel(s.proof)} uploading, ${pc}%`}>
              <span className="grid justify-items-center gap-0.5 text-[12px] text-(--cx-mute)">
                Uploading…
                <span className="text-[15px] font-semibold tabular-nums text-(--cx-white)">{pc}%</span>
              </span>
              {/* How much has gone, along the tile's foot. */}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-(--cx-white)/12">
                <span className="block h-full origin-left bg-(--cx-gold) transition-transform duration-300" style={{ transform: `scaleX(${s.part})` }} />
              </span>
              <button type="button" onClick={() => cancel(s.id)} aria-label={`Stop uploading ${idProofLabel(s.proof)}`} className={corner}>
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
        {room > 0 && (
          <button
            type="button"
            onClick={add}
            className="inline-flex min-h-11 items-center gap-2 border border-(--cx-white)/22 px-4 text-[14px] text-(--cx-white) transition-colors duration-300 hover:border-(--cx-white)/45 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--cx-white)"
          >
            <Plus size={16} aria-hidden />
            {files.length || pending.length ? "Add another document" : "Add document"}
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

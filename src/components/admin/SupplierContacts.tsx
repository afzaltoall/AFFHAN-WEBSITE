"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Copy, Check, Globe, AlertTriangle } from "lucide-react";
import type { ContactEntry, PhoneView } from "@/lib/suppliers";

/**
 * Renders every contact a supplier has, and never fewer.
 *
 * The sheet these come from is the sourcing team's only record of who they
 * bought from, so the rule running through this component is that anything
 * recorded is shown. Numbers we cannot turn into a dialable link are still
 * printed as text; IDs we cannot identify as a particular messenger are still
 * printed with a copy button. The `full` variant additionally prints the
 * original cell verbatim, so a reader can always check our reading against
 * what was actually typed.
 */

/* Brand marks. lucide has no WhatsApp or WeChat glyph and these are the two
   channels the whole book runs on, so they are drawn here rather than
   approximated with a generic speech bubble. */
function WhatsAppIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.470 1.06 2.5 1.2 2.68.15.18 2.08 3.18 5.05 4.46.71.3 1.26.49 1.69.63.71.22 1.35.19 1.86.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.69 8.23-8.23 8.23z" />
    </svg>
  );
}

function WeChatIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8.69 4C4.89 4 1.8 6.57 1.8 9.74c0 1.83 1.03 3.46 2.63 4.52l-.66 1.98 2.31-1.16c.82.23 1.7.35 2.61.35.22 0 .44 0 .65-.02a5.3 5.3 0 0 1-.22-1.5c0-3.02 2.93-5.47 6.55-5.47.24 0 .47.01.7.03C15.79 5.79 12.55 4 8.69 4zM6.4 8.5a.93.93 0 1 1 0-1.86.93.93 0 0 1 0 1.86zm4.6 0a.93.93 0 1 1 0-1.86.93.93 0 0 1 0 1.86z" />
      <path d="M22.2 13.9c0-2.63-2.6-4.77-5.8-4.77s-5.8 2.14-5.8 4.77 2.6 4.78 5.8 4.78c.68 0 1.33-.1 1.94-.28l1.9.96-.53-1.63c1.5-.88 2.49-2.24 2.49-3.83zm-7.72-.86a.78.78 0 1 1 0-1.55.78.78 0 0 1 0 1.55zm3.84 0a.78.78 0 1 1 0-1.55.78.78 0 0 1 0 1.55z" />
    </svg>
  );
}

const waLink = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;

/** Clipboard with a fallback: the API is unavailable on plain-http origins. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea route */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ value, what, dark }: { value: string; what: string; dark: boolean }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = useCallback(async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }, [value]);

  return (
    <button
      type="button"
      onClick={onClick}
      // The label names the value itself, so a screen-reader user moving
      // between six identical "Copy" buttons in one row knows which is which.
      aria-label={done ? `${what} ${value} copied` : `Copy ${what} ${value}`}
      title={`Copy ${value}`}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        done
          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30"
          : dark
            ? "text-[#a1a1a6] ring-white/[0.12] hover:bg-white/[0.08] hover:text-white"
            : "text-[#6e6e73] ring-black/[0.08] hover:bg-black/[0.04] hover:text-[#1d1d1f]"
      }`}
    >
      {done ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}

interface Props {
  phones: PhoneView[];
  handles: ContactEntry[];
  webs: ContactEntry[];
  /** The original cell. Printed verbatim in the `full` variant. */
  raw: string;
  dark: boolean;
  variant?: "row" | "full";
}

export function SupplierContacts({ phones, handles, webs, raw, dark, variant = "row" }: Props) {
  const soft = dark ? "text-[#8a8a8e]" : "text-[#6e6e73]";
  const full = variant === "full";

  if (!phones.length && !handles.length && !webs.length) {
    return (
      <p className={`inline-flex items-center gap-1.5 text-[12px] ${soft}`}>
        <AlertTriangle size={13} aria-hidden="true" className={dark ? "text-amber-500" : "text-amber-600"} />
        {raw ? <span className="break-all">{raw}</span> : "No contact recorded"}
      </p>
    );
  }

  return (
    <div className={full ? "space-y-2.5" : "space-y-1.5"}>
      {phones.map((p, i) => (
        <div key={`p${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Phone size={13} aria-hidden="true" className={`shrink-0 ${soft}`} />
          {p.e164 ? (
            <a
              href={`tel:${p.e164}`}
              className="text-[13px] font-semibold tabular-nums tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              {p.value}
            </a>
          ) : (
            <span className="text-[13px] font-semibold tabular-nums tracking-tight">{p.value}</span>
          )}

          {/* Everything the sheet said about this number, kept next to it. */}
          {p.label && <span className={`text-[11px] ${soft}`}>{p.label}</span>}
          {p.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${
                dark ? "bg-white/[0.08] text-[#a1a1a6]" : "bg-black/[0.05] text-[#6e6e73]"
              }`}
            >
              {tag}
            </span>
          ))}
          {/* Said plainly rather than silently: we added the country code here,
              the sheet did not have one. */}
          {p.assumed && (
            <span className={`text-[10px] font-medium ${soft}`} title="No country code in the sheet; +86 assumed">
              +86 assumed
            </span>
          )}
          {p.incomplete && (
            <span className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-bold ${dark ? "text-amber-500" : "text-amber-700"}`}>
              <AlertTriangle size={10} aria-hidden="true" /> too short
            </span>
          )}

          <span className="ml-auto flex items-center gap-1">
            {p.e164 && (
              <a
                href={waLink(p.e164)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open WhatsApp for ${p.value}`}
                title="WhatsApp"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 ring-1 ring-emerald-500/25 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <WhatsAppIcon />
              </a>
            )}
            <CopyButton value={p.e164 || p.value} what="number" dark={dark} />
          </span>
        </div>
      ))}

      {handles.map((h, i) => (
        <div key={`h${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <WeChatIcon className={`h-3.5 w-3.5 shrink-0 ${soft}`} />
          <span className="break-all text-[13px] font-semibold tracking-tight">{h.value}</span>
          <span className={`text-[11px] ${soft}`}>{h.label || "WeChat ID"}</span>
          {h.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${
                dark ? "bg-white/[0.08] text-[#a1a1a6]" : "bg-black/[0.05] text-[#6e6e73]"
              }`}
            >
              {tag}
            </span>
          ))}
          {/* No link: WeChat has no reliable web handoff for an ID, so copying
              it for the desktop app's search box is the honest action. */}
          <span className="ml-auto">
            <CopyButton value={h.value} what="ID" dark={dark} />
          </span>
        </div>
      ))}

      {webs.map((w, i) => (
        <div key={`w${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Globe size={13} aria-hidden="true" className={`shrink-0 ${soft}`} />
          <a
            href={/^https?:/i.test(w.value) ? w.value : `https://${w.value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[13px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            {w.value}
          </a>
          <span className="ml-auto">
            <CopyButton value={w.value} what="address" dark={dark} />
          </span>
        </div>
      ))}

      {/* The parse is an interpretation. On the supplier's own page the source
          text is printed underneath it so the reading can always be checked. */}
      {full && raw && (
        <div className={`mt-3 rounded-xl px-3 py-2 ${dark ? "bg-white/[0.04]" : "bg-black/[0.03]"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${soft}`}>As recorded in the sheet</p>
          <p className="mt-1 whitespace-pre-line break-words font-mono text-[11.5px] leading-relaxed">{raw}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * A customer's permanent number, and a way to get it into a message.
 *
 * It exists to be said out loud and pasted into WhatsApp — "take a look at
 * AFFHAN-0042" — so the whole badge is the copy button rather than a label
 * with a tiny icon beside it. It lives on the console's grouped customer row,
 * on that row's expanded panel, and on the staff dashboard's customer cards,
 * so that admin and salesperson are reading the same number off the same
 * customer.
 *
 * Themed by the caller: the console passes its own chip token, which has a
 * dark half, and the workspace passes wt.chip. Nothing here knows about
 * either.
 */

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

export function CustomerCodeBadge({
  code,
  chip,
  size = "sm",
  className = "",
}: {
  /** AFFHAN-0042. Nothing renders without one — see the callers. */
  code: string;
  /** The theme's chip classes: background and resting text colour. */
  chip: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      // The badge sits inside rows that open on click. Copying a number is not
      // asking for the card to expand.
      e.stopPropagation();
      e.preventDefault();
      const ok = await copyText(code);
      if (!ok) return;
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    },
    [code],
  );

  const pad = size === "md" ? "px-2 py-1 text-[12px]" : "px-1.5 py-0.5 text-[11px]";
  const icon = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <button
      type="button"
      onClick={onClick}
      title={done ? "Copied" : `Copy ${code}`}
      aria-label={done ? `${code} copied` : `Copy customer ID ${code}`}
      className={`group inline-flex shrink-0 items-center gap-1 rounded-md font-semibold tabular-nums tracking-[0.04em] transition-colors cursor-pointer ${pad} ${
        done ? "bg-emerald-500/15 text-emerald-600" : chip
      } ${className}`}
    >
      {done ? (
        <Check className={`${icon} shrink-0`} />
      ) : (
        <Copy className={`${icon} shrink-0 opacity-40 transition-opacity group-hover:opacity-100`} />
      )}
      {code}
    </button>
  );
}

export default CustomerCodeBadge;

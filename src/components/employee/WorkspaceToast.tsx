"use client";

import { useEffect, useState } from "react";
import { Check, Info } from "lucide-react";

/**
 * A short line saying what just happened, over the workspace.
 *
 * Recording an outcome used to be silent at the moment it mattered. The panel
 * said "Recorded" inside itself, which is fine while the panel is still
 * there — but "Not attended" hands the customer to somebody else, so the panel
 * closes and the row leaves the list in the same second. The salesperson was
 * left watching their work disappear with no word that it had worked, which
 * reads as a fault however correct it is.
 *
 * So the confirmation lives on the board, which does not unmount when the
 * panel closes or when the page refreshes itself, and stays long enough to be
 * read: four seconds, or until the next one replaces it.
 *
 * Polite rather than loud — bottom of the screen, out of the way of the list,
 * and announced to assistive technology rather than only drawn.
 */
export interface ToastMessage {
  /** New object per event, so the same words twice still re-show and re-time. */
  id: number;
  text: string;
  detail?: string;
  tone: "done" | "moved";
}

export function WorkspaceToast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!message) return;
    setShown(true);
    // Long enough to read a sentence, short enough not to sit over the list.
    const hide = setTimeout(() => setShown(false), 4000);
    const clear = setTimeout(onDone, 4400);
    return () => { clearTimeout(hide); clearTimeout(clear); };
  }, [message, onDone]);

  if (!message) return null;
  const moved = message.tone === "moved";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-5 z-[140] flex justify-center px-4 transition-all duration-300 motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex max-w-[min(30rem,100%)] items-start gap-3 rounded-2xl bg-[#1d1d1f] px-4 py-3 text-white shadow-2xl ring-1 ring-white/10">
        <span
          className={`mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            moved ? "bg-amber-400/20 text-amber-300" : "bg-emerald-400/20 text-emerald-300"
          }`}
        >
          {moved ? <Info className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </span>
        <p className="text-[13px] font-semibold leading-snug">
          {message.text}
          {message.detail && <span className="block font-normal text-white/70">{message.detail}</span>}
        </p>
      </div>
    </div>
  );
}

export default WorkspaceToast;

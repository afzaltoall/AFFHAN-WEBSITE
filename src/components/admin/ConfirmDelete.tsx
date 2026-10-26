"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import type { NewSupplierTheme } from "@/components/admin/new-suppliers-shared";

/**
 * The window before a delete on New Suppliers and a new supplier's page: what goes, in words and by name, and that
 * it cannot be undone. Cancel has the focus, so Enter does not delete by accident; Escape cancels. If the delete
 * fails, it says why and stays.
 */
export function ConfirmDelete({
  title,
  lines,
  names,
  t,
  onCancel,
  onConfirm,
  confirmLabel = "Delete for good",
  busyLabel = "Deleting…",
}: {
  title: string;
  lines: string[];
  names: string[];
  t: NewSupplierTheme;
  onCancel: () => void;
  /** Resolves to null when done, or to the sentence to show when not. */
  onConfirm: () => Promise<string | null>;
  /** The red button's words, and while it works (cargo tracking's "Remove" for one update, 2026-10-26). */
  confirmLabel?: string;
  busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);
  // Escape answers this window only: caught on the way down, so nothing under it closes too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, busy]);

  const go = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await onConfirm();
    if (answer) {
      setProblem(answer);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ring-1 ${t.card} ${t.ink}`}
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="delete-title" className="text-[16px] font-semibold tracking-tight">
              {title}
            </h2>
            <div id="delete-body" className={`mt-1.5 space-y-1.5 text-[13.5px] leading-relaxed ${t.body2}`}>
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {names.length > 0 && (
              <ul className={`mt-3 space-y-1 rounded-xl px-3 py-2.5 text-[12.5px] font-medium ${t.well}`}>
                {names.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {problem && (
          <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-600">
            {problem}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${t.pill}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Trash2 size={14} aria-hidden="true" />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

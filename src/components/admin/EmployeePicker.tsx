"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface EmployeeChoice {
  id: string;
  name: string;
  /** The figure beside the name: how many of theirs there are to look at here. */
  count: number;
}

/**
 * Employee tasks' employee filter (2026-11-23, the owner: "employees to check filter who is how many duplicates"): a
 * pill saying whose are shown, opening a list of everyone with theirs, the most first, each with how many ("Nagaraj
 * 55"), and Everyone above them. The console's own list, never the browser's select ("the browser's select reads as
 * AI"); drawn over the page (a portal, placed by the pill), so the card it sits in never cuts it off. Arrow keys, Home
 * and End move, Enter picks, Escape or a press elsewhere closes; `data-value` carries the id for tests.
 */
export function EmployeePicker({
  choices,
  value,
  onChange,
  everyone,
  label,
}: {
  choices: EmployeeChoice[];
  /** The employee shown, or null for everyone. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Everyone's figure, beside "Everyone". */
  everyone: number;
  /** What the figures are, for assistive technology ("to check"). */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const rows: (EmployeeChoice & { all?: true })[] = [{ id: "", name: "Everyone", count: everyone, all: true }, ...choices];
  const chosen = value ? choices.find((c) => c.id === value) : null;

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setPlace({ left: Math.max(8, Math.min(r.left, window.innerWidth - 288)), top: r.bottom + 6, maxHeight: Math.max(160, window.innerHeight - r.bottom - 24) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "scroll" && list.current?.contains(e.target as Node)) return;
      if (e.type === "mousedown" && (list.current?.contains(e.target as Node) || button.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (row: (typeof rows)[number]) => {
    setOpen(false);
    button.current?.focus();
    onChange(row.all ? null : row.id);
  };
  const openList = () => {
    setActive(Math.max(0, rows.findIndex((r) => (value ? r.id === value : r.all))));
    setOpen(true);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(rows.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(rows[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Employee: ${chosen ? chosen.name : "everyone"}`}
        data-value={value ?? ""}
        className="inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-full bg-white pl-3.5 pr-2.5 text-[12.5px] font-medium ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.03]"
      >
        <span className="truncate">{chosen ? chosen.name : "Everyone"}</span>
        {chosen && <span className="tabular-nums text-[#86868b]">{chosen.count}</span>}
        <ChevronDown size={14} className={`shrink-0 text-[#86868b] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={`Employees, with how many ${label}`}
            style={{ position: "fixed", left: place.left, top: place.top, maxHeight: Math.min(420, place.maxHeight), zIndex: 160 }}
            className="w-[280px] overflow-y-auto overscroll-contain rounded-xl bg-white p-1 text-[13px] text-[#1d1d1f] shadow-xl ring-1 ring-black/[0.08]"
          >
            {rows.map((row, i) => {
              const selected = row.all ? !value : row.id === value;
              return (
                <li
                  key={row.id || "everyone"}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  data-value={row.id}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 ${i === active ? "bg-black/[0.05]" : ""} ${row.all ? "font-semibold" : ""}`}
                >
                  <Check size={14} className={`shrink-0 ${selected ? "text-[#0058b0]" : "invisible"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className={`tabular-nums ${row.count ? "font-semibold text-amber-800" : "text-[#86868b]"}`} aria-label={`${row.count} ${label}`}>
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

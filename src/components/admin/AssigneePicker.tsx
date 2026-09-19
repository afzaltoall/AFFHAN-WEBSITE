"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, UserCog } from "lucide-react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import type { EmployeeOption, Theme } from "@/components/admin/console-theme";

// Lifted out of AdminConsole when the rotation Queue needed to hand a
// customer over: one picker, so both screens search the same way, place the
// panel the same way, and say the same thing about a lead whose owner has
// since been deactivated.

/** A face, or the initial standing in for one. Shared with the console. */
export function Avatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <span className="flex items-center justify-center rounded-full bg-brand-dark font-semibold uppercase text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name[0]}</span>;
}

/**
 * Hand one lead, or a selection of them, to a member of staff.
 *
 * A portal for the same reason FilterMenu is one: both lists sit inside a card
 * with `overflow-hidden rounded-2xl` for its corners, which clips an
 * absolutely-positioned child — the panel was being cut off at the card's edge.
 *
 * Searchable because the office is not a fixed size, and a first name alone is
 * not always enough to pick between two people; the region rides along with it,
 * so a row reads "Karan — Dubai", the way the team refers to each other.
 */
export function AssigneePicker({
  t, employees, value, onChange, busy = false, label, mixed = false, title,
}: {
  t: Theme;
  employees: EmployeeOption[];
  /** The employee id currently on the row, or null. */
  value: string | null;
  onChange: (employeeId: string | null) => void;
  busy?: boolean;
  /** Overrides the trigger's text — the bulk bar says "Assign N selected". */
  label?: string;
  /**
   * The rows behind this one control do not agree on an assignee — a grouped
   * customer whose products are with different people. Reads as assigned
   * (something is set) without claiming any one of them is it.
   */
  mixed?: boolean;
  /** Overrides the trigger's tooltip, where the row's own wording is better. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const M = 8;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(260, vw - M * 2);
      const left = Math.max(M, Math.min(b.right - width, vw - width - M));
      const below = vh - b.bottom - M * 2;
      const above = b.top - M * 2;
      const flip = below < 240 && above > below;
      setPos(flip
        ? { left, width, bottom: vh - b.top + M, maxHeight: above }
        : { left, width, top: b.bottom + M, maxHeight: below });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = employees.find((e) => e.id === value) ?? null;
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((e) => `${e.name} ${e.region ?? ""}`.toLowerCase().includes(term));
  }, [employees, query]);

  // A lead assigned to somebody since deactivated still has to read as
  // assigned, rather than silently showing "Unassigned" and inviting a second
  // person to pick it up.
  const assignedElsewhere = value !== null && !current;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title ?? (current ? `Assigned to ${current.name}` : value ? "Assigned to a deactivated employee" : "Not assigned to anyone")}
        className={`inline-flex max-w-[13rem] items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          value || mixed ? "bg-brand/10 text-brand-dark hover:bg-brand/20" : `${t.chip} hover:opacity-80`
        }`}
      >
        <UserCog className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {label ?? (current ? `Assigned: ${current.name}` : assignedElsewhere ? "Assigned: (inactive)" : "Unassigned")}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, overflowY: "auto" }}
          className={`z-[200] overflow-hidden rounded-2xl p-1.5 shadow-xl ring-1 ${t.modal}`}
        >
          <p className={`px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>Assign to</p>

          {employees.length > 6 && (
            <div className="px-1 pb-1">
              <div className="relative">
                <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.soft}`} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search staff…"
                  aria-label="Search staff"
                  className={`w-full rounded-xl py-1.5 pl-8 pr-2.5 text-[13px] font-medium outline-none ring-1 ring-transparent focus:ring-brand/40 ${t.input}`}
                />
              </div>
            </div>
          )}

          <button
            role="menuitemradio"
            aria-checked={value === null}
            onClick={() => { onChange(null); setOpen(false); }}
            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${value === null ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${value === null ? "bg-brand" : "bg-slate-300"}`} />
            <span className="flex-1">Unassigned</span>
            {value === null && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>

          {shown.map((e) => {
            const on = value === e.id;
            return (
              <button
                key={e.id}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { onChange(on ? null : e.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${on ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
              >
                <Avatar name={e.name} image={e.image} size={20} />
                <span className="flex-1 truncate">
                  {e.name}
                  {e.region && <span className={`font-normal ${t.soft}`}> — {e.region}</span>}
                </span>
                {on && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}

          {employees.length === 0 && (
            <p className={`px-2.5 py-3 text-[12.5px] ${t.soft}`}>
              No active staff yet. Add somebody under Staff first.
            </p>
          )}
          {employees.length > 0 && shown.length === 0 && (
            <p className={`px-2.5 py-3 text-[12.5px] ${t.soft}`}>Nobody matches that.</p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { Theme } from "@/components/admin/console-theme";
import { roboto } from "@/components/mobile/roboto";

export interface DropdownOption {
  value: string;
  label: string;
  /** A stage's colour, as a dot before its name. */
  dot?: string;
}

/**
 * The cargo sheet's dropdown (2026-10-26). The browser's own list (Windows' square box and bright blue bar, the
 * owner's screenshots: "no perfection on ui") is replaced by one in the sheet's own style: the button like the
 * fields beside it, the list a rounded card with a soft shadow, the hovered row tinted, the chosen one ticked, a
 * stage's colour as a dot.
 *
 * A listbox to assistive technology: the button says what it opens and whether it is open; arrow keys, Home and
 * End move through the options, Enter or Space picks, Escape and Tab put it away; a press anywhere else closes it.
 * The list is drawn over everything (a portal, placed by the button), so a dialog's scrolling body never cuts it
 * off; it opens upwards when there is no room below. `data-value` carries the value for tests.
 */
export function CargoDropdown({
  t,
  dark = false,
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Choose…",
  disabled = false,
  busy = false,
  variant = "field",
}: {
  t: Theme;
  dark?: boolean;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  /** A change on its way: a spinner where the chevron is. */
  busy?: boolean;
  /** "field": a form's, as tall as the inputs; "row": the sheet's, compact, outlined. */
  variant?: "field" | "row";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const chosen = options.find((o) => o.value === value);

  const measure = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 280 && r.top > below;
    setPlace({ left: r.left, width: Math.max(r.width, 200), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const openList = () => {
    if (disabled || busy) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    measure();
    setOpen(true);
  };

  const pick = (o: DropdownOption) => {
    close(true);
    if (o.value !== value) onChange(o.value);
  };

  // Kept beside its button while the page or a dialog scrolls; put away by a press anywhere else.
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target)) close(false);
    };
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      document.removeEventListener("pointerdown", away);
    };
  }, [open, measure, close]);

  // The active option in view as the arrow keys move it.
  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      if (options[active]) pick(options[active]);
    } else if (e.key === "Escape") {
      // The dialog under it stays open: only the list goes.
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") close(false);
    else return;
    e.preventDefault();
  };

  const shape =
    variant === "row"
      ? `h-9 rounded-lg pl-3 pr-2.5 text-[14px] font-medium ring-1 ${t.pill}`
      : `h-10 w-full rounded-xl pl-3 pr-2.5 text-[13px] ${t.input}`;

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        data-value={value}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openList();
          }
        }}
        className={`inline-flex min-w-0 items-center gap-2 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60 ${shape}`}
      >
        {chosen?.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${chosen.dot}`} aria-hidden="true" />}
        <span className={`min-w-0 flex-1 truncate ${chosen ? "" : t.soft}`}>{chosen?.label ?? placeholder}</span>
        {busy ? (
          <Loader2 className={`h-4 w-4 shrink-0 animate-spin ${t.soft}`} aria-hidden="true" />
        ) : (
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.soft}`} aria-hidden="true" />
        )}
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
            onKeyDown={onListKey}
            style={{ position: "fixed", left: place.left, width: place.width, top: place.top, bottom: place.bottom }}
            className={`${roboto.className} z-[300] max-h-72 overflow-y-auto rounded-xl p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)] outline-none ring-1 ${
              dark ? "bg-[#1c1c1e] text-white ring-white/10" : "bg-white text-[#1d1d1f] ring-black/[0.06]"
            }`}
          >
            {options.map((o, i) => {
              const on = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] ${
                    i === active ? (dark ? "bg-white/10" : "bg-[#f1f5f6]") : ""
                  } ${on ? "font-medium" : ""}`}
                >
                  {o.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {on && <Check className="h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

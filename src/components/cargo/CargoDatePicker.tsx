"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { roboto } from "@/components/mobile/roboto";
import { cargoField } from "@/components/cargo/cargo-fields";
import { fmtDay, officeToday } from "@/lib/cargo-shared";

const WEEKDAYS = [
  ["Su", "Sunday"],
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CARD_WIDTH = 296;
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Calendar days as yyyy-mm-dd, counted in UTC: no time zone can move one.
const dayOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const partsOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: m - 1, d };
};
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The same day of another month, or that month's last when it is shorter (31 Jan → 28 Feb). */
const plusMonths = (day: string, n: number) => {
  const { y, m, d } = partsOf(day);
  return dayOf(y, m + n, Math.min(d, new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate()));
};
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const spoken = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/**
 * A day, picked on the sheet's own calendar (2026-10-26). The browser's picker (the owner's screenshot: a square grey
 * box, a bright blue block on the day, arrows pointing up and down) read as another program inside the page; this one
 * is drawn as the sheet's dropdowns are: the field shows the day in words ("13 Oct 2026"), and the month opens under it
 * on a rounded card, today ringed, the chosen day filled.
 *
 * `max` shuts the days after it (an update can't be dated after today); `required` leaves Clear off. Arrow keys move a
 * day or a week, Page Up and Page Down a month (with Shift, a year), Home and End to the week's ends; Enter or Space
 * picks; Escape puts the card away and leaves the form under it open; Tab goes round the card's own buttons.
 * `data-value` and `data-max` carry the values for tests, `data-month` the month shown.
 */
export function CargoDatePicker({
  dark = false,
  value,
  onChange,
  ariaLabel,
  max,
  required = false,
  placeholder = "Choose a date",
}: {
  dark?: boolean;
  /** yyyy-mm-dd, or "" for none. */
  value: string;
  onChange: (day: string) => void;
  ariaLabel: string;
  /** The last day it offers, as yyyy-mm-dd. */
  max?: string;
  /** Always holds a day: no Clear. */
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  /** Set when the day moved by keyboard, or the card opened: focus follows the day. A month arrow keeps its focus. */
  const follow = useRef(false);
  const id = useId();
  const today = officeToday();
  const chosen = isDay(value);
  const clamp = (day: string) => (max && day > max ? max : day);

  const measure = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 390 && r.top > below;
    setPlace({
      left: Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const openCard = () => {
    setActive(clamp(chosen ? value : today));
    follow.current = true;
    measure();
    setOpen(true);
  };

  const pick = (day: string) => {
    if (max && day > max) return;
    close(true);
    if (day !== value) onChange(day);
  };

  // Kept under its field while the page or a dialog scrolls; put away by a press anywhere else.
  useLayoutEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!button.current?.contains(target) && !card.current?.contains(target)) close(false);
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

  useEffect(() => {
    if (!open || !follow.current) return;
    follow.current = false;
    card.current?.querySelector<HTMLButtonElement>(`[data-day="${active}"]:not([data-outside])`)?.focus({ preventScroll: true });
  }, [open, active]);

  const onGridKey = (e: React.KeyboardEvent) => {
    const to = (day: string) => {
      follow.current = true;
      setActive(clamp(day));
    };
    if (e.key === "ArrowLeft") to(plusDays(active, -1));
    else if (e.key === "ArrowRight") to(plusDays(active, 1));
    else if (e.key === "ArrowUp") to(plusDays(active, -7));
    else if (e.key === "ArrowDown") to(plusDays(active, 7));
    else if (e.key === "PageUp") to(plusMonths(active, e.shiftKey ? -12 : -1));
    else if (e.key === "PageDown") to(plusMonths(active, e.shiftKey ? 12 : 1));
    else if (e.key === "Home") to(plusDays(active, -weekdayOf(active)));
    else if (e.key === "End") to(plusDays(active, 6 - weekdayOf(active)));
    else return;
    e.preventDefault();
  };

  const onCardKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // The form under it stays open: only the card goes.
      e.stopPropagation();
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      const stops = [...(card.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])].filter((b) => b.tabIndex >= 0);
      if (stops.length === 0) return;
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      stops[e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length].focus();
    }
  };

  const soft = dark ? "text-[#8a8a8e]" : "text-[#86868b]";
  const { y, m } = partsOf(active || today);
  const month = `${y}-${String(m + 1).padStart(2, "0")}`;
  const lead = weekdayOf(dayOf(y, m, 1));
  // Six weeks always, the neighbouring months' days faint, so the card keeps its height from month to month.
  const days = Array.from({ length: 42 }, (_, i) => dayOf(y, m, i - lead + 1));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const arrow = `flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-dark/60 disabled:cursor-not-allowed disabled:opacity-30 ${
    dark ? "hover:bg-white/10 disabled:hover:bg-transparent" : "hover:bg-black/[0.05] disabled:hover:bg-transparent"
  }`;

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={ariaLabel}
        aria-describedby={`${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-value={value}
        data-max={max}
        onClick={() => (open ? close(false) : openCard())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openCard();
          }
        }}
        className={`inline-flex min-w-0 items-center gap-2 pl-3 pr-2.5 text-left ${cargoField(dark)}`}
      >
        <span id={`${id}-value`} className={`min-w-0 flex-1 truncate tabular-nums ${chosen ? "" : dark ? "text-white/40" : "text-[#a1a1a6]"}`}>
          {chosen ? fmtDay(value) : placeholder}
        </span>
        <CalendarDays className={`h-[18px] w-[18px] shrink-0 ${soft}`} aria-hidden="true" />
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={card}
            role="dialog"
            aria-label={`${ariaLabel}: choose a date`}
            data-datepicker=""
            data-month={month}
            onKeyDown={onCardKey}
            style={{ position: "fixed", left: place.left, top: place.top, bottom: place.bottom, width: CARD_WIDTH }}
            className={`${roboto.className} z-[300] rounded-xl p-3 shadow-[0_12px_32px_rgba(0,0,0,0.14)] ring-1 ${
              dark ? "bg-[#1c1c1e] text-white ring-white/10" : "bg-white text-[#1d1d1f] ring-black/[0.06]"
            }`}
          >
            <div className="mb-1 flex items-center justify-between pl-1.5">
              <p id={`${id}-month`} className="text-[15px] font-semibold">
                {MONTHS[m]} {y}
              </p>
              <div className="flex items-center gap-0.5">
                <button type="button" aria-label="Previous month" onClick={() => setActive(plusMonths(active, -1))} className={arrow}>
                  <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={Boolean(max && dayOf(y, m + 1, 1) > max)}
                  onClick={() => setActive(clamp(plusMonths(active, 1)))}
                  className={arrow}
                >
                  <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>
            </div>
            <table role="grid" aria-labelledby={`${id}-month`} onKeyDown={onGridKey} className="w-full border-collapse">
              <thead>
                <tr>
                  {WEEKDAYS.map(([short, long]) => (
                    <th key={short} scope="col" abbr={long} className={`h-8 text-[12px] font-medium ${soft}`}>
                      {short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]}>
                    {week.map((day) => {
                      const outside = day.slice(0, 7) !== month;
                      const off = Boolean(max && day > max);
                      const on = chosen && day === value;
                      const now = day === today;
                      const look = on
                        ? "bg-brand-dark font-semibold text-white"
                        : off
                          ? `cursor-not-allowed ${dark ? "text-white/20" : "text-[#d1d1d6]"}`
                          : `${
                              now
                                ? `font-semibold ring-1 ring-inset ${dark ? "text-[#7fd8ea] ring-[#7fd8ea]/50" : "text-brand-dark ring-brand-dark/40"}`
                                : outside
                                  ? dark
                                    ? "text-white/35"
                                    : "text-[#aeaeb2]"
                                  : ""
                            } ${dark ? "hover:bg-white/10" : "hover:bg-[#eef3f5]"}`;
                      return (
                        <td key={day} aria-selected={on || undefined} className="p-0.5 text-center">
                          <button
                            type="button"
                            data-day={day}
                            data-outside={outside ? "" : undefined}
                            tabIndex={day === active && !outside ? 0 : -1}
                            disabled={off}
                            aria-label={`${spoken(day)}${now ? ", today" : ""}`}
                            aria-current={now ? "date" : undefined}
                            onClick={() => pick(day)}
                            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[14px] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-dark/70 ${look}`}
                          >
                            {Number(day.slice(8))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={`mt-2 flex items-center justify-between border-t pt-2 ${dark ? "border-white/10" : "border-black/[0.06]"}`}>
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={Boolean(max && today > max)}
                className={`rounded-md px-2.5 py-1.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-dark/60 disabled:opacity-40 ${
                  dark ? "text-[#7fd8ea] hover:bg-white/10" : "text-brand-dark hover:bg-brand-dark/[0.06]"
                }`}
              >
                Today
              </button>
              {!required && chosen && (
                <button
                  type="button"
                  onClick={() => {
                    close(true);
                    onChange("");
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-dark/60 ${soft} ${
                    dark ? "hover:bg-white/10" : "hover:bg-black/[0.04]"
                  }`}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

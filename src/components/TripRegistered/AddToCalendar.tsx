"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus, ChevronDown } from "lucide-react";
import { COUNTDOWN } from "@/components/CinematicExperience/content";
import { TRIP_REGISTERED_HREF } from "@/lib/trip-legal";
import { REGISTERED } from "./content";

const PAGE = `https://affhan.com${TRIP_REGISTERED_HREF}`;
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** The announcement's day in India as a calendar's all-day dates (20261201), and the day after, which ends it. */
function announcementDays(): [string, string] {
  const start = Date.parse(COUNTDOWN.target);
  const ymd = (t: number) => DAY.format(new Date(t)).replace(/-/g, "");
  return [ymd(start), ymd(start + 86_400_000)];
}

/** RFC 5545 text: its four escapes, and lines folded at 73 characters. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const fold = (line: string) => (line.match(/.{1,73}/g) ?? [line]).join("\r\n ");

function icsFile(tripId: string | null) {
  const C = REGISTERED.pool.calendar;
  const [start, end] = announcementDays();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AFFHAN//Free China Business Trip//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // One per person, so adding it again replaces it rather than doubling it.
    `UID:trip-winners-${(tripId ?? "visitor").toLowerCase()}@affhan.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    fold(`SUMMARY:${esc(C.title)}`),
    fold(`DESCRIPTION:${esc(`${C.details(tripId)} ${PAGE}`)}`),
    fold(`URL:${PAGE}`),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/**
 * "Add to calendar", under the countdown: the day the winners are announced
 * (the Terms' date, the countdown's own target), as an all-day event, with
 * the visitor's Trip ID in it when they have one. Two ways, because no one
 * file opens everywhere: Google Calendar's own page, or an .ics file, which
 * Apple's Calendar, Outlook and most others open. Made here, in the browser:
 * nothing is sent anywhere.
 */
export function AddToCalendar({ tripId }: { tripId: string | null }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const C = REGISTERED.pool.calendar;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const [start, end] = announcementDays();
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(C.title)}&dates=${start}/${end}&details=${encodeURIComponent(`${C.details(tripId)} ${PAGE}`)}&ctz=Asia/Kolkata`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([icsFile(tripId)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "affhan-free-china-trip-winners.ics";
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    setOpen(false);
  };

  return (
    <div ref={root} className="tr-cal">
      <button type="button" className="tr-cal-button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <CalendarPlus size={15} strokeWidth={2} aria-hidden />
        {C.button}
        <ChevronDown size={14} strokeWidth={2.2} aria-hidden className={`tr-cal-chev ${open ? "is-open" : ""}`} />
      </button>
      {open && (
        <ul id={menuId} className="tr-cal-menu">
          <li>
            <a href={google} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {C.google}
            </a>
          </li>
          <li>
            <button type="button" onClick={download}>
              {C.file}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { COUNTRIES, flagUrl, type Country } from "@/lib/countries";

// A searchable country / dialing-code dropdown that shows REAL flag images
// (flagcdn.com SVGs) — a native <select> can't render images, and flag emoji
// don't render on Windows, so this custom control is what makes flags work
// everywhere. Two modes:
//   mode="country" — trigger + options show the country name
//   mode="dial"    — trigger shows just the code (compact), options show name + code
interface FlagSelectProps {
  selected: Country | null;
  onSelect: (c: Country) => void;
  mode?: "country" | "dial";
  placeholder?: string;
  countries?: Country[];
  buttonClassName?: string;
  // Which edge the dropdown is anchored to. Use "right" when the trigger sits on
  // the right side of a narrow container (e.g. the phone dial in a modal) so the
  // menu extends inward instead of spilling past the container's right edge.
  align?: "left" | "right";
  // Notified whenever the menu opens/closes, so a parent can hide overlapping
  // chrome (e.g. a fixed "scroll down" cue) while the list is showing.
  onOpenChange?: (open: boolean) => void;
}

// A tiny flag thumbnail. Plain <img> (not next/image) on purpose: these are
// external flagcdn.com SVGs that don't need Next's optimizer / domain config.
const Flag = ({ iso, className = "" }: { iso: string; className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={flagUrl(iso)}
    alt=""
    width={20}
    height={15}
    loading="lazy"
    className={`h-[15px] w-[20px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`}
  />
);

export function FlagSelect({
  selected,
  onSelect,
  mode = "country",
  placeholder = "Select country",
  countries = COUNTRIES,
  buttonClassName = "",
  align = "left",
  onOpenChange,
}: FlagSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    // focus the search box as the menu opens
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.includes(q)
    );
  }, [countries, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 py-2 text-sm text-slate-950 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] ${mode === "dial" ? "gap-1.5 px-2.5" : "gap-2 px-3"} ${buttonClassName}`}
      >
        {selected ? (
          <>
            <Flag iso={selected.iso} />
            <span className={`min-w-0 flex-1 truncate text-left ${mode === "dial" ? "font-semibold" : ""}`}>
              {mode === "dial" ? selected.dial : selected.name}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-slate-400">{placeholder}</span>
        )}
        <ChevronDown size={mode === "dial" ? 13 : 15} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl ring-1 ring-black/5 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-[#27a8c4] focus:ring-2 focus:ring-[#27a8c4]/25"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-slate-400">No matches</li>
            )}
            {filtered.map((c) => {
              const active = selected?.iso === c.iso && selected?.dial === c.dial;
              return (
                <li key={`${c.iso}-${c.dial}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { onSelect(c); setOpen(false); }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${active ? "bg-[#27a8c4]/10 text-[#176579]" : "text-slate-700 hover:bg-slate-50"}`}
                  >
                    <Flag iso={c.iso} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-400">{c.dial}</span>
                    {active && <Check size={15} className="shrink-0 text-[#27a8c4]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

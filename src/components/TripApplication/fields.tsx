"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRIES, flagUrl, type Country } from "@/lib/countries";

/**
 * The application's fields: large, high-contrast, a hairline underline that
 * turns gold on focus (no glow boxes), the label always visible above, and
 * the reason for any problem written underneath and tied to the field with
 * aria-describedby. Nothing here ever uses alert().
 */

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.22em] text-(--cx-mute)";
const LINE =
  "block w-full rounded-none border-0 border-b bg-transparent px-0 text-[18px] text-(--cx-white) caret-(--cx-gold) placeholder:text-(--cx-white)/25 transition-[border-color,box-shadow] duration-300 focus:outline-none md:text-[19px]";
const lineState = (bad: boolean) =>
  bad
    ? "border-(--cx-error) focus:shadow-[inset_0_-1px_0_0_var(--cx-error)]"
    : "border-(--cx-white)/22 hover:border-(--cx-white)/40 focus:border-(--cx-gold) focus:shadow-[inset_0_-1px_0_0_var(--cx-gold)]";

export function Field({ id, label, optional, error, children, hint }: { id: string; label: string; optional?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
        {optional ? <span className="normal-case tracking-normal"> (optional)</span> : <span aria-hidden className="text-(--cx-gold)"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[12px] text-(--cx-mute)">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  maxLength: number;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  required?: boolean;
};

export function TextInput({ id, value, onChange, error, placeholder, maxLength, type = "text", autoComplete, inputMode, required = true }: InputProps) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoComplete={autoComplete}
      inputMode={inputMode}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`${LINE} h-[3.25rem] ${lineState(!!error)}`}
    />
  );
}

export function TextArea({ id, value, onChange, error, placeholder, maxLength, required = true }: InputProps) {
  return (
    <div className="relative">
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${LINE} max-h-48 min-h-[4.75rem] resize-y py-2.5 leading-relaxed ${lineState(!!error)}`}
      />
      <span aria-hidden className="pointer-events-none absolute bottom-2 right-0 text-[11px] tabular-nums text-(--cx-mute)">
        {value.length}/{maxLength}
      </span>
    </div>
  );
}

const Flag = ({ iso }: { iso: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={flagUrl(iso)} alt="" width={22} height={16} loading="lazy" className="h-4 w-[22px] shrink-0 object-cover ring-1 ring-(--cx-white)/15" />
);

/**
 * A searchable country (or dialling-code) picker drawn for this dark page.
 * The site's FlagSelect is a white menu made for the light pages, so this one
 * keeps its behaviour (search by name, code or ISO; arrows, Enter, Escape) and
 * its data and flags, on the film's ground.
 */
function CountryPicker({
  id, mode, value, onPick, invalid, describedBy, placeholder, label,
}: {
  id?: string;
  mode: "country" | "dial";
  value: Country | null;
  onPick: (c: Country) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder: string;
  /** For a picker without a visible label of its own (the dialling code). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.includes(q));
  }, [query]);

  const openMenu = () => {
    const i = value ? COUNTRIES.findIndex((c) => c.iso === value.iso && c.dial === value.dial) : 0;
    setQuery("");
    setActive(Math.max(0, i));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const pick = (c: Country) => {
    onPick(c);
    close(true);
  };

  // Open: search box focused; a click anywhere else closes.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  // The highlighted option stays in view as the arrows move it.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => (open ? close(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ? `${label}${value ? `, ${value.name} ${value.dial}` : ""}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${LINE} flex h-[3.25rem] items-center gap-3 text-left ${lineState(!!invalid)} focus-visible:border-(--cx-gold)`}
      >
        {value ? (
          <>
            <Flag iso={value.iso} />
            <span className="min-w-0 flex-1 truncate">{mode === "dial" ? value.dial : value.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-(--cx-white)/35">{placeholder}</span>
        )}
        <ChevronDown size={16} aria-hidden className={`shrink-0 text-(--cx-mute) transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2.5rem))] border border-(--cx-white)/10 bg-[#0d0c0f] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]">
          <input
            ref={searchRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            aria-label="Search countries"
            value={query}
            placeholder="Search country or code"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (shown[active]) pick(shown[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close(true);
              } else if (e.key === "Tab") {
                close(false);
              }
            }}
            className="h-12 w-full border-0 border-b border-(--cx-white)/10 bg-transparent px-4 text-[15px] text-(--cx-white) caret-(--cx-gold) placeholder:text-(--cx-white)/35 focus:border-(--cx-gold) focus:outline-none"
          />
          <ul ref={listRef} id={listId} role="listbox" aria-label={mode === "dial" ? "Country codes" : "Countries"} className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-4 py-5 text-[14px] text-(--cx-mute)">No matches</li>}
            {shown.map((c, i) => {
              const on = value?.iso === c.iso && value?.dial === c.dial;
              return (
                <li
                  key={`${c.iso}-${c.dial}`}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-[15px] ${i === active ? "bg-(--cx-gold)/12 text-(--cx-white)" : "text-(--cx-white)/80"}`}
                >
                  <Flag iso={c.iso} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-(--cx-mute)">{c.dial}</span>
                  {on && <Check size={15} aria-hidden className="shrink-0 text-(--cx-gold)" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CountryField({ id, value, onChange, error }: { id: string; value: string; onChange: (name: string) => void; error?: string }) {
  const selected = COUNTRIES.find((c) => c.name === value) ?? null;
  return (
    <CountryPicker
      id={id}
      mode="country"
      value={selected}
      onPick={(c) => onChange(c.name)}
      invalid={!!error}
      describedBy={error ? `${id}-error` : undefined}
      placeholder="Select country"
    />
  );
}

export function PhoneField({
  id, iso, dial, number, onDial, onNumber, error,
}: { id: string; iso: string; dial: string; number: string; onDial: (iso: string, dial: string) => void; onNumber: (v: string) => void; error?: string }) {
  const selected = COUNTRIES.find((c) => c.iso === iso && c.dial === dial) ?? null;
  return (
    <div className="flex items-end gap-5">
      <div className="w-[7.5rem] shrink-0">
        <CountryPicker mode="dial" label="Country code" placeholder="Code" value={selected} onPick={(c) => onDial(c.iso, c.dial)} />
      </div>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={18}
        value={number}
        onChange={(e) => onNumber(e.target.value.replace(/\D/g, ""))}
        placeholder="9876543210"
        aria-required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${LINE} h-[3.25rem] min-w-0 flex-1 ${lineState(!!error)}`}
      />
    </div>
  );
}

/**
 * A refined searchable select (combobox): type to narrow, arrows to move,
 * Enter to choose, Escape to close. A short list under the field, never a
 * page-sized card.
 */
export function SearchSelect({
  id, value, options, onChange, error, placeholder,
}: { id: string; value: string; options: readonly string[]; onChange: (v: string) => void; error?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const choose = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-required
        value={open ? query : value}
        placeholder={value || placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(Math.max(0, options.indexOf(value)));
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(shown.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            choose(shown[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${LINE} h-[3.25rem] pr-8 ${lineState(!!error)} ${value && !open ? "" : "placeholder:text-(--cx-white)/35"}`}
      />
      <ChevronDown size={16} aria-hidden className={`pointer-events-none absolute right-0 top-5 text-(--cx-mute) transition-transform ${open ? "rotate-180" : ""}`} />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto border border-(--cx-white)/10 bg-[#0d0c0f] py-1 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]"
        >
          {shown.length === 0 && <li className="px-4 py-3 text-[14px] text-(--cx-mute)">No match. Choose &ldquo;Other&rdquo;.</li>}
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-[15px] ${
                i === active ? "bg-(--cx-gold)/12 text-(--cx-white)" : "text-(--cx-white)/80"
              }`}
            >
              {o}
              {o === value && <Check size={15} className="text-(--cx-gold)" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One choice from a few: a row of pills (radio group). */
export function Pills({
  id, value, options, onChange, error, label,
}: { id: string; value: string; options: readonly string[]; onChange: (v: string) => void; error?: string; label: string }) {
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined} className="grid gap-3">
      <legend className={LABEL}>
        {label}
        <span aria-hidden className="text-(--cx-gold)"> *</span>
      </legend>
      <div className="mt-1 flex flex-wrap gap-2.5">
        {options.map((o, i) => (
          <label key={o} className="group relative cursor-pointer">
            <input
              id={i === 0 ? id : undefined}
              type="radio"
              name={id}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 items-center border border-(--cx-white)/22 px-4 text-[14px] text-(--cx-white) transition-colors duration-300 group-hover:border-(--cx-white)/45 peer-checked:border-(--cx-gold) peer-checked:bg-(--cx-gold) peer-checked:text-(--cx-ink) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-(--cx-white)">
              {o}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Several choices: toggles (aria-pressed), not checkboxes in a card. */
export function Chips({
  id, values, options, onChange, error, label,
}: { id: string; values: string[]; options: readonly string[]; onChange: (v: string[]) => void; error?: string; label: string }) {
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined} className="grid gap-3">
      <p id={`${id}-label`} className={LABEL}>
        {label}
        <span aria-hidden className="text-(--cx-gold)"> *</span>
        <span className="normal-case tracking-normal"> (choose any)</span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o, i) => {
          const on = values.includes(o);
          return (
            <button
              key={o}
              id={i === 0 ? id : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o)}
              className={`inline-flex min-h-11 items-center gap-2 border px-4 text-[14px] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--cx-white) ${
                on ? "border-(--cx-gold) bg-(--cx-gold) text-(--cx-ink)" : "border-(--cx-white)/22 text-(--cx-white) hover:border-(--cx-white)/45"
              }`}
            >
              {on && <Check size={14} aria-hidden />}
              {o}
            </button>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </div>
  );
}

/** Yes / No, as two pills (radio group). */
export function YesNo({ id, value, onChange, error, label }: { id: string; value: boolean | null; onChange: (v: boolean) => void; error?: string; label: string }) {
  return (
    <Pills
      id={id}
      label={label}
      value={value === null ? "" : value ? "Yes" : "No"}
      options={["Yes", "No"]}
      onChange={(v) => onChange(v === "Yes")}
      error={error}
    />
  );
}

export function Consent({ id, checked, onChange, error, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="group flex cursor-pointer items-start gap-3.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-(--cx-white)/35 transition-colors peer-checked:border-(--cx-gold) peer-checked:bg-(--cx-gold) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-(--cx-white)"
        >
          {checked && <Check size={14} className="text-(--cx-ink)" />}
        </span>
        <span className="text-[15px] leading-relaxed text-(--cx-white)/90">{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="pl-8 text-[13px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </div>
  );
}

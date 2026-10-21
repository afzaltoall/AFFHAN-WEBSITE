"use client";

import { useEffect, useRef, useState } from "react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { authFieldError, authLabel, authInput } from "@/components/ui/authFieldStyles";
import { COUNTRIES, type Country } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";

const CHINA = COUNTRIES.find((c) => c.iso === "cn") ?? COUNTRIES[0];

/**
 * The browser's own country ("zh-CN" → China, "en-IN" → India), when it names one we list. "en-US" is no
 * answer: it is the English default of browsers everywhere, and it would open every one of them on +1.
 */
function browserCountry(): Country | null {
  const tags = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const tag of tags) {
    if (/^en-us$/i.test(tag ?? "")) continue;
    const region = /-([A-Za-z]{2})(?:-|$)/.exec(tag ?? "")?.[1]?.toLowerCase();
    const country = region ? COUNTRIES.find((c) => c.iso === region) : undefined;
    if (country) return country;
  }
  return null;
}

/**
 * A mobile number as the customer sign-up takes one (SignupForm): the searchable dial-code picker beside the
 * digits, checked by libphonenumber as a real mobile for the country picked. A saved number opens on its own
 * country; otherwise the browser's country, and China, where most suppliers are, when the browser names none.
 *
 * `onChange` hands back what the server reads: the dial code and the digits, "+8613800138000", or "" while
 * the digits are empty.
 */
export function MobileNumberField({
  id,
  initial,
  onChange,
  onFocus,
  onBlur,
  label = "Mobile number",
}: {
  id: string;
  /** A saved number, in E.164, to open on. */
  initial?: string | null;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  label?: string;
}) {
  const saved = initial ? splitE164(initial) : null;
  const [country, setCountry] = useState<Country>(
    () => (saved && COUNTRIES.find((c) => c.iso === saved.iso && c.dial === saved.dial)) || CHINA,
  );
  const [digits, setDigits] = useState(() => saved?.national ?? "");
  const touched = useRef(Boolean(saved));

  // After the first paint, so the server's HTML and the browser's agree; never over a choice already made.
  useEffect(() => {
    if (touched.current) return;
    const guess = browserCountry();
    if (guess) setCountry(guess);
  }, []);

  const bare = digits.replace(/\D/g, "");
  const bad = bare !== "" && !isValidMobile(bare, country.iso.toUpperCase());

  const emit = (c: Country, typed: string) => {
    const d = typed.replace(/\D/g, "");
    onChange(d ? `${c.dial}${d}` : "");
  };

  return (
    <div>
      <label htmlFor={id} className={authLabel}>
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <div className="w-[6.25rem] shrink-0">
          <FlagSelect
            mode="dial"
            align="left"
            selected={country}
            onSelect={(c) => {
              touched.current = true;
              setCountry(c);
              emit(c, digits);
            }}
            buttonClassName="!h-[46px] sm:!h-[42px] !rounded-xl !bg-white !border-slate-200"
            menuClassName="!w-[15.5rem] [&_ul]:!max-h-56"
          />
        </div>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={country.iso === "cn" ? "138 0013 8000" : country.iso === "in" ? "98765 43210" : "Mobile number"}
          value={digits}
          maxLength={18}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => {
            touched.current = true;
            const typed = e.target.value.replace(/[^\d ]/g, "");
            setDigits(typed);
            emit(country, typed);
          }}
          aria-invalid={bad || undefined}
          className={authInput}
        />
      </div>
      {bad && <span className={authFieldError}>Enter a valid mobile number for {country.name}.</span>}
    </div>
  );
}

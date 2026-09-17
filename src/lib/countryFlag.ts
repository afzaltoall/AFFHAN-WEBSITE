import { COUNTRIES, flagUrl } from "@/lib/countries";

/**
 * Country name (as stored on Inquiry / ContactMessage) -> ISO alpha-2 -> flag.
 *
 * Both tables store the country as a display NAME, not a code, because that is
 * what the public forms submit: FlagSelect hands back a Country and the route
 * persists `country.name`. So anything that wants a flag has to map the name
 * back to an ISO code, and that is all this file is.
 *
 * No new country table. src/lib/countries.ts already holds all 112 with their
 * ISO codes, and a second list would drift from the first the moment either is
 * edited — the same reasoning that put every office address in brand.ts.
 */

const ISO_BY_NAME = new Map<string, string>(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.iso]),
);

/**
 * Spellings that reach the database but are not the canonical list entry.
 *
 * Rows predating the FlagSelect control were typed by hand, and the admin
 * export shows a handful of these. Cheap to absorb here; a missing flag is not
 * worth a data migration.
 */
const ALIASES: Record<string, string> = {
  uk: "gb",
  "u.k.": "gb",
  england: "gb",
  britain: "gb",
  "great britain": "gb",
  usa: "us",
  "u.s.a.": "us",
  "united states of america": "us",
  uae: "ae",
  "u.a.e.": "ae",
  "south korea": "kr",
  "korea, republic of": "kr",
  russia: "ru",
  vietnam: "vn",
  "ivory coast": "ci",
};

/** Lowercase ISO alpha-2 for a stored country name, or null when unrecognised. */
export function countryIso(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return ISO_BY_NAME.get(key) ?? ALIASES[key] ?? null;
}

/** flagcdn SVG for a stored country name, or null when unrecognised. */
export function countryFlagUrl(name: string): string | null {
  const iso = countryIso(name);
  return iso ? flagUrl(iso) : null;
}

/**
 * The flag as a Unicode emoji, built from the two regional-indicator symbols.
 *
 * Exported because it is the obvious thing to reach for, and NOT used by the
 * admin console on purpose: Windows ships no flag glyphs, so every one of
 * these renders as a bare letter pair ("IN", "GB") on the machines this
 * console is actually used from. That is the same reason FlagSelect draws
 * flagcdn SVGs rather than emoji — see the comment at the top of
 * src/components/ui/FlagSelect.tsx.
 *
 * Kept here so that swapping the admin UI to emoji is a one-line change if a
 * future reader decides the trade is worth it on their platform.
 */
export function flagEmoji(name: string): string {
  const iso = countryIso(name);
  if (!iso) return "";
  return String.fromCodePoint(
    ...iso.toUpperCase().split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

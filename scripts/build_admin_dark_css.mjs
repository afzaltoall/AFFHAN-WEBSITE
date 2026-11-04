// Writes src/app/admin/(console)/admin-dark.css: the console's one dark theme (2026-11-04, the owner: "dont give dark or
// white in anything just give overall for everything one ... if change color have to update full"). Every light colour
// class the console's light-only screens use is mapped to the dashboard's own dark palette (AdminConsole's dark theme:
// page #0b0b0c, card #151517, words #f2f2f4, soft #8a8a8e, hairlines white 8%), under html.admin-dark.
//
//   node scripts/build_admin_dark_css.mjs           # write it
//   node scripts/build_admin_dark_css.mjs --check   # exit 1 if the file is not what this table makes
//
// A screen that uses a light colour missing here stays light in the dark theme: add the class to the table.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/app/admin/(console)/admin-dark.css", import.meta.url));
const esc = (cls) => cls.replace(/([\[\]#\/.:%(),!])/g, "\\$1");
const W = (a) => `rgb(255 255 255 / ${a})`;

/** [class, property, value, variant?] — variant "hover" | "focus" | "group-hover" | "placeholder" | "divide" */
const rules = [];
const add = (cls, prop, value, variant) => rules.push({ cls, prop, value, variant });

// ---- surfaces ----
add("bg-white", "background-color", "#151517");
add("bg-white/80", "background-color", "rgb(21 21 23 / 0.8)");
add("bg-white/90", "background-color", "rgb(21 21 23 / 0.9)");
add("bg-white/95", "background-color", "rgb(21 21 23 / 0.95)");
for (const c of ["bg-[#f5f5f7]", "bg-[#f2f2f7]"]) add(c, "background-color", "#0b0b0c");
for (const c of ["bg-[#fafafa]", "bg-[#fbfbfd]", "bg-[#f9f9fb]", "bg-slate-50", "bg-gray-50", "bg-neutral-50"]) add(c, "background-color", "#101012");
for (const c of ["bg-slate-100", "bg-gray-100", "bg-[#f0f0f2]", "bg-[#ececed]", "bg-[#e8e8ed]"]) add(c, "background-color", W(0.08));
for (const c of ["bg-slate-200", "bg-gray-200"]) add(c, "background-color", W(0.12));
// The near-black button: light on dark, its words dark.
add("bg-[#1d1d1f]", "background-color", "#f2f2f4");
add("bg-black", "background-color", "#f2f2f4");
rules.push({ raw: `html.admin-dark ${"." + esc("bg-[#1d1d1f]")}${"." + esc("text-white")}, html.admin-dark ${"." + esc("bg-black")}${"." + esc("text-white")} { color: #0b0b0c; }` });
// What is written white inside it (a tab's count, a choice's hint) goes dark with it, the faded ones faded.
const inverted = [".", esc("bg-[#1d1d1f]")].join("");
rules.push({ raw: `html.admin-dark ${inverted} .${esc("text-white")} { color: #0b0b0c; }` });
rules.push({ raw: `html.admin-dark ${inverted}[class*="text-white/"], html.admin-dark ${inverted} [class*="text-white/"] { color: rgb(11 11 12 / 0.6); }` });
add("hover:bg-black", "background-color", "#ffffff", "hover");
add("hover:bg-[#000]", "background-color", "#ffffff", "hover");
// Washes of black over white become washes of white over black, a little stronger to read the same.
const alphas = { "0.015": 0.025, "0.02": 0.035, "0.025": 0.04, "0.03": 0.05, "0.035": 0.055, "0.04": 0.06, "0.05": 0.08, "0.06": 0.09, "0.07": 0.1, "0.08": 0.11, "0.1": 0.13, "0.12": 0.15 };
for (const [a, d] of Object.entries(alphas)) {
  add(`bg-black/[${a}]`, "background-color", W(d));
  add(`hover:bg-black/[${a}]`, "background-color", W(d + 0.02), "hover");
  add(`group-hover:bg-black/[${a}]`, "background-color", W(d + 0.02), "group-hover");
}
for (const [n, d] of [["5", 0.08], ["10", 0.13]]) {
  add(`bg-black/${n}`, "background-color", W(d));
  add(`hover:bg-black/${n}`, "background-color", W(d + 0.02), "hover");
}
for (const n of ["40", "45", "50", "55", "60"]) add(`bg-black/${n}`, "background-color", "rgb(0 0 0 / 0.7)");
for (const c of ["hover:bg-white", "hover:bg-slate-50", "hover:bg-slate-100", "hover:bg-gray-50", "hover:bg-gray-100", "hover:bg-[#f5f5f7]"]) add(c, "background-color", W(0.07), "hover");
add("focus:bg-white", "background-color", "#151517", "focus");

// ---- words ----
const text = {
  "text-black": "#f2f2f4", "text-[#1d1d1f]": "#f2f2f4", "text-[#1c1c1e]": "#f2f2f4", "text-[#3a3a3c]": "#e5e5e7",
  "text-[#48484a]": "#c7c7cc", "text-[#515154]": "#a1a1a6", "text-[#636366]": "#a1a1a6", "text-[#6e6e73]": "#a1a1a6",
  "text-[#86868b]": "#8a8a8e", "text-[#8e8e93]": "#8a8a8e", "text-[#aeaeb2]": "#6e6e73",
  "text-slate-900": "#f2f2f4", "text-slate-800": "#e5e5e7", "text-slate-700": "#d1d1d6", "text-slate-600": "#a1a1a6",
  "text-slate-500": "#8a8a8e", "text-slate-400": "#6e6e73", "text-gray-900": "#f2f2f4", "text-gray-800": "#e5e5e7",
  "text-gray-700": "#d1d1d6", "text-gray-600": "#a1a1a6", "text-gray-500": "#8a8a8e", "text-gray-400": "#6e6e73",
  // Links and the brand's dark teal, which are too dark to read on black.
  "text-[#0058b0]": "#6cb6ff", "text-[#0071e3]": "#4da3ff", "text-brand-dark": "#7fd8ea", "text-brand-deep": "#9ee3f1",
  // Status words, their light counterparts.
  "text-emerald-900": "#6ee7b7", "text-emerald-800": "#6ee7b7", "text-emerald-700": "#6ee7b7", "text-emerald-600": "#34d399",
  "text-green-700": "#86efac", "text-green-600": "#4ade80",
  "text-red-900": "#fca5a5", "text-red-800": "#fca5a5", "text-red-700": "#fca5a5", "text-red-600": "#f87171",
  "text-rose-700": "#fda4af", "text-rose-600": "#fb7185",
  "text-amber-900": "#fcd34d", "text-amber-800": "#fcd34d", "text-amber-700": "#fcd34d", "text-amber-600": "#fbbf24",
  "text-orange-700": "#fdba74", "text-orange-600": "#fb923c",
  "text-sky-800": "#7dd3fc", "text-sky-700": "#7dd3fc", "text-sky-600": "#38bdf8",
  "text-blue-800": "#93c5fd", "text-blue-700": "#93c5fd", "text-blue-600": "#60a5fa",
  "text-violet-800": "#c4b5fd", "text-violet-700": "#c4b5fd", "text-violet-600": "#a78bfa",
  "text-indigo-700": "#a5b4fc", "text-teal-700": "#5eead4",
};
for (const [c, v] of Object.entries(text)) add(c, "color", v);
for (const c of ["hover:text-[#1d1d1f]", "hover:text-black", "hover:text-slate-900", "hover:text-slate-800", "hover:text-slate-700", "hover:text-gray-900"]) add(c, "color", "#ffffff", "hover");
for (const c of ["hover:text-[#0058b0]", "hover:text-brand-dark", "hover:text-brand-deep"]) add(c, "color", "#9ee3f1", "hover");
for (const c of ["group-hover:text-[#1d1d1f]", "group-hover:text-slate-900"]) add(c, "color", "#ffffff", "group-hover");
add("group-hover:text-[#0058b0]", "color", "#9ee3f1", "group-hover");

// ---- hairlines ----
const border = {
  "border-black/[0.04]": 0.07, "border-black/[0.05]": 0.08, "border-black/[0.06]": 0.08, "border-black/[0.08]": 0.1,
  "border-black/[0.1]": 0.12, "border-black/10": 0.12, "border-black/[0.12]": 0.14, "border-black/15": 0.16, "border-black/20": 0.2,
  "border-slate-100": 0.08, "border-slate-200": 0.1, "border-slate-300": 0.16, "border-gray-100": 0.08, "border-gray-200": 0.1,
  "border-gray-300": 0.16, "border-[#d2d2d7]": 0.16, "border-[#e5e5ea]": 0.1,
};
for (const [c, a] of Object.entries(border)) add(c, "border-color", W(a));
for (const c of ["hover:border-black/20", "hover:border-black/15", "hover:border-slate-300"]) add(c, "border-color", W(0.24), "hover");
const ring = {
  "ring-black/[0.04]": 0.06, "ring-black/[0.05]": 0.07, "ring-black/[0.06]": 0.08, "ring-black/[0.08]": 0.1, "ring-black/[0.1]": 0.12,
  "ring-black/10": 0.12, "ring-black/[0.12]": 0.14, "ring-black/15": 0.16, "ring-black/20": 0.2,
  "ring-slate-100": 0.08, "ring-slate-200": 0.1, "ring-gray-200": 0.1, "ring-white": 0.12,
};
for (const [c, a] of Object.entries(ring)) add(c, "--tw-ring-color", W(a));
for (const c of ["focus:ring-black/[0.08]", "focus:ring-black/10"]) add(c, "--tw-ring-color", W(0.14), "focus");
const divide = { "divide-black/[0.04]": 0.06, "divide-black/[0.05]": 0.07, "divide-black/[0.06]": 0.07, "divide-black/[0.08]": 0.09, "divide-slate-100": 0.07, "divide-slate-200": 0.09, "divide-gray-100": 0.07 };
for (const [c, a] of Object.entries(divide)) add(c, "border-color", W(a), "divide");

// ---- the light screens' own odd colours (found by unmapped.cjs) ----
// Pastel chips (App inquiries' customer stages): a tinted wash on dark, their words in the light tone of the same hue.
for (const [bg, wash, fg, word] of [
  ["bg-[#fff4e5]", "rgb(245 158 11 / 0.16)", "text-[#8a5300]", "#fcd34d"],
  ["bg-[#e8f0fe]", "rgb(59 130 246 / 0.16)", "text-[#1a4fb4]", "#93c5fd"],
  ["bg-[#e6f4ea]", "rgb(34 197 94 / 0.16)", "text-[#1a7f37]", "#86efac"],
  ["bg-[#f3e8ff]", "rgb(168 85 247 / 0.16)", "text-[#6b21a8]", "#d8b4fe"],
]) {
  add(bg, "background-color", wash);
  add(fg, "color", word);
}
for (const c of ["bg-[#f7f7f8]", "bg-[#f1f5f6]"]) add(c, "background-color", W(0.05));
add("hover:bg-[#eef3f5]", "background-color", W(0.07), "hover");
add("hover:bg-red-50", "background-color", "rgb(239 68 68 / 0.12)", "hover");
add("bg-[#f5f5f7]/95", "background-color", "rgb(11 11 12 / 0.95)");
add("bg-[#f5f5f7]/85", "background-color", "rgb(11 11 12 / 0.85)");
add("text-emerald-800/70", "color", "rgb(110 231 183 / 0.7)");
add("hover:text-emerald-900", "color", "#a7f3d0", "hover");
add("text-black/20", "color", W(0.25));
add("ring-[#1d1d1f]", "--tw-ring-color", "#f2f2f4");
add("ring-black/[0.15]", "--tw-ring-color", W(0.16));
add("hover:ring-black/30", "--tw-ring-color", W(0.3), "hover");
add("stroke-black/[0.08]", "stroke", W(0.12));
add("group-hover:border-[#0058b0]", "border-color", "#6cb6ff", "group-hover");
rules.push({ raw: `html.admin-dark .${esc("enabled:hover:bg-black/[0.06]")}:enabled:hover { background-color: ${W(0.09)}; }` });
rules.push({ raw: `html.admin-dark .${esc("enabled:hover:bg-black/[0.03]")}:enabled:hover { background-color: ${W(0.06)}; }` });

// ---- css ----
const sel = (r) => {
  const base = "." + esc(r.cls);
  if (r.variant === "hover") return `html.admin-dark ${base}:hover`;
  if (r.variant === "focus") return `html.admin-dark ${base}:focus`;
  if (r.variant === "group-hover") return `html.admin-dark .group:hover ${base}`;
  if (r.variant === "divide") return `html.admin-dark ${base} > :not(:last-child)`;
  // A surface that must stay white (a photograph's or the logo's plate) says so with keep-white.
  if (r.cls.startsWith("bg-white")) return `html.admin-dark ${base}:not(.keep-white)`;
  return `html.admin-dark ${base}`;
};
let css = `/*
 * The console's one dark theme, for every screen (2026-11-04, the owner: "dont give dark or white in anything just give
 * overall for everything one ... if change color have to update full"). The switch is in the account menu; the
 * choice is useAdminDark's, and AdminFrame (with the console layout's first-paint script) puts html.admin-dark on.
 *
 * The screens drawn with a dark theme of their own (the dashboard, the supplier books, Videos) keep it: they no longer
 * use these light classes when dark. Every other screen is drawn light, and these rules turn its light colours into
 * the same palette (AdminConsole's dark theme), so the whole console changes at once, and a screen added tomorrow
 * changes with it. GENERATED by scripts/build_admin_dark_css.mjs from one table: add a colour there and run it;
 * never edit this file by hand.
 *
 * On screen only: a printed sheet stays black on white. Unlayered, so these win over Tailwind's layered utilities
 * whatever their order; hover and focus rules are one class more specific than the colours they replace.
 */
@media screen {
  html.admin-dark { color-scheme: dark; }
  html.admin-dark body { background-color: #0b0b0c; }
`;
for (const r of rules) {
  if (r.raw) {
    css += `  ${r.raw}\n`;
    continue;
  }
  const decl = r.prop === "--tw-ring-color" ? `--tw-ring-color: ${r.value};` : `${r.prop}: ${r.value};`;
  css += `  ${sel(r)} { ${decl} }\n`;
}
css += `  /* The logo is navy on nothing (a transparent PNG): on dark it sits on white, as on the sign-in pages. Last, so it
     wins over the surface it is on. */\n`;
css += `  html.admin-dark .logo-plate { background-color: #ffffff; }\n`;
css += `}\n`;
if (process.argv.includes("--check")) {
  // Line endings aside (git may check the file out with CRLF).
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").split(String.fromCharCode(13)).join("") : "";
  if (now !== css) {
    console.error("admin-dark.css is not what scripts/build_admin_dark_css.mjs makes: run it");
    process.exit(1);
  }
  console.log(`admin-dark.css is up to date (${rules.length} rules)`);
} else {
  fs.writeFileSync(OUT, css);
  console.log(`admin-dark.css: ${rules.length} rules, ${css.length} bytes`);
}

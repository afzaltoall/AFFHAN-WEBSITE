/**
 * The console's own type and colour, in one place the workspace can share.
 *
 * The staff workspace and /admin are two doors into one CRM, and until now they
 * did not look like it: the console is Apple-grey (#f5f5f7 behind #1d1d1f text,
 * hairline rings rather than borders, 13px rows) and the workspace was Tailwind
 * slate at default weights. Same data, different product.
 *
 * These are the same values AdminConsole builds its light theme from. They are
 * copied rather than imported because that theme is a runtime object with a
 * dark half, built inside a 3,000-line client component; what the workspace
 * needs is the vocabulary, not the machinery.
 */
export const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
} as const;

export const wt = {
  page: "bg-[#f5f5f7] text-[#1d1d1f]",
  card: "bg-white shadow-sm ring-1 ring-black/[0.04]",
  soft: "text-[#86868b]",
  mid: "text-[#48484a]",
  strong: "text-[#1d1d1f]",
  border: "border-black/[0.06]",
  hover: "hover:bg-black/[0.015]",
  navIdle: "text-[#515154] hover:bg-black/[0.03]",
  navActive: "bg-[#ececed] text-[#1d1d1f]",
  input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]",
  pill: "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]",
  chip: "bg-black/[0.06] text-[#86868b]",
  thumb: "bg-[#f5f5f7]",
} as const;

/** A row in the rail — the console's sidebar geometry. */
export const sideRow =
  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-colors";

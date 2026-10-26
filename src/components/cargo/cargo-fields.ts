/**
 * How the cargo forms' fields look (2026-10-26, the owner on New consignment: "make the font perfect, feels weak").
 * The console's grey wells under grey 13px names read washed out; these are white and outlined, in 14px of the
 * sheet's ink, each named above in near-black, as Alibaba's forms are. One look for the text boxes, the dropdowns and
 * the date picker, light and dark. Padding is left to each field, which knows its icons.
 */

/** A text box, or a dropdown's or the date picker's button: 40px tall, outlined, the brand's ring while in use. */
export const cargoField = (dark: boolean) =>
  `h-10 w-full rounded-lg text-[14px] outline-none ring-1 transition-shadow focus:ring-2 aria-expanded:ring-2 ${
    dark
      ? "bg-white/[0.04] text-white ring-white/[0.16] placeholder:text-white/40 hover:ring-white/30 focus:ring-brand/70 aria-expanded:ring-brand/70"
      : "bg-white text-[#1d1d1f] ring-black/[0.15] placeholder:text-[#a1a1a6] hover:ring-black/30 focus:ring-brand-dark/60 aria-expanded:ring-brand-dark/60"
  }`;

/** A field's name, above it. */
export const cargoLabel = (dark: boolean) => `mb-1.5 block text-[13.5px] font-medium ${dark ? "text-[#d1d1d6]" : "text-[#3a3a3c]"}`;

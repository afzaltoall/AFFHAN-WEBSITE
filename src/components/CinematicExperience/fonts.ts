import { Bodoni_Moda } from "next/font/google";

/**
 * The film's display face: a high-contrast Didone, for the editorial titles and
 * the FREE reveal. Body copy, labels and the form stay in the site's own Plus
 * Jakarta Sans, so the page still reads as Affhan.
 *
 * Variable, so one file covers every weight; the optical-size axis draws finer
 * hairlines at display sizes. Loaded by this route only.
 */
export const displayFont = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cx-display",
  axes: ["opsz"],
});

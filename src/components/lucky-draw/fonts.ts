import { Jost } from "next/font/google";

/**
 * The lucky draw screen's sans (the owner, 2026-11-10: "fonts are very important ... Ballon d'Or feel"): Jost, a
 * geometric face in the line of Futura, for the screen's words in spaced capitals (the round, the seat, Draw) beside
 * the trip's Didone for names (CinematicExperience/fonts.ts). Variable, one file for every weight; loaded by the TV
 * page only.
 */
export const drawSans = Jost({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ld-sans",
});

import { Roboto } from "next/font/google";

/**
 * Alibaba's own type on its phone screens, which My AFFHAN and its Settings follow (the owner, 2026-10-15: the
 * fonts "perfect same as alibaba"). Measured from the owner's screenshots of m.alibaba.com, by ink width and
 * weight against Roboto drawn at the same scale: bold for the title (15.5px) and the name (17.5px), regular for
 * the rows and Sign out (15px). Only the pages that import it load it; the rest of the site keeps its own face.
 */
export const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });

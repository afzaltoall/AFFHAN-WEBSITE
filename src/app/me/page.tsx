import type { Metadata } from "next";
import { MyAffhanMenu } from "@/components/mobile/MyAffhanMenu";

/**
 * The phone frame's Account tab: who is signed in (or the way to sign in), a buyer's own pages, and the
 * rest of AFFHAN (components/mobile/MyAffhanMenu.tsx). Open to everyone, unlike /account/, which sends a
 * visitor who is not signed in to the sign-in page. A menu, not content: nothing here for a search engine.
 */
export const metadata: Metadata = {
  title: "Account | AFFHAN",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://affhan.com/me/" },
};

export default function MePage() {
  return <MyAffhanMenu />;
}

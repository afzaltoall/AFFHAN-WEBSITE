import type { Metadata } from "next";
import { MyAffhanSettings } from "@/components/mobile/MyAffhanMenu";

/** The Account tab's Settings: the policies, and signing out (components/mobile/MyAffhanMenu.tsx). */
export const metadata: Metadata = {
  title: "Settings | AFFHAN",
  robots: { index: false, follow: true },
  alternates: { canonical: "https://affhan.com/me/settings/" },
};

export default function MeSettingsPage() {
  return <MyAffhanSettings />;
}

import type { Metadata } from "next";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { DrawScreen } from "@/components/lucky-draw/DrawScreen";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { TRIP_FACTS } from "@/lib/trip-legal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lucky draw · AFFHAN",
  robots: { index: false, follow: false },
};

/**
 * The Free China Trip's lucky draw on the television (components/lucky-draw/DrawScreen.tsx), opened from the console's
 * Free China Trip → Lucky draw → "Open the TV screen" with ?mode=live or ?mode=rehearsal. Outside the console's own
 * layout on purpose: no rail, and none of its thirty-minute session's countdown, which on a TV between two draws would
 * be the screen stuck in front of the room. It draws on a pass of its own (lib/server/draw-screen.ts); without one it
 * says where it opens from, and shows nothing else.
 */
export default async function DrawScreenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  return (
    <main className={displayFont.variable}>
      <DrawScreen mode={isDrawMode(mode) ? mode : null} closes={TRIP_FACTS.applicationsClose} />
    </main>
  );
}

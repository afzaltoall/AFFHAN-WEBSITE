# /free-china-trip/ — the cinematic page

An opening count (00 → 100, on every load), a single scroll-driven film
(chapters 01–11), then How it works, the host's call to action (14–15) and a
live countdown to the winners' announcement on 1 December (16), where the
page ends: no footer, on the owner's request. Route:
`src/app/free-china-trip/page.tsx`.

Each pinned stage dissolves as it lets go (the film into How it works, How
it works into the call), and no stage clips or glows to a straight edge, so
the page reads as one continuous sky. How it works is composed on the
centre of the screen; the call keeps its host on the left and the offer by
his open hand (the owner's choice: it was centred once, and put back).

Every "Apply for the Trip" (hero, film readout, final call, countdown) first
asks for the trip's Terms & Conditions and Privacy Policy, in a popup
(`components/TripLegal/ConsentGate.tsx`); agreed, it opens the application,
its own page: `/free-china-trip/apply/` (`components/TripApplication/`),
through a gold and silk transition (`goApply` in `CinematicExperience.tsx`).

## The terms

The trip has its own Terms & Conditions (17 clauses) and Privacy Policy (17
sections): the owner's revised text of 2026-10-01, word for word, in
`src/lib/trip-legal.ts`. They are published at `/free-china-trip/terms/` and
`/free-china-trip/privacy/` (`components/TripLegal/`), and they are **not**
the website's `/terms-conditions/` and `/privacy-policy/`, which are the
main site's and are untouched. Every place that shows them reads that one
file: the two pages, the popup, the dates in How it works, the countdown,
and the application's three consents. This page does not set the terms out
itself: on the owner's request (2026-10-01) its Terms & Conditions section
(13) came out, and every "Apply for the Trip" shows them, whole, in the
popup instead.

| File | What it holds |
| --- | --- |
| `content.ts` | **Every word on the page.** Swap copy here; no animation code changes. |
| `animations.ts` | Every scroll timeline: the film, How it works, the final CTA, the sky. Positions are scroll distances. |
| `assets.ts` | The 14 pictures (`public/free-china-trip/`), and the points inside them the choreography aims at. |
| `NumberLoadingOpener.tsx` | The opening count: CSS-driven from the first frame, finished by script. |
| `Scene01Opening.tsx` … `Scene16Countdown.tsx` | One file per scene: markup only (the countdown also keeps its own clock). There is no 13: the terms section came out. |
| `Motifs.tsx` | The red silk and gold trail layers that recur through the film, and the atmosphere. |
| `warp.ts`, `WarpToFoshan.tsx` | The jump from Guangzhou to Foshan: gold streaks out of a vanishing point, drawn from the film's progress (scrolls back too), and the coordinates readout. |
| `particles.ts`, `GoldDust.tsx` | The FREE particles (scroll-driven, no loop) and the ambient gold dust (on screen only). |
| `cinematic.css` | Palette tokens, the opening's CSS entrance, masks and gradients. Scoped to `.cx`. |

## Must be settled before launch

1. **The boarding-pass artwork (`03-boarding-pass`) prints a flight number,
   CA528, and a date, 18 OCT 2024**, twice. Both are baked into the
   flattened image, and the date is in the past. They read as the trip's
   flight and date, which nobody has confirmed. The artwork needs to be
   regenerated without them.
2. **When the application accepts applications.** The Terms open
   applications on 5 October 2026 and close them on 25 November 2026
   (clause 1), but the application takes one whenever it is sent. Whether it
   should refuse them outside those dates is the owner's call; nothing
   enforces the dates yet.
3. **The host (`14-host-presenter`) is uncaptioned on purpose.** No name or
   title was supplied. If Affhan wants him named, add it to `FINAL_CTA` in
   `content.ts` and render it in `Scene14FinalCta.tsx`.

## Worth confirming

- **The two cities** (Guangzhou, then Foshan) appear as a travel montage.
  The page never says the trip visits them, because the itinerary is not
  confirmed. If it does visit them, that can be said. On 2026-10-01, on the
  owner's request, Shanghai and Beijing came out, so Guangzhou is the first
  city, and Foshan (the owner's picture of its furniture market) replaced
  Yiwu as the arrival. The China map still marks Beijing, Shanghai and Yiwu,
  and not Foshan, because that is the artwork.
- **The countdown** (`COUNTDOWN` in `content.ts`) runs to 1 December 2026,
  midnight IST: the day the Terms announce the winners (clause 4). At zero it
  rests at 00 00 00 00.
- **What's included** follows the Terms: an economy-class flight (clause
  7), group transportation (8), group or shared accommodation (9) and group
  business guidance (12). The fourth row was "China Trip Experience", a
  placeholder, until the Terms said what it is. The homepage banner's
  "Business visits & meetings" and "Guided support" now match clauses 8 and
  12.
- **The application's own placeholders** (interest categories, travel
  documents) are listed in `components/TripApplication/README.md`.
- **The hero line** ("Your round-trip flight, hotel stay and local transport in
  China, covered.") restates three confirmed inclusions and adds nothing.

## Where applications go

To `/free-china-trip/apply/`, which posts to `POST /api/trip-applications/`:
each one is stored in the `TripApplication` table with a reference number
(`TRIP-26-00001`) and the applicant's customer number, and shown to the team
at **Admin → Leads → Trip applications**.

## Pictures

`public/free-china-trip/`, WebP, each at full size and as a `-960` phone
copy chosen by `srcset` (the opening picture also at 1200px, for 2x phones):
3.2 MB and 1.4 MB for the two sets, from 25 MB of
PNG. The source PNGs are not shipped. Only the opening picture loads with the
page; the rest are fed in after load, in film order (`CinematicExperience.tsx`).
To replace a picture, keep its file name and update `w`/`h` in `assets.ts`;
if its subject moves, update `ANCHORS` there too.

## Reduced motion

With `prefers-reduced-motion: reduce`: no smooth scrolling, no entrances, no
parallax, travel, zoom or blur. Each chapter dissolves to the next at its
resting composition; the host simply fades in where he stands. Every word
and every call to action are unchanged; the countdown's figures change in
place (no roll, no wind-up) and the Apply transition is a plain fade.

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
`/free-china-trip/privacy/` (`components/TripLegal/`), which end with the
document and no site footer (the owner's request, 2026-10-02), and they are **not**
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
| `mapNetwork.ts`, `mapLight.ts` | The China map's market network (its routes, pins and names, read off the artwork, and the order they light in) and its light: the map arrives at night and lights up out from Guangzhou, drawn by WebGL from the film's progress (scrolls back too). |
| `particles.ts`, `GoldDust.tsx` | The FREE particles (scroll-driven, no loop) and the ambient gold dust (on screen only). |
| `cinematic.css` | Palette tokens, the opening's CSS entrance, masks and gradients. Scoped to `.cx`. |
| `clockSound.ts` | The countdown, heard: the owner's tick and tock, scheduled on the audio clock for each second as it turns (Scene16's speaker, top right). |

## Must be settled before launch

1. **The boarding-pass artwork (`03-boarding-pass`) prints a flight, CA528,
   a date, 1 DEC 2026, gate A7 and seat 24A** on both tickets, baked into
   the flattened image. 1 December 2026 is when the Terms announce the
   winners (clause 4), not a travel date (the Terms leave that to be
   announced to the winners), but on a boarding pass it reads as the
   flight's date. The owner's version of 2026-10-02 flies Chennai to
   Guangzhou (it was Shanghai), but the skyline on its stub is still
   Shanghai's: the tower with two spheres is the Oriental Pearl Tower, not
   Guangzhou's Canton Tower. The passport picture (`02-passport`) still
   prints SHANGHAI on the passes tucked into it.
2. **The host (`14-host-presenter`) is uncaptioned on purpose.** No name or
   title was supplied. If Affhan wants him named, add it to `FINAL_CTA` in
   `content.ts` and render it in `Scene14FinalCta.tsx`.

## Worth confirming

- **The two cities** (Guangzhou, then Foshan) appear as a travel montage.
  The page never says the trip visits them, because the itinerary is not
  confirmed. If it does visit them, that can be said. On 2026-10-01, on the
  owner's request, Shanghai and Beijing came out, so Guangzhou is the first
  city, and Foshan (the owner's picture of its furniture market) replaced
  Yiwu as the arrival.
- **The market map** (since 2026-10-05, the owner's "Red-Gold China Market
  Map") names six markets on routes from the two cities: Shaxi, Baima and
  New Asia from Guangzhou; Louvre, Shunde and Sunlink from Foshan. The Terms
  say markets will be visited as part of the group itinerary (clause 8) but
  leave the itinerary itself to be announced (clause 1), so a visitor may
  read these six as the plan. It is a diagram, not geography: Guangzhou is
  drawn mid-country (it is on the south coast, with Foshan beside it) and
  the markets are spread across China. The artwork sets the market names in
  lower case ("shaxi market"), except New Asia.
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
(`TRIP-26-00001`, the applicant's Trip ID), their account and their customer
number, and shown to the team at **Admin → Free China Trip → Participants**.
Only a signed-in account can apply, and only from 5 October to 25 November
2026 (Terms, clause 1): a production build refuses an application outside
those dates (`applicationWindow` in `src/lib/trip-application.ts`); a
development server always takes one.

## Pictures

`public/free-china-trip/`, WebP, each at full size and as a `-960` phone
copy chosen by `srcset` (the opening picture also at 1200px, for 2x phones):
3.1 MB and 1.4 MB for the two sets, from 25 MB of
PNG. The source PNGs are not shipped. Only the opening picture loads with the
page; the rest are fed in after load, in film order (`CinematicExperience.tsx`).
To replace a picture, keep its file name and update `w`/`h` in `assets.ts`;
if its subject moves, update `ANCHORS` there too.

The boarding pass (`03-boarding-pass`) is made from the owner's `BOARDING
PASS.png` fitted into the place the first ticket took in the 1600 x 903
frame, so the film's framing never changes with it (the version of
2026-10-02: scaled 0.876, at 102, 53). It carries a third file,
`03-boarding-pass-plane.webp` (1.8 KB): the little plane printed on its
route, lifted off the paper so the film can fly it to CHN (`PASS_PLANE`, and
the route's three points in `ANCHORS`). A new pass needs both remade.

The two planes are one flight (owner's request, 2026-10-05: the plane's
position jumped and the flight stopped and started). The little printed
plane gathers speed along the route and takes off at the dot before CHN; the
airliner is born there in a flash of gold, at the little plane's size and
heading and at its speed (worked out on every screen from where the pass
and the plane really are: `PASS_PLANE.body`, `PLANE_PARTS.axis`). From
there it flies one smooth curve to the end of chapter 04 (`animations.ts`,
THE FLIGHT): it climbs out towards the camera as the pass falls away beneath
it, the camera rides alongside while the climb reads out, and it pulls away
past the globe, never stopping on the way.

The China map (`06-china-map`) is built, with the field its light is drawn
from, by `node scripts/build_trip_map.mjs` from the owner's `Red-Gold China
Market Map.png` (330 KB and 150 KB, and the field 62 KB, lossless: when
each pixel lights). The light follows the artwork's own routes, pins and
names, read off it into `mapNetwork.ts`, so a new map needs its points
re-read there and the script run again; the dive into Guangzhou aims at
`ANCHORS.mapGuangzhou`. The light is drawn only with WebGL: without it, or
until its field has loaded, the map is simply the picture, as printed.

The plane (`04-airplane`) has its working parts read off it into
`PLANE_PARTS` (`assets.ts`): its two fan faces (ellipses fitted to the dark
discs in the intakes) and where its lights are. While it is on screen its
engines turn, its navigation lights burn (red on the near wing, green on the
far one), its wingtip strobes double-flash and its belly beacon pulses, in
real time (`cinematic.css`), and under the caption the climb reads out,
altitude and speed, with the scroll. A new plane picture needs its parts
re-read.

## The clock's sound

`public/free-china-trip/16-clock-ticks.wav` (62 KB) is cut from the owner's
recording, `time-sound.mp3` (16.6 s, kept as the source and not shipped):
the tick at 0.785 s and the tock at 1.765 s, about a third of a second each,
raised together to a 0.89 peak with soft fades. Looping the recording would
drift (its ticks fall 975 to 1025 ms apart), so each sound is scheduled for
the moment its second turns. The sound is on by default; the speaker in the
countdown's top-right corner turns it off (it has no words; "Clock sound" is
its name for screen readers), and "off" is remembered on that browser. A
browser lets a page make sound only once it has had a click, tap or key press
(a scroll is not one): with one already, the clock is heard as it assembles;
without, the speaker shows on and waiting, and the first click, tap or key
press anywhere (the speaker included) starts it. Only while the clock is on
screen, never under the Apply popup, never past zero.

## Reduced motion

With `prefers-reduced-motion: reduce`: no smooth scrolling, no entrances, no
parallax, travel, zoom or blur. Each chapter dissolves to the next at its
resting composition; the host simply fades in where he stands, the
China map is lit from the start, as printed, and the plane's engines and
lights hold still (its navigation lights stay on, and the climb's readout
shows cruise). Every word
and every call to action are unchanged; the countdown's figures change in
place (no roll, no wind-up) and the Apply transition is a plain fade.

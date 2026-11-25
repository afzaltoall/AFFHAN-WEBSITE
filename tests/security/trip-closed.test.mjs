// The Free China Business Trip once applications close (2026-11-25, the owner: "the china trip page have to lock and
// show the only ui is timer only to december 1 winner announce ... auto change to lock ... if anyone click china page
// it have to show december 1 winner announce of the timer"). The door (src/proxy.ts) turns every trip page into the
// countdown from the first moment after 25 November, IST, for everyone; the Terms and Privacy Policy stay readable; a
// page left open turns into it by itself; the homepage's button says what a press shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const raw = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("applications close at the first moment after 25 November, IST, and the clock counts to 1 December, midnight IST", () => {
  assert.match(read("src/lib/trip-application.ts"), /closes: Date\.parse\("2026-11-26T00:00:00\+05:30"\)/);
  assert.match(read("src/components/CinematicExperience/content.ts"), /target: "2026-12-01T00:00:00\+05:30"/);
});

test("closed, the door shows every trip page as the countdown, to everyone, before the lock and before an employee's link", () => {
  const door = read("src/proxy.ts");
  const fn = door.slice(door.indexOf("export async function proxy("));
  const closed = fn.indexOf('if (applicationWindow() === "closed") {');
  assert.ok(closed > 0, "the door asks whether applications are closed");
  for (const later of ['searchParams.has("ref")', "if (isAdmin(request)) return NextResponse.next();", "await isLocked(request)"]) {
    assert.ok(fn.indexOf(later) > closed, `closed is decided before ${later}`);
  }
  const block = fn.slice(closed, fn.indexOf("return res;", closed));
  assert.match(block, /if \(FILE\.test\(pathname\) \|\| LEGAL\.test\(pathname\)\) return NextResponse\.next\(\);/);
  assert.match(block, /url\.pathname = CLOSED;\s*const res = NextResponse\.rewrite\(url\);/, "a rewrite: the address stays the one asked for");
  assert.match(block, /res\.headers\.set\("Cache-Control", "private, no-store"\);/);
  assert.match(block, /res\.headers\.set\("X-Robots-Tag", "noindex"\);/);
  assert.match(block, /res\.headers\.set\("X-Trip-Closed", "closed"\);/);
  assert.doesNotMatch(block, /isAdmin/, "an admin sees it too");
  assert.match(door, /const CLOSED = `\$\{TRIP\}\/closed\/`;/);
  // Only the Terms and the Privacy Policy stay readable.
  const legal = new RegExp(/const LEGAL = \/(.*)\/;/.exec(door)[1]);
  for (const p of ["/free-china-trip/terms/", "/free-china-trip/privacy/", "/free-china-trip/terms"]) assert.ok(legal.test(p), `${p} stays readable`);
  for (const p of ["/free-china-trip/", "/free-china-trip/apply/", "/free-china-trip/registered/", "/free-china-trip/locked/", "/free-china-trip/terms-and-more/", "/free-china-trip/apply/terms/"]) {
    assert.ok(!legal.test(p), `${p} is the countdown`);
  }
  // Before then its address is the trip's, but for an admin (and a development server).
  assert.match(fn, /if \(pathname\.startsWith\(`\$\{TRIP\}\/closed`\) && process\.env\.NODE_ENV === "production" && !isAdmin\(request\)\) \{\s*return NextResponse\.redirect\(new URL\(`\$\{TRIP\}\/`, request\.url\)\);/);
});

test("the countdown page: the clock to the winners and nothing else of the trip, never indexed", () => {
  const page = read("src/app/free-china-trip/closed/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.match(page, /<TripClosedExperience \/>/);
  const ui = read("src/components/TripAccess/TripClosedExperience.tsx");
  // A clock face a unit (the owner: "show like a clock style of ui animative"): the days of the wait, 24 hours, 60
  // minutes, 60 seconds.
  assert.match(ui, /<Dial value=\{left\.d\} max=\{Math\.max\(DAYS_ON_THE_DIAL, left\.d\)\}/);
  assert.match(ui, /<Dial value=\{left\.h\} max=\{24\}/);
  assert.match(ui, /<Dial value=\{left\.m\} max=\{60\}/);
  assert.match(ui, /<Dial value=\{left\.s\} max=\{60\}/);
  assert.match(ui, /const DAYS_ON_THE_DIAL = Math\.round\(\(Date\.parse\(COUNTDOWN\.target\) - APPLICATION_WINDOW\.closes\) \/ 86_400_000\);/);
  assert.match(ui, /<div data-cx="cd-unit" className="tcl-dial">/, "the speaker finds a face on screen");
  assert.match(ui, /<ClockSoundToggle label=\{COUNTDOWN\.sound\} \/>/);
  assert.match(ui, /data-cx-countdown/, "the speaker finds the clock");
  assert.doesNotMatch(ui, /ApplyButton|\/free-china-trip\/apply|TRIP_APPLY_HREF|referenceNo|useTripStatus/, "no application, no boarding pass");
  const words = read("src/components/TripAccess/content.ts");
  assert.match(words, /export const TRIP_CLOSED = \{\s*eyebrow: "Winners announced",\s*title: TRIP_FACTS\.winnersAnnounced,/);
  assert.match(words, /closed: `Applications for the Free China Business Trip closed on \$\{TRIP_FACTS\.applicationsClose\}\. Thank you to everyone who applied\.`/);
  // Four faces in a row; two by two on a phone.
  const css = raw("src/components/TripAccess/trip-closed.css");
  assert.match(css, /\.tcl-dials \{\s*--dial: clamp\(132px, 12\.6vw, 248px\);\s*display: grid;\s*grid-template-columns: repeat\(4, var\(--dial\)\);/);
  assert.match(css, /@media \(max-width: 639px\) \{\s*\.tcl-dials \{ --dial: min\(41vw, 190px\); grid-template-columns: repeat\(2, var\(--dial\)\);/);
});

test("a trip page left open turns into the countdown by itself, only once the door says so", () => {
  const watch = read("src/components/TripAccess/TripCloseWatch.tsx");
  assert.match(watch, /if \(process\.env\.NODE_ENV !== "production"\) return;/);
  assert.match(watch, /const left = APPLICATION_WINDOW\.closes - Date\.now\(\);/);
  assert.match(watch, /fetch\(window\.location\.href, \{ method: "HEAD", cache: "no-store", credentials: "same-origin" \}\)/);
  assert.match(watch, /closed = res\.headers\.get\("x-trip-closed"\) === "closed";/);
  assert.equal(watch.match(/window\.location\.reload\(\)/g).length, 1);
  assert.match(watch, /if \(closed\) \{\s*window\.location\.reload\(\);/);
  for (const p of ["src/app/free-china-trip/page.tsx", "src/app/free-china-trip/apply/page.tsx", "src/app/free-china-trip/registered/page.tsx", "src/app/free-china-trip/locked/page.tsx"]) {
    assert.match(read(p), /<TripCloseWatch \/>/, `${p} watches`);
  }
});

test("the homepage's trip button, once closed, says a press shows the countdown, to everyone", () => {
  const call = read("src/components/ui/TripCall.tsx");
  const closed = call.indexOf('if (win === "closed") {');
  assert.ok(closed > 0 && closed < call.indexOf("} else if (registered) {"), "closed is decided before a boarding pass");
  assert.match(call, /label = <>\{verb\} to see the countdown<\/>;/);
  assert.match(call, /status = `Applications closed \$\{dayMonth\(TRIP_FACTS\.applicationsClose\)\} · Winners \$\{dayMonth\(TRIP_FACTS\.winnersAnnounced\)\}`;/);
});

test("the console shows the countdown ahead of time, to an admin, as a computer and a phone show it", () => {
  // The owner: "in admin give access to see the preview of clock time before 11.59 pm".
  const rail = read("src/components/admin/rail-sections.ts");
  assert.match(rail, /\{ key: "trip-countdown", href: "\/admin\/trip-countdown\/", label: "Countdown", icon: Timer \}/);
  const page = read("src/app/admin/(console)/trip-countdown/page.tsx");
  assert.match(page, /if \(!admin\) redirect\("\/admin\/login"\);\s*if \(admin\.role !== "admin"\) redirect\("\/"\);/);
  const preview = read("src/components/admin/TripCountdownPreview.tsx");
  assert.match(preview, /const PAGE = "\/free-china-trip\/closed\/";/);
  assert.match(preview, /<Frame label="Computer" width=\{1440\} height=\{900\}/);
  assert.match(preview, /<Frame label="Phone" width=\{390\} height=\{844\}/);
  // Framed by the console itself: the site allows its own pages in frames, nobody else's.
  assert.match(raw("next.config.ts"), /key: "X-Frame-Options",\s*value: "SAMEORIGIN",/);
});

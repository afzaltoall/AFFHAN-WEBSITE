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
  assert.match(ui, /<Unit value=\{left\.d\} digits=\{dayDigits\} label=\{dL\} motion=\{motion\} \/>/);
  assert.match(ui, /<Unit value=\{left\.s\} digits=\{2\} label=\{sL\} motion=\{motion\} ring \/>/);
  assert.match(ui, /<ClockSoundToggle label=\{COUNTDOWN\.sound\} \/>/);
  assert.match(ui, /data-cx-countdown/, "the speaker finds the clock");
  assert.doesNotMatch(ui, /ApplyButton|\/free-china-trip\/apply|TRIP_APPLY_HREF|referenceNo|useTripStatus/, "no application, no boarding pass");
  const words = read("src/components/TripAccess/content.ts");
  assert.match(words, /export const TRIP_CLOSED = \{\s*eyebrow: "Winners announced",\s*title: TRIP_FACTS\.winnersAnnounced,/);
  assert.match(words, /closed: `Applications for the Free China Business Trip closed on \$\{TRIP_FACTS\.applicationsClose\}\. Thank you to everyone who applied\.`/);
  // The film's clock units wait hidden for its scroll; on this page they are shown.
  assert.match(raw("src/components/TripAccess/trip-closed.css"), /\.cx \.tcl \[data-cx-hide\] \{\s*visibility: visible;\s*opacity: 1;\s*\}/);
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

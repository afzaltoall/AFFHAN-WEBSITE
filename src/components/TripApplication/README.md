# TripApplication — `/free-china-trip/apply/`

The application for the Free China Business Trip, built as the next chapter of
the landing page's film (`components/CinematicExperience/`), not as a form page.

```
computer:  intro ──Start──▶ [agree] ──▶ 01 ⇄ 02 ⇄ 03 ⇄ 04 ──Submit──▶ sending ──▶ received
phone:                      [agree] ──▶ 01 ⇄ 02 ⇄ 03 ⇄ 04 ──Submit──▶ sending ──▶ received
                                                                         └──▶ failed ──▶ try again | review
```

**No account is needed** (the owner, 2026-10-28: "remove the login to enter for
the china free trip page"). Someone signed in has their details filled in, and
the application is their account's too. Someone who is not passes Cloudflare's
check (Turnstile, interaction-only: out of sight unless Cloudflare wants them to
do something, then under the buttons), and Submit waits for it. The API asks for
it only when no session came with the application, so the app, which always
sends its session, is never asked. Recorded, the application's id is kept in a
signed cookie on the browser that sent it (`affhan_trip`,
`lib/trip-applicant.ts`), so that browser is shown its own boarding pass from
then on (`/api/trip-applications/me/` reads the account or the cookie).

**[agree]** is the consent popup (`components/TripLegal/ConsentGate.tsx`): the
trip's Terms & Conditions and Privacy Policy, whole, and two of the three
consents. On a computer it opens from every "Apply for the Trip" on the landing
page and, for anyone who arrives here without having agreed, from Start.
Agreeing ticks those two boxes on the review; the third (the information is
accurate) is ticked there, at the end, where it can be true.

**On a phone** (below 768px) there is no intro (the owner, 2026-10-28: "dont
show start application"): "Free China Trip" opens the application with the
popup's phone sheet over it, and agreeing opens the first question ("terms and
conditions aduthu dha step 1", the same day); the landing page's "Apply for the
Trip" asks in the same sheet before its take-off, and the first question then
opens at once. Closing the sheet leaves the application: back where the visitor
came from in the site, or to the trip's page. Outside the application window the
intro still says when applications open, or that they closed.

| File | What it is |
|---|---|
| `ApplyExperience.tsx` | Orchestrator: the phases, every GSAP timeline, focus and announcements, Cloudflare's check |
| `useApplication.ts` | The one state object `{ personal, business, travel, consent }` |
| `ApplicationIntro.tsx` | The chapter opening on a computer (never the form); outside the application window, when applications open or that they closed |
| `StepAboutYou` … `StepReview` | One component per step |
| `StepScroll.tsx` | The questions' own scrolling area on the one fixed screen |
| `StepIndicator.tsx`, `StepNav.tsx` | 01 ─── 04 progress, and ← Back / Next → / Submit (disabled, with the reason, until it can be sent) |
| `fields.tsx` | The inputs, the dark country and dial-code picker, pills, choice cards, consent |
| `Atmosphere.tsx` | Chapter backgrounds, gold dust, the silk and light-trail motifs, the host |
| `SubmitStage.tsx` | The submit sequence, the success screen and the failure panel |
| `submitApplication.ts` | The only way an application leaves the browser |
| `content.ts` | Every word on the page |

Stored by `POST /api/trip-applications/` in the `TripApplication` table (reference
`TRIP-YY-00001`), shown to the team in the admin console. The table's reference
number draws from a Postgres sequence that Prisma does not create:
`node scripts/create_trip_ref_seq.mjs` once, before the `prisma db push` that
creates the table.

## The four steps

1. **About you** — full name, mobile (with its dial code), country and city
   (email and website or LinkedIn taken out on 2026-10-29).
2. **Your business journey** — "What best describes you?" first, then only the
   questions that answer asks (`BUSINESS_FIELDS` in `lib/trip-application.ts`):
   - *I currently run a business*: company name, role, category;
   - *I am planning to start a business*: nothing more. A click or a tap on it
     turns the page to step 03 (back to the review, when editing), as Next
     does. The arrow keys only choose: the keyboard goes on with Next.

   Nobody needs a business to apply, and a hidden question is never required.
   Changing the answer keeps what was typed for the other one, out of sight (a
   slip onto "planning" turns the page, so it must cost nothing), but only the
   chosen answer's questions are reviewed, sent and stored (`relevantBusiness`),
   as `businessStatus`: `existing_business` or `planning_business`.
3. **Travel profile** — nationality, a valid passport (yes / no), and the note that passport and visa documents may be
   requested from selected applicants later.
4. **Review & submit** — three blocks with Edit, then the three consents.

Until 2026-10-28 there were five: a **Business profile** step (interests,
products of interest, what they hoped to explore) came third, and the business
journey also asked **About your business**. The owner took both out ("we don't
need those details"). Their columns stay in the table for the applications that
answered them, which the console still shows; new applications leave them empty
(`interests` an empty list, `productsOfInterest` an empty string, as the columns
require). The API drops them if an older form still sends them.

The same day the business journey lost two of its four options, *I am looking
to expand an existing business* and *I don't have a business yet — I'm
exploring opportunities*, and every question but a company's name, role and
category: a company's website and years in business; for "planning" a business
or brand name, a category or area, what they plan to build and a website; for
"exploring" an area of interest and what they would like to explore in China
("from now on dont ask these question"). Earlier applications keep them: the
console still names and filters the two journeys taken out
(`RETIRED_BUSINESS_STATUSES`) and shows those answers where they were given.
The API drops the answers if an older page sends them, and asks a page opened
before the change that sends a journey taken out to choose again.

## Placeholders — replace before launch

1. **Business categories** — `BUSINESS_CATEGORIES` in `lib/trip-application.ts`
   is a working list, not a business-approved one.
2. **Step 03 documents** — visa status, passport number, passport expiry and
   passport upload are all switched **off** in `TRAVEL_DOCUMENTS`: the Terms and
   the Privacy Policy say they are asked for later, from selected applicants,
   only where needed. Only switch one on with storage, masking and retention
   rules for passport data (none exist yet). The review must then show them as
   "Provided" or masked (`********1234`), never in full, and they must never be
   written to the browser or a URL.

## Rules this page keeps

- **One fixed screen.** The page never scrolls: the progress and the step's
  heading stay at the top, Back and Next at the bottom, and only the questions
  between them scroll (`StepScroll`), on a pane of frosted glass that keeps the
  form legible over the sky.
- On a computer the intro always plays first, whether the visitor came through
  the landing page's transition or opened this address directly. On a phone the
  first question does, out of the take-off's light when the visitor came
  through it.
- Back never erases; Next validates only the questions shown; Edit on the
  review returns to the step and "Save & return to review" brings the
  applicant back.
- Only steps 01–02 are kept as a draft, in `sessionStorage` (this tab, this
  session). Step 03 and the consents live in memory only, and so does the
  popup's agreement (`TripLegal/approval.ts`): a reload asks again. Nothing
  goes to `localStorage` or into a URL. Nothing is logged.
- **Privacy & Consent** is the trip's three boxes, in the owner's words and
  order (`TRIP_CONSENTS` in `lib/trip-legal.ts`), linking to the trip's own
  `/free-china-trip/privacy/` and `/free-china-trip/terms/`, never the main
  site's. All three are required, by the form and by the API, and each is
  recorded on its own (`consentPrivacy`, `consentAccuracy`, `consentTerms`).
  The mobile app's older form sends no `privacy`; for it, the API reads its
  terms box (which names both documents) as both.
- **Submit** stays disabled, with the reason beside it, until every answer, the
  three boxes and (for someone not signed in) Cloudflare's check are in, and
  while the application is being sent; a second press can never send it twice.
- **The application window** (Terms, clause 1): on a production build,
  applications are taken from 12 October to 25 November 2026, India time, by the
  browser (the intro says when they open, or that they closed) and by the API.
  A development server is always open, so the form can be tried before then.
- **One application per person** (Terms, clause 2): the API refuses a second
  one from the same account or mobile number (unless the team
  deleted the first), and says so.
- **No scoring.** Nothing here scores, ranks or orders applicants. The answers
  are for administering the application; the five winners are drawn at random
  from the eligible applications (Terms, clause 3).
- Success is shown only after the server confirms it. If it is slow, the clock
  keeps turning with "Processing your application".
- A failed submission keeps every answer; **Try again** resends (not offered
  when sending again could only be refused again), **Review your answers**
  lifts the overlay.
- Reduced motion keeps every screen and function, with fades for movement.

## Trying it without writing to the database

Set `NEXT_PUBLIC_TRIP_APPLICATION_MOCK=on` for a build: submissions then wait
1.4s and succeed with no reference number (so a demo can't look recorded).

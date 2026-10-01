# TripApplication — `/free-china-trip/apply/`

The application for the Free China Business Trip, built as the next chapter of
the landing page's film (`components/CinematicExperience/`), not as a form page.

```
intro ──Start──▶ [agree] ──▶ 01 ⇄ 02 ⇄ 03 ⇄ 04 ⇄ 05 ──Submit──▶ sending ──▶ received
                                                                   └──▶ failed ──▶ try again | review
```

**[agree]** is the consent popup (`components/TripLegal/ConsentGate.tsx`): the
trip's Terms & Conditions and Privacy Policy, whole, and two of the three
consents. It opens from every "Apply for the Trip" on the landing page and,
for anyone who arrives here without having agreed, from Start. Agreeing ticks
those two boxes on the review; the third (the information is accurate) is
ticked there, at the end, where it can be true.

| File | What it is |
|---|---|
| `ApplyExperience.tsx` | Orchestrator: the phases, every GSAP timeline, focus and announcements |
| `useApplication.ts` | The one state object `{ personal, business, profile, travel, consent }` |
| `ApplicationIntro.tsx` | The chapter opening (never the form); outside the application window, when applications open or that they closed |
| `StepAboutYou` … `StepReview` | One component per step |
| `StepScroll.tsx` | The questions' own scrolling area on the one fixed screen |
| `StepIndicator.tsx`, `StepNav.tsx` | 01 ─── 05 progress, and ← Back / Next → / Submit (disabled, with the reason, until it can be sent) |
| `fields.tsx` | The inputs, the dark country and dial-code picker, pills, choice cards, chips, consent |
| `Atmosphere.tsx` | Chapter backgrounds, gold dust, the silk and light-trail motifs, the host |
| `SubmitStage.tsx` | The submit sequence, the success screen and the failure panel |
| `submitApplication.ts` | The only way an application leaves the browser |
| `content.ts` | Every word on the page |

Stored by `POST /api/trip-applications/` in the `TripApplication` table (reference
`TRIP-YY-00001`), shown to the team in the admin console. The table's reference
number draws from a Postgres sequence that Prisma does not create:
`node scripts/create_trip_ref_seq.mjs` once, before the `prisma db push` that
creates the table.

## The five steps

1. **About you** — full name, email, mobile (with its dial code), country, city,
   website or LinkedIn (optional).
2. **Your business journey** — "What best describes you?" first, then only the
   questions that answer asks (`BUSINESS_FIELDS` in `lib/trip-application.ts`):
   - *I currently run a business* / *I am looking to expand an existing business*:
     company name, role, category, website (optional), years in business, about
     the business;
   - *I am planning to start a business*: business / brand name (optional),
     category / area, what they plan to build, website (optional);
   - *I don't have a business yet — I'm exploring opportunities*: area of
     interest, what they would like to explore in China, website / LinkedIn
     (optional; the same answer as step 01's).

   Nobody needs a business to apply. A hidden question is never required, and
   changing the answer clears only what the new one does not ask; the shared
   answers (a company or brand name, a category, a website) are kept. Only the
   chosen answer's questions are reviewed, sent and stored (`relevantBusiness`),
   stored as `businessStatus`: `existing_business`, `planning_business`,
   `expanding_business` or `no_business_yet`.
3. **Business profile** — what they are interested in (any of the list), the
   products or categories of interest, and what they hope to explore (optional).
   For everyone, with a business or without one.
4. **Travel profile** — nationality, a valid passport (yes / no), been to China
   before (yes / no), and the note that passport and visa documents may be
   requested from selected applicants later.
5. **Review & submit** — four blocks with Edit, then the three consents.

## Placeholders — replace before launch

1. **Step 03 interests** — `INTERESTS` in `lib/trip-application.ts` (Sourcing,
   Suppliers, Manufacturing, New Products, Packaging, Market Exploration, Other)
   is a working list, not a business-approved one.
2. **Business categories** — `BUSINESS_CATEGORIES` in the same file, likewise
   (also the list "Area of interest" offers).
3. **Step 04 documents** — visa status, passport number, passport expiry and
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
- The intro always plays first, whether the visitor came through the landing
  page's transition or opened this address directly.
- Back never erases; Next validates only the questions shown; Edit on the
  review returns to the step and "Save & return to review" brings the
  applicant back.
- Only steps 01–03 are kept as a draft, in `sessionStorage` (this tab, this
  session). Step 04 and the consents live in memory only, and so does the
  popup's agreement (`TripLegal/approval.ts`): a reload asks again. Nothing
  goes to `localStorage` or into a URL. Nothing is logged.
- **Privacy & Consent** is the trip's three boxes, in the owner's words and
  order (`TRIP_CONSENTS` in `lib/trip-legal.ts`), linking to the trip's own
  `/free-china-trip/privacy/` and `/free-china-trip/terms/`, never the main
  site's. All three are required, by the form and by the API, and each is
  recorded on its own (`consentPrivacy`, `consentAccuracy`, `consentTerms`).
  The mobile app's older form sends no `privacy`; for it, the API reads its
  terms box (which names both documents) as both.
- **Submit** stays disabled, with the reason beside it, until every answer and
  the three boxes are in, and while the application is being sent; a second
  press can never send it twice.
- **The application window** (Terms, clause 1): on a production build,
  applications are taken from 5 October to 25 November 2026, India time, by the
  browser (the intro says when they open, or that they closed) and by the API.
  A development server is always open, so the form can be tried before then.
- **One application per person** (Terms, clause 2): the API refuses a second
  one from the same email address or mobile number (unless the team deleted
  the first), and says so.
- **No scoring.** Nothing here scores, ranks or orders applicants. The answers
  are for administering the application; the five winners are drawn at random
  from the eligible applications (Terms, clause 3).
- Success is shown only after the server confirms it. If it is slow, the orbit
  keeps turning with "Recording your application".
- A failed submission keeps every answer; **Try again** resends (not offered
  when sending again could only be refused again), **Review your answers**
  lifts the overlay.
- Reduced motion keeps every screen and function, with fades for movement.

## Trying it without writing to the database

Set `NEXT_PUBLIC_TRIP_APPLICATION_MOCK=on` for a build: submissions then wait
1.4s and succeed with no reference number (so a demo can't look recorded).

# TripApplication — `/free-china-trip/apply/`

The application for the Free China Business Trip, built as the next chapter of
the landing page's film (`components/CinematicExperience/`), not as a form page.

```
intro ──Start──▶ [agree] ──▶ 01 ⇄ 02 ⇄ 03 ⇄ 04 ⇄ 05 ──Submit──▶ sending ──▶ received
                                                                   └──▶ failed ──▶ try again | review
```

**[agree]** is the consent popup (`components/TripLegal/ConsentGate.tsx`): the
trip's Terms & Conditions and Privacy Policy, whole, and two of the three
consents. It opens from the landing page's "Apply for the Trip" and, for
anyone who arrives here without having agreed, from Start. Agreeing ticks
those two boxes on the review; the third (the information is accurate) is
ticked there, at the end, where it can be true.

| File | What it is |
|---|---|
| `ApplyExperience.tsx` | Orchestrator: the phases, every GSAP timeline, focus and announcements |
| `useApplication.ts` | The one state object `{ personal, business, profile, travel, consent }` |
| `ApplicationIntro.tsx` | The chapter opening (never the form) |
| `StepAboutYou` … `StepReview` | One component per step |
| `StepIndicator.tsx`, `StepNav.tsx` | 01 ─── 05 progress, and ← Back / Continue → / Submit |
| `fields.tsx` | The inputs, the dark country and dial-code picker, pills, chips, consent |
| `Atmosphere.tsx` | Chapter backgrounds, gold dust, the silk and light-trail motifs, the host |
| `SubmitStage.tsx` | The submit sequence, the success screen and the failure panel |
| `submitApplication.ts` | The only way an application leaves the browser |
| `content.ts` | Every word on the page |

Stored by `POST /api/trip-applications/` in the `TripApplication` table (reference
`TRIP-YY-00001`), shown to the team at **Admin → Leads → Trip applications**.

## Placeholders — replace before launch

1. **Step 03 interests** — `INTERESTS` in `lib/trip-application.ts` (Sourcing,
   Suppliers, Manufacturing, New Products, Packaging, Market Exploration, Other)
   is a working list, not a business-approved one.
2. **Business categories** — `BUSINESS_CATEGORIES` in the same file, likewise.
3. **Step 04 documents** — visa status, passport number, passport expiry and
   passport upload are all switched **off** in `TRAVEL_DOCUMENTS`, because the
   trip's process has not confirmed it needs them. Only switch one on with
   storage, masking and retention rules for passport data (none exist yet). The
   review must then show them as "Provided" or masked (`********1234`), never in
   full, and they must never be written to the browser or a URL.
4. **Copy** — the intro, step ledes and success/failure lines in `content.ts`
   follow the brief. They promise nothing about selection, dates, visas, hotels,
   flights or outcomes; keep it that way.
5. **Company website** is optional (the brief listed it without saying); many
   small businesses have none. Make it required in `validateStep` if wanted.

## Rules this page keeps

- The intro always plays first, whether the visitor came through the landing
  page's transition or opened this address directly.
- Back never erases; Continue validates; Edit on the review returns to the step
  and "Save & return to review" brings the applicant back.
- Only steps 01–03 are kept as a draft, in `sessionStorage` (this tab, this
  session). Step 04 and the consents live in memory only, and so does the
  popup's agreement (`TripLegal/approval.ts`): a reload asks again. Nothing
  goes to `localStorage` or into a URL. Nothing is logged.
- **Privacy & Consent** is the trip's three boxes, in the owner's words and
  order (`TRIP_CONSENTS` in `lib/trip-legal.ts`), linking to the trip's own
  `/free-china-trip/privacy/` and `/free-china-trip/terms/`, never the main
  site's. All three are required, by the form and by the API. Unticking the
  Privacy Policy or the Terms takes the popup's agreement back. The mobile
  app's older form sends no `privacy`; for it, the API reads its terms box
  (which names both documents) as both. The table records `consentTerms` for
  the two together.
- Success is shown only after the server confirms it. If it is slow, the orbit
  keeps turning with "Recording your application".
- A failed submission keeps every answer; **Try again** resends, **Review your
  answers** lifts the overlay.
- Reduced motion keeps every screen and function, with fades for movement.

## Trying it without writing to the database

Set `NEXT_PUBLIC_TRIP_APPLICATION_MOCK=on` for a build: submissions then wait
1.4s and succeed with no reference number (so a demo can't look recorded).

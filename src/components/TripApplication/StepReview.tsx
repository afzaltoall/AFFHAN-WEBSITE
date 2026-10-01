import type { ReactNode } from "react";
import { DISPLAY } from "@/components/CinematicExperience/parts";
import { businessStatusBrief, relevantBusiness } from "@/lib/trip-application";
import { TRIP_CONSENTS, TRIP_PRIVACY_HREF, TRIP_TERMS_HREF } from "@/lib/trip-legal";
import { LABELS, REVIEW, STEPS } from "./content";
import { Consent } from "./fields";
import type { ApplicationApi } from "./useApplication";

/**
 * Step 05, Review & submit: the whole application on one screen, like the
 * details on a ticket. Four blocks in a 2 × 2 grid (one per step, each with
 * an Edit link back to it), the answers set as a few lines of flowing text
 * rather than a tall list of labels, then Privacy & Consent and Submit.
 *
 * Step 02's block shows the business journey chosen and only the answers that
 * choice asks (relevantBusiness): the same lines the application sends.
 *
 * Privacy & Consent is the trip's three boxes, in the owner's words
 * (lib/trip-legal.ts). The Privacy Policy and Terms & Conditions boxes arrive
 * ticked: the applicant accepted both in the popup before the application
 * started. The accuracy box is ticked here, at the end, where it can be true.
 *
 * Nothing sensitive is collected (no passport number, expiry or document:
 * see TRAVEL_DOCUMENTS), so the travel block shows plain Yes/No. If those
 * questions are ever switched on, show them here as "Provided" or masked
 * (********1234), never in full.
 */
export function StepReview({ app, onEdit }: { app: ApplicationApi; onEdit: (step: number) => void }) {
  const { personal: p, profile: f, travel: t, consent: c } = app.state;
  const b = relevantBusiness(app.state.business);
  const e = app.errors;
  const yesNo = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
  const setConsent = (patch: Partial<typeof c>) => app.update("consent", patch);
  const join = (parts: string[], sep = " · ") => parts.filter(Boolean).join(sep);
  const status = businessStatusBrief(b.businessStatus);
  const company = b.businessStatus === "existing_business" || b.businessStatus === "expanding_business";

  return (
    <div className="grid gap-7">
      <div className="grid gap-x-7 gap-y-6 sm:grid-cols-2">
        <Block index={0} title={REVIEW.groups.personal} onEdit={onEdit} lead={p.fullName}>
          <Line>{p.email}</Line>
          <Line>{p.phone ? `${p.phoneCode} ${p.phone}` : ""}</Line>
          <Line>{join([p.city, p.country], ", ")}</Line>
          <Line muted>{p.profileUrl}</Line>
        </Block>
        <Block index={1} title={REVIEW.groups.business} onEdit={onEdit} lead={status}>
          {company && (
            <>
              <Line>{b.companyName}</Line>
              <Line>{join([b.role, b.businessCategory])}</Line>
              <Line>{b.yearsInBusiness ? `${b.yearsInBusiness} ${REVIEW.brief.inBusiness}` : ""}</Line>
              <Line muted>{b.companyWebsite}</Line>
              <Line muted clamp>{b.businessDescription}</Line>
            </>
          )}
          {b.businessStatus === "planning_business" && (
            <>
              <Line>{join([b.companyName, b.businessCategory])}</Line>
              <Line muted clamp>{b.businessPlan}</Line>
              <Line muted>{b.companyWebsite}</Line>
            </>
          )}
          {b.businessStatus === "no_business_yet" && (
            <>
              <Line>{b.areaOfInterest ? `${REVIEW.brief.area}: ${b.areaOfInterest}` : ""}</Line>
              <Line muted clamp>{b.exploreGoal}</Line>
              <Line muted>{p.profileUrl}</Line>
            </>
          )}
        </Block>
        <Block index={2} title={REVIEW.groups.profile} onEdit={onEdit} lead={join(f.interests)}>
          <Line>{f.productsOfInterest}</Line>
          <Line muted clamp>{f.exploreNotes}</Line>
        </Block>
        <Block index={3} title={REVIEW.groups.travel} onEdit={onEdit} lead={t.nationality ? `${LABELS.nationality}: ${t.nationality}` : ""}>
          <Line>{t.hasPassport === null ? "" : `${REVIEW.brief.passport}: ${yesNo(t.hasPassport)}`}</Line>
          <Line>{t.travelledToChina === null ? "" : `${REVIEW.brief.travelled}: ${yesNo(t.travelledToChina)}`}</Line>
        </Block>
      </div>

      <section aria-labelledby="ax-consent-title" className="grid gap-3.5 border-t border-(--cx-white)/10 pt-5">
        <h3 id="ax-consent-title" className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--cx-gold)">
          {TRIP_CONSENTS.heading}
        </h3>
        <Consent id="ax-privacy" checked={c.privacy} onChange={(v) => setConsent({ privacy: v })} error={e.privacy}>
          {TRIP_CONSENTS.privacy.before}
          <Legal href={TRIP_PRIVACY_HREF}>{TRIP_CONSENTS.privacy.link}</Legal>
          {TRIP_CONSENTS.privacy.after}
        </Consent>
        <Consent id="ax-accuracy" checked={c.accuracy} onChange={(v) => setConsent({ accuracy: v })} error={e.accuracy}>
          {TRIP_CONSENTS.accuracy}
        </Consent>
        <Consent id="ax-terms" checked={c.terms} onChange={(v) => setConsent({ terms: v })} error={e.terms}>
          {TRIP_CONSENTS.terms.before}
          <Legal href={TRIP_TERMS_HREF}>{TRIP_CONSENTS.terms.link}</Legal>
          {TRIP_CONSENTS.terms.after}
        </Consent>
      </section>
    </div>
  );
}

/** One step's answers: its number, title and Edit, then its first answer in full weight and the rest as lines. */
function Block({ index, title, onEdit, lead, children }: { index: number; title: string; onEdit: (step: number) => void; lead: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`ax-review-${index}`} className="min-w-0 border-t border-(--cx-white)/12 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`ax-review-${index}`} className="flex min-w-0 items-baseline gap-2.5">
          <span className="text-[11px] font-semibold tabular-nums tracking-[0.24em] text-(--cx-gold)">{STEPS[index].number}</span>
          <span className={`${DISPLAY} min-w-0 text-balance text-[19px] leading-[1.05] text-(--cx-white)`}>{title}</span>
        </h3>
        <button
          type="button"
          onClick={() => onEdit(index)}
          className="min-h-9 shrink-0 px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-(--cx-gold) underline-offset-[6px] transition-colors hover:text-(--cx-gold-hi) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white)"
        >
          {REVIEW.edit}
          <span className="sr-only"> {title}</span>
        </button>
      </div>
      <div className="mt-1.5 grid gap-1 text-[14px] leading-snug">
        <p className={`break-words font-semibold ${lead ? "text-(--cx-white)" : "text-(--cx-white)/35"}`}>{lead || REVIEW.notGiven}</p>
        {children}
      </div>
    </section>
  );
}

/** One answer as a line; nothing at all when it was left empty (it was optional). */
function Line({ children, muted = false, clamp = false }: { children: string; muted?: boolean; clamp?: boolean }) {
  if (!children) return null;
  return <p className={`break-words ${muted ? "text-(--cx-mute)" : "text-(--cx-white)/82"} ${clamp ? "line-clamp-2" : ""}`}>{children}</p>;
}

/** The trip's own legal pages, in a new tab so the application isn't lost. */
function Legal({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="text-(--cx-gold) underline decoration-(--cx-gold)/40 underline-offset-4 transition-colors hover:decoration-(--cx-gold) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white)"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

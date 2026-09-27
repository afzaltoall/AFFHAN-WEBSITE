import type { ReactNode } from "react";
import { DISPLAY } from "@/components/CinematicExperience/parts";
import { LABELS, REVIEW, STEPS } from "./content";
import { Consent } from "./fields";
import type { ApplicationApi } from "./useApplication";

/**
 * Step 05, Review & submit: the whole application on one screen, like the
 * details on a ticket. Four blocks in a 2 × 2 grid (one per step, each with
 * an Edit link back to it), the answers set as a few lines of flowing text
 * rather than a tall list of labels, then the two consents and Submit. It
 * used to run 1,550px tall, far below the fold; now the page stays still.
 *
 * Nothing sensitive is collected (no passport number, expiry or document:
 * see TRAVEL_DOCUMENTS), so the travel block shows plain Yes/No. If those
 * questions are ever switched on, show them here as "Provided" or masked
 * (********1234), never in full.
 */
export function StepReview({ app, onEdit }: { app: ApplicationApi; onEdit: (step: number) => void }) {
  const { personal: p, business: b, profile: f, travel: t, consent: c } = app.state;
  const e = app.errors;
  const yesNo = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
  const setConsent = (patch: Partial<typeof c>) => app.update("consent", patch);
  const join = (parts: string[], sep = " · ") => parts.filter(Boolean).join(sep);

  return (
    <div className="grid gap-7">
      <div className="grid gap-x-7 gap-y-6 sm:grid-cols-2">
        <Block index={0} title={REVIEW.groups.personal} onEdit={onEdit} lead={p.fullName}>
          <Line>{p.email}</Line>
          <Line>{p.phone ? `${p.phoneCode} ${p.phone}` : ""}</Line>
          <Line>{join([p.city, p.country], ", ")}</Line>
          <Line muted>{p.profileUrl}</Line>
        </Block>
        <Block index={1} title={REVIEW.groups.business} onEdit={onEdit} lead={b.companyName}>
          <Line>{join([b.role, b.businessCategory])}</Line>
          <Line>{b.yearsInBusiness ? `${b.yearsInBusiness} ${REVIEW.brief.inBusiness}` : ""}</Line>
          <Line muted>{b.companyWebsite}</Line>
          <Line muted clamp>{b.businessDescription}</Line>
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

      <div className="grid gap-3.5 border-t border-(--cx-white)/10 pt-5">
        <Consent id="ax-accuracy" checked={c.accuracy} onChange={(v) => setConsent({ accuracy: v })} error={e.accuracy}>
          {REVIEW.accuracy}
        </Consent>
        <Consent id="ax-terms" checked={c.terms} onChange={(v) => setConsent({ terms: v })} error={e.terms}>
          {REVIEW.termsBefore} <Legal href={REVIEW.terms.href}>{REVIEW.terms.label}</Legal> {REVIEW.and}{" "}
          <Legal href={REVIEW.privacy.href}>{REVIEW.privacy.label}</Legal>.
        </Consent>
      </div>
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
          <span className={`${DISPLAY} truncate text-[19px] leading-none text-(--cx-white)`}>{title}</span>
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

/** The real legal pages, in a new tab so the application isn't lost. */
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

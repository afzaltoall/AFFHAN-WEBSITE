import type { ReactNode } from "react";
import { DISPLAY } from "@/components/CinematicExperience/parts";
import { LABELS, REVIEW, STEPS } from "./content";
import { Consent } from "./fields";
import type { ApplicationApi } from "./useApplication";

/**
 * Step 05, Review & submit: an editorial summary, one section per step with
 * an Edit link back to it, then the two consents.
 *
 * Nothing sensitive is collected (no passport number, expiry or document:
 * see TRAVEL_DOCUMENTS), so the travel section shows plain Yes/No. If those
 * questions are ever switched on, show them here as "Provided" or masked
 * (********1234), never in full.
 */
export function StepReview({ app, onEdit }: { app: ApplicationApi; onEdit: (step: number) => void }) {
  const { personal: p, business: b, profile: f, travel: t, consent: c } = app.state;
  const e = app.errors;
  const yesNo = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
  const setConsent = (patch: Partial<typeof c>) => app.update("consent", patch);

  return (
    <div className="grid gap-12">
      <Section index={0} title={REVIEW.groups.personal} onEdit={onEdit}>
        <Item label={LABELS.fullName} value={p.fullName} wide />
        <Item label={LABELS.email} value={p.email} />
        <Item label={LABELS.phone} value={p.phone ? `${p.phoneCode} ${p.phone}` : ""} />
        <Item label={LABELS.country} value={p.country} />
        <Item label={LABELS.city} value={p.city} />
        <Item label={LABELS.profileUrl} value={p.profileUrl} wide />
      </Section>

      <Section index={1} title={REVIEW.groups.business} onEdit={onEdit}>
        <Item label={LABELS.companyName} value={b.companyName} />
        <Item label={LABELS.role} value={b.role} />
        <Item label={LABELS.businessCategory} value={b.businessCategory} />
        <Item label={LABELS.yearsInBusiness} value={b.yearsInBusiness} />
        <Item label={LABELS.companyWebsite} value={b.companyWebsite} wide />
        <Item label={LABELS.businessDescription} value={b.businessDescription} wide />
      </Section>

      <Section index={2} title={REVIEW.groups.profile} onEdit={onEdit}>
        <Item label={LABELS.interests} value={f.interests.join(" · ")} wide />
        <Item label={LABELS.productsOfInterest} value={f.productsOfInterest} wide />
        <Item label={LABELS.exploreNotes} value={f.exploreNotes} wide />
      </Section>

      <Section index={3} title={REVIEW.groups.travel} onEdit={onEdit}>
        <Item label={LABELS.nationality} value={t.nationality} />
        <Item label={LABELS.hasPassport} value={yesNo(t.hasPassport)} />
        <Item label={LABELS.travelledToChina} value={yesNo(t.travelledToChina)} />
      </Section>

      <div className="grid gap-5 border-t border-(--cx-white)/10 pt-8">
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

function Section({ index, title, onEdit, children }: { index: number; title: string; onEdit: (step: number) => void; children: ReactNode }) {
  return (
    <section aria-labelledby={`ax-review-${index}`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-(--cx-white)/10 pb-3">
        <h3 id={`ax-review-${index}`} className="flex items-baseline gap-3">
          <span className="text-[11px] font-semibold tabular-nums tracking-[0.24em] text-(--cx-gold)">{STEPS[index].number}</span>
          <span className={`${DISPLAY} text-[22px] leading-none text-(--cx-white) md:text-[26px]`}>{title}</span>
        </h3>
        <button
          type="button"
          onClick={() => onEdit(index)}
          className="min-h-11 px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-(--cx-gold) underline-offset-[6px] transition-colors hover:text-(--cx-gold-hi) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white)"
        >
          {REVIEW.edit}
          <span className="sr-only"> {title}</span>
        </button>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--cx-mute)">{label}</dt>
      <dd className={`mt-1.5 whitespace-pre-line break-words text-[16px] leading-relaxed ${value ? "text-(--cx-white)" : "text-(--cx-white)/35"}`}>
        {value || "Not given"}
      </dd>
    </div>
  );
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

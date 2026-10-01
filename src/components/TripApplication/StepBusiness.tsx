import { useState } from "react";
import { BUSINESS_CATEGORIES, BUSINESS_STATUSES, LIMITS, YEARS_IN_BUSINESS, type BusinessStatus } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { Choices, Field, Pills, SearchSelect, TextArea, TextInput } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/**
 * Step 02, Your business journey. "What best describes you?" first, then
 * only the questions that answer asks (BUSINESS_FIELDS in
 * lib/trip-application.ts):
 *
 *   I currently run a business / I am looking to expand an existing business:
 *     company name, role, category, website (optional), years, about it
 *   I am planning to start a business:
 *     business / brand name (optional), category / area, what they plan to
 *     build, website (optional)
 *   I don't have a business yet — I'm exploring opportunities:
 *     area of interest, what they would like to explore in China, and their
 *     website or LinkedIn (optional: step 01's own answer, asked again here)
 *
 * Nobody needs a business to apply. A hidden question is never required, and
 * changing the answer clears only what the new one does not ask
 * (useApplication's chooseStatus). The questions that follow a change fade
 * in; the ones there when the step opens arrive with the step.
 */
export function StepBusiness({ app }: { app: ApplicationApi }) {
  const b = app.state.business;
  const p = app.state.personal;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["business"]>) => app.update("business", patch);
  const s = b.businessStatus;
  const company = s === "existing_business" || s === "expanding_business";
  // The two company paths ask the same questions: moving between them changes nothing on screen.
  const group = company ? "company" : s;
  const [opened] = useState(group);

  return (
    <div className="grid gap-y-6">
      <Choices id="ax-businessStatus" label={LABELS.businessStatus} value={s} options={BUSINESS_STATUSES} onChange={(v) => app.chooseStatus(v as BusinessStatus)} error={e.businessStatus} />

      {group && (
        <div key={group} className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${group !== opened ? "ax-reveal" : ""}`}>
          {company && (
            <>
              <Field id="ax-companyName" label={LABELS.companyName} error={e.companyName}>
                <TextInput id="ax-companyName" value={b.companyName} onChange={(v) => set({ companyName: v })} error={e.companyName} placeholder={PLACEHOLDERS.companyName} maxLength={LIMITS.company} autoComplete="organization" />
              </Field>
              <Field id="ax-role" label={LABELS.role} error={e.role}>
                <TextInput id="ax-role" value={b.role} onChange={(v) => set({ role: v })} error={e.role} placeholder={PLACEHOLDERS.role} maxLength={LIMITS.role} autoComplete="organization-title" />
              </Field>
              <div className="sm:col-span-2">
                <Field id="ax-businessCategory" label={LABELS.businessCategory} error={e.businessCategory}>
                  <SearchSelect id="ax-businessCategory" value={b.businessCategory} options={BUSINESS_CATEGORIES} onChange={(v) => set({ businessCategory: v })} error={e.businessCategory} placeholder={PLACEHOLDERS.businessCategory} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field id="ax-companyWebsite" label={LABELS.companyWebsite} optional error={e.companyWebsite}>
                  <TextInput id="ax-companyWebsite" inputMode="url" value={b.companyWebsite} onChange={(v) => set({ companyWebsite: v })} error={e.companyWebsite} placeholder={PLACEHOLDERS.companyWebsite} maxLength={LIMITS.url} autoComplete="url" required={false} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Pills id="ax-yearsInBusiness" label={LABELS.yearsInBusiness} value={b.yearsInBusiness} options={YEARS_IN_BUSINESS} onChange={(v) => set({ yearsInBusiness: v })} error={e.yearsInBusiness} />
              </div>
              <div className="sm:col-span-2">
                <Field id="ax-businessDescription" label={LABELS.businessDescription} error={e.businessDescription}>
                  <TextArea id="ax-businessDescription" value={b.businessDescription} onChange={(v) => set({ businessDescription: v })} error={e.businessDescription} placeholder={PLACEHOLDERS.businessDescription} maxLength={LIMITS.description} />
                </Field>
              </div>
            </>
          )}

          {s === "planning_business" && (
            <>
              <Field id="ax-companyName" label={LABELS.brandName} optional error={e.companyName}>
                <TextInput id="ax-companyName" value={b.companyName} onChange={(v) => set({ companyName: v })} error={e.companyName} placeholder={PLACEHOLDERS.brandName} maxLength={LIMITS.company} autoComplete="organization" required={false} />
              </Field>
              <Field id="ax-businessCategory" label={LABELS.businessArea} error={e.businessCategory}>
                <SearchSelect id="ax-businessCategory" value={b.businessCategory} options={BUSINESS_CATEGORIES} onChange={(v) => set({ businessCategory: v })} error={e.businessCategory} placeholder={PLACEHOLDERS.businessCategory} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="ax-businessPlan" label={LABELS.businessPlan} error={e.businessPlan}>
                  <TextArea id="ax-businessPlan" value={b.businessPlan} onChange={(v) => set({ businessPlan: v })} error={e.businessPlan} placeholder={PLACEHOLDERS.businessPlan} maxLength={LIMITS.description} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field id="ax-companyWebsite" label={LABELS.companyWebsite} optional error={e.companyWebsite}>
                  <TextInput id="ax-companyWebsite" inputMode="url" value={b.companyWebsite} onChange={(v) => set({ companyWebsite: v })} error={e.companyWebsite} placeholder={PLACEHOLDERS.companyWebsite} maxLength={LIMITS.url} autoComplete="url" required={false} />
                </Field>
              </div>
            </>
          )}

          {s === "no_business_yet" && (
            <>
              <div className="sm:col-span-2">
                <Field id="ax-areaOfInterest" label={LABELS.areaOfInterest} error={e.areaOfInterest}>
                  <SearchSelect id="ax-areaOfInterest" value={b.areaOfInterest} options={BUSINESS_CATEGORIES} onChange={(v) => set({ areaOfInterest: v })} error={e.areaOfInterest} placeholder={PLACEHOLDERS.businessCategory} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field id="ax-exploreGoal" label={LABELS.exploreGoal} error={e.exploreGoal}>
                  <TextArea id="ax-exploreGoal" value={b.exploreGoal} onChange={(v) => set({ exploreGoal: v })} error={e.exploreGoal} placeholder={PLACEHOLDERS.exploreGoal} maxLength={LIMITS.explore} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                {/* Step 01's own answer: one value, whichever step it is typed in. */}
                <Field id="ax-profileUrl" label={LABELS.websiteOrLinkedIn} optional error={e.profileUrl}>
                  <TextInput id="ax-profileUrl" inputMode="url" value={p.profileUrl} onChange={(v) => app.update("personal", { profileUrl: v })} error={e.profileUrl} placeholder={PLACEHOLDERS.profileUrl} maxLength={LIMITS.url} autoComplete="url" required={false} />
                </Field>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

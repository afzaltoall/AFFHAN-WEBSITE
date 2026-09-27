import { BUSINESS_CATEGORIES, LIMITS, YEARS_IN_BUSINESS } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { Field, Pills, SearchSelect, TextArea, TextInput } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/** Step 02, Your business. */
export function StepBusiness({ app }: { app: ApplicationApi }) {
  const b = app.state.business;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["business"]>) => app.update("business", patch);
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <Field id="ax-companyName" label={LABELS.companyName} error={e.companyName}>
        <TextInput id="ax-companyName" value={b.companyName} onChange={(v) => set({ companyName: v })} error={e.companyName} placeholder={PLACEHOLDERS.companyName} maxLength={LIMITS.company} autoComplete="organization" />
      </Field>
      <Field id="ax-role" label={LABELS.role} error={e.role}>
        <TextInput id="ax-role" value={b.role} onChange={(v) => set({ role: v })} error={e.role} placeholder={PLACEHOLDERS.role} maxLength={LIMITS.role} autoComplete="organization-title" />
      </Field>
      <div className="sm:col-span-2">
        <Field id="ax-businessCategory" label={LABELS.businessCategory} error={e.businessCategory}>
          <SearchSelect
            id="ax-businessCategory"
            value={b.businessCategory}
            options={BUSINESS_CATEGORIES}
            onChange={(v) => set({ businessCategory: v })}
            error={e.businessCategory}
            placeholder={PLACEHOLDERS.businessCategory}
          />
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
    </div>
  );
}

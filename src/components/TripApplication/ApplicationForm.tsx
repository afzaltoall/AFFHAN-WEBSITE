import { LIMITS } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { CountryField, Field, PhoneField, TextInput, YesNo } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/**
 * The application, one page (the owner, 2026-10-29, with their list): name, mobile, country, city, doing business
 * or not, valid passport, in that order, and nothing else. Field ids are "ax-" + the answer's key, so a complaint
 * from the server finds its field. The business answer is stored as the application's journey (lib/trip-application.ts,
 * BUSINESS_STATUSES): Yes "existing_business", No "no_business_yet".
 */
export function ApplicationForm({ app }: { app: ApplicationApi }) {
  const p = app.state.personal;
  const s = app.state.business.businessStatus;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["personal"]>) => app.update("personal", patch);
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="ax-fullName" label={LABELS.fullName} error={e.fullName}>
          <TextInput id="ax-fullName" value={p.fullName} onChange={(v) => set({ fullName: v })} error={e.fullName} placeholder={PLACEHOLDERS.fullName} maxLength={LIMITS.name} autoComplete="name" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="ax-phone" label={LABELS.phone} error={e.phone}>
          <PhoneField
            id="ax-phone"
            iso={p.phoneIso}
            dial={p.phoneCode}
            number={p.phone}
            onDial={(iso, dial) => {
              set({ phoneIso: iso, phoneCode: dial });
              // Whether the number is valid depends on the code: the old
              // complaint no longer applies once the code changes.
              app.setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            onNumber={(v) => set({ phone: v })}
            error={e.phone}
          />
        </Field>
      </div>
      <Field id="ax-country" label={LABELS.country} error={e.country}>
        <CountryField id="ax-country" value={p.country} onChange={(v) => set({ country: v })} error={e.country} />
      </Field>
      <Field id="ax-city" label={LABELS.city} error={e.city}>
        <TextInput id="ax-city" value={p.city} onChange={(v) => set({ city: v })} error={e.city} placeholder={PLACEHOLDERS.city} maxLength={LIMITS.city} autoComplete="address-level2" />
      </Field>
      <YesNo
        id="ax-businessStatus"
        label={LABELS.runsBusiness}
        value={s === "" ? null : s === "existing_business"}
        onChange={(v) => app.update("business", { businessStatus: v ? "existing_business" : "no_business_yet" })}
        error={e.businessStatus}
      />
      <YesNo id="ax-hasPassport" label={LABELS.hasPassport} value={app.state.travel.hasPassport} onChange={(v) => app.update("travel", { hasPassport: v })} error={e.hasPassport} />
    </div>
  );
}

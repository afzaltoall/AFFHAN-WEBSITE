import { LIMITS } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { CountryField, Field, PhoneField, TextInput } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/** Step 01, About you: who to call. Field ids are "ax-" + the answer's key. */
export function StepAboutYou({ app }: { app: ApplicationApi }) {
  const p = app.state.personal;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["personal"]>) => app.update("personal", patch);
  return (
    <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="ax-fullName" label={LABELS.fullName} error={e.fullName}>
          <TextInput id="ax-fullName" value={p.fullName} onChange={(v) => set({ fullName: v })} error={e.fullName} placeholder={PLACEHOLDERS.fullName} maxLength={LIMITS.name} autoComplete="name" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="ax-email" label={LABELS.email} error={e.email}>
          <TextInput id="ax-email" type="email" inputMode="email" value={p.email} onChange={(v) => set({ email: v })} error={e.email} placeholder={PLACEHOLDERS.email} maxLength={LIMITS.email} autoComplete="email" />
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
      <div className="sm:col-span-2">
        <Field id="ax-profileUrl" label={LABELS.profileUrl} optional error={e.profileUrl}>
          <TextInput id="ax-profileUrl" inputMode="url" value={p.profileUrl} onChange={(v) => set({ profileUrl: v })} error={e.profileUrl} placeholder={PLACEHOLDERS.profileUrl} maxLength={LIMITS.url} autoComplete="url" required={false} />
        </Field>
      </div>
    </div>
  );
}

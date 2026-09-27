import { LABELS } from "./content";
import { CountryField, Field, YesNo } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/**
 * Step 04, Travel profile: three questions and nothing more. Visa status,
 * passport number, expiry and document upload are switched off in
 * TRAVEL_DOCUMENTS (lib/trip-application.ts) until the trip's process
 * confirms it needs them. None of this step is ever stored in the browser.
 */
export function StepTravel({ app }: { app: ApplicationApi }) {
  const t = app.state.travel;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["travel"]>) => app.update("travel", patch);
  return (
    <div className="grid gap-y-6">
      <div className="max-w-md">
        <Field id="ax-nationality" label={LABELS.nationality} error={e.nationality}>
          <CountryField id="ax-nationality" value={t.nationality} onChange={(v) => set({ nationality: v })} error={e.nationality} />
        </Field>
      </div>
      <YesNo id="ax-hasPassport" label={LABELS.hasPassport} value={t.hasPassport} onChange={(v) => set({ hasPassport: v })} error={e.hasPassport} />
      <YesNo id="ax-travelledToChina" label={LABELS.travelledToChina} value={t.travelledToChina} onChange={(v) => set({ travelledToChina: v })} error={e.travelledToChina} />
    </div>
  );
}

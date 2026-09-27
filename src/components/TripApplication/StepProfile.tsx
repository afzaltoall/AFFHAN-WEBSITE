import { INTERESTS, LIMITS } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { Chips, Field, TextArea } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/** Step 03, Business profile. The interests are a placeholder list (README). */
export function StepProfile({ app }: { app: ApplicationApi }) {
  const f = app.state.profile;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["profile"]>) => app.update("profile", patch);
  return (
    <div className="grid gap-y-6">
      <Chips id="ax-interests" label={LABELS.interests} values={f.interests} options={INTERESTS} onChange={(v) => set({ interests: v })} error={e.interests} />
      <Field id="ax-productsOfInterest" label={LABELS.productsOfInterest} error={e.productsOfInterest}>
        <TextArea id="ax-productsOfInterest" value={f.productsOfInterest} onChange={(v) => set({ productsOfInterest: v })} error={e.productsOfInterest} placeholder={PLACEHOLDERS.productsOfInterest} maxLength={LIMITS.products} />
      </Field>
      <Field id="ax-exploreNotes" label={LABELS.exploreNotes} optional>
        <TextArea id="ax-exploreNotes" value={f.exploreNotes} onChange={(v) => set({ exploreNotes: v })} placeholder={PLACEHOLDERS.exploreNotes} maxLength={LIMITS.explore} required={false} />
      </Field>
    </div>
  );
}

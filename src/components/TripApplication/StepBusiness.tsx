import { useEffect, useRef, useState } from "react";
import { BUSINESS_CATEGORIES, BUSINESS_STATUSES, LIMITS, type BusinessStatus } from "@/lib/trip-application";
import { LABELS, PLACEHOLDERS } from "./content";
import { Choices, Field, SearchSelect, TextInput } from "./fields";
import type { ApplicationApi, ApplicationState } from "./useApplication";

/** From a tap on "planning" to the page turning: long enough to see the card fill gold (its colour takes 300 ms). */
const PLANNING_ON_MS = 400;

/**
 * Step 02, Your business journey. "What best describes you?", then only what
 * that answer asks (BUSINESS_FIELDS in lib/trip-application.ts):
 *
 *   I currently run a business:         company name, role, category
 *   I am planning to start a business:  nothing more; a click or a tap on it
 *                                       turns the page to step 03 (back to the
 *                                       review, when editing), as Next does
 *
 * The owner (2026-10-28) took out the two other options ("I am looking to
 * expand an existing business", "I don't have a business yet — I'm exploring
 * opportunities"), the company's website and years in business, and every
 * question after "planning": "from now on dont ask these question".
 *
 * Nobody needs a business to apply, and a hidden question is never required.
 * The company's questions fade in when chosen; there when the step opens,
 * they arrive with the step.
 */
export function StepBusiness({ app }: { app: ApplicationApi }) {
  const b = app.state.business;
  const e = app.errors;
  const set = (patch: Partial<ApplicationState["business"]>) => app.update("business", patch);
  const s = b.businessStatus;
  const root = useRef<HTMLDivElement>(null);
  /** The answer was changed on this step: the company's questions fade in when they come. */
  const [changed, setChanged] = useState(false);
  /** When "planning" was last clicked or tapped (0: not yet). */
  const [pickedAt, setPickedAt] = useState(0);

  // "Planning" picked: on, through the form's own Next (ApplyExperience checks the step, then turns the page).
  // Another answer chosen in the meantime, or the step left, and it does not.
  useEffect(() => {
    if (!pickedAt || s !== "planning_business") return;
    const id = window.setTimeout(() => root.current?.closest("form")?.requestSubmit(), PLANNING_ON_MS);
    return () => window.clearTimeout(id);
  }, [pickedAt, s]);

  return (
    <div ref={root} className="grid gap-y-6">
      <Choices
        id="ax-businessStatus"
        label={LABELS.businessStatus}
        value={s}
        options={BUSINESS_STATUSES}
        onChange={(v) => {
          setChanged(true);
          app.chooseStatus(v as BusinessStatus);
        }}
        onPick={(v) => {
          if (v === "planning_business") setPickedAt(Date.now());
        }}
        error={e.businessStatus}
      />

      {s === "existing_business" && (
        <div className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${changed ? "ax-reveal" : ""}`}>
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
        </div>
      )}
    </div>
  );
}

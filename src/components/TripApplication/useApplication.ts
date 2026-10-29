"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";
import {
  BUSINESS_FIELDS,
  BUSINESS_FIELD_KEYS,
  isBusinessStatus,
  relevantBusiness,
  validateStep,
  type BusinessStatus,
  type FieldErrors,
  type StepKey,
  type TripApplicationPayload,
} from "@/lib/trip-application";

/**
 * The application's one state object: { personal, business, travel, consent },
 * plus the dial code the mobile field needs.
 *
 * - Back never erases anything; forward runs that step's rules first.
 * - Step 02's first answer decides which of its questions apply
 *   (BUSINESS_FIELDS). Changing it keeps what was typed, out of sight (a tap
 *   on "planning" turns the page at once, so a slip must cost nothing: back
 *   on "I currently run a business", the company's answers are still there),
 *   but only what the choice asks is checked, reviewed and sent (toPayload),
 *   so nothing hidden ever leaves the browser.
 * - Steps 01–02 (nothing sensitive) are kept as a draft in sessionStorage, so
 *   an accidental refresh does not lose them. Step 03 (travel) and the consent
 *   ticks are NEVER stored anywhere in the browser: they live in memory only.
 *   The Privacy Policy and Terms boxes are ticked by the agreement given in
 *   the popup before the application starts (ApplyExperience; on a phone, the
 *   sheet before the first question). The accuracy box starts unticked.
 * - Someone signed in has their name and mobile filled in, into fields
 *   that are still empty.
 */

export interface ApplicationState {
  personal: { fullName: string; phoneIso: string; phoneCode: string; phone: string; country: string; city: string };
  business: TripApplicationPayload["business"];
  travel: TripApplicationPayload["travel"];
  consent: TripApplicationPayload["consent"];
}

const EMPTY: ApplicationState = {
  personal: { fullName: "", phoneIso: "in", phoneCode: "+91", phone: "", country: "", city: "" },
  business: { businessStatus: "", companyName: "", role: "", businessCategory: "" },
  travel: { nationality: "", hasPassport: null },
  consent: { privacy: false, accuracy: false, terms: false },
};

/** Session-only draft of steps 01–02. Never step 03, never consent. */
const DRAFT_KEY = "affhan:trip-apply-draft";

export function toPayload(s: ApplicationState): TripApplicationPayload {
  return {
    personal: {
      fullName: s.personal.fullName.trim(),
      // No number, no phone: the dial code alone ("+91") is not an answer, and must not pass as one.
      phone: s.personal.phone ? `${s.personal.phoneCode} ${s.personal.phone}` : "",
      country: s.personal.country,
      city: s.personal.city.trim(),
    },
    // Only what the chosen option asks: the rest is blank, whatever was typed before a change of mind.
    business: relevantBusiness(s.business),
    travel: { ...s.travel },
    consent: { ...s.consent },
  };
}

export function useApplication() {
  const { user } = useAuth();
  const [state, setState] = useState<ApplicationState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const restored = useRef(false);

  // Bring back a draft of steps 01–02 from this session: only the answers this form asks. A draft from an
  // earlier form may carry more (the business profile, "About your business", a website, years in business,
  // a plan), all left behind; an option no longer offered is left for the applicant to choose again.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Pick<ApplicationState, "personal" | "business">>;
        // An email or a website from a draft of the form before 2026-10-29 is left behind too.
        const personal = { ...(d.personal ?? {}) } as Record<string, unknown>;
        delete personal.email;
        delete personal.profileUrl;
        const was = (d.business ?? {}) as Record<string, unknown>;
        const business: Partial<ApplicationState["business"]> = {};
        if (isBusinessStatus(was.businessStatus)) business.businessStatus = was.businessStatus;
        for (const k of BUSINESS_FIELD_KEYS) {
          const v = was[k];
          if (typeof v === "string") business[k] = v;
        }
        setState((s) => ({
          ...s,
          personal: { ...s.personal, ...personal },
          business: { ...s.business, ...business },
        }));
      }
    } catch {
      /* no draft, or storage blocked */
    }
    restored.current = true;
  }, []);

  // What the account already knows, into empty fields.
  useEffect(() => {
    if (!user) return;
    const phone = user.phone ? splitE164(user.phone) : null;
    const known = phone && COUNTRIES.some((c) => c.iso === phone.iso && c.dial === phone.dial) ? phone : null;
    setState((s) => ({
      ...s,
      personal: {
        ...s.personal,
        fullName: s.personal.fullName || user.name || "",
        ...(known && !s.personal.phone ? { phoneIso: known.iso, phoneCode: known.dial, phone: known.national } : {}),
      },
    }));
  }, [user]);

  // Save the draft (01–02 only), a moment after typing stops.
  useEffect(() => {
    if (!restored.current) return;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ personal: state.personal, business: state.business }));
      } catch {
        /* storage full or blocked: the draft is a convenience */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [state.personal, state.business]);

  /** Update one section; clears the complaints of the fields that changed. */
  const update = useCallback(<K extends keyof ApplicationState>(section: K, patch: Partial<ApplicationState[K]>) => {
    setState((s) => ({ ...s, [section]: { ...s[section], ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  }, []);

  /**
   * Step 02's first answer. What was typed for the other choice stays, out of
   * sight (choosing it again brings it back); its complaints go.
   */
  const chooseStatus = useCallback((next: BusinessStatus) => {
    const keep: readonly string[] = BUSINESS_FIELDS[next];
    setState((s) => (s.business.businessStatus === next ? s : { ...s, business: { ...s.business, businessStatus: next } }));
    setErrors((e) => {
      const n = { ...e };
      delete n.businessStatus;
      for (const k of BUSINESS_FIELD_KEYS) if (!keep.includes(k)) delete n[k];
      return n;
    });
  }, []);

  const phoneOk = useMemo(
    () => (state.personal.phone ? isValidMobile(state.personal.phone, state.personal.phoneIso) : undefined),
    [state.personal.phone, state.personal.phoneIso],
  );

  /** Check one step; show its errors; true when it may be left forwards. */
  const check = useCallback(
    (step: StepKey) => {
      const e = validateStep(step, toPayload(state), phoneOk);
      setErrors((prev) => ({ ...prev, ...e }));
      return { ok: Object.keys(e).length === 0, errors: e };
    },
    [state, phoneOk],
  );

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  return { state, update, chooseStatus, errors, setErrors, check, phoneOk, clearDraft };
}

export type ApplicationApi = ReturnType<typeof useApplication>;

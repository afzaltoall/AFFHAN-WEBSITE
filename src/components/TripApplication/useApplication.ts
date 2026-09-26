"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";
import { validateStep, type FieldErrors, type StepKey, type TripApplicationPayload } from "@/lib/trip-application";

/**
 * The application's one state object: { personal, business, profile, travel,
 * consent }, plus the dial code the mobile field needs.
 *
 * - Back never erases anything; forward runs that step's rules first.
 * - Steps 01–03 (nothing sensitive) are kept as a draft in sessionStorage, so
 *   an accidental refresh does not lose them. Step 04 (travel) and the consent
 *   ticks are NEVER stored anywhere in the browser: they live in memory only.
 * - Someone signed in has their name, email and mobile filled in, into fields
 *   that are still empty.
 */

export interface ApplicationState {
  personal: { fullName: string; email: string; phoneIso: string; phoneCode: string; phone: string; country: string; city: string; profileUrl: string };
  business: TripApplicationPayload["business"];
  profile: TripApplicationPayload["profile"];
  travel: TripApplicationPayload["travel"];
  consent: TripApplicationPayload["consent"];
}

const EMPTY: ApplicationState = {
  personal: { fullName: "", email: "", phoneIso: "in", phoneCode: "+91", phone: "", country: "", city: "", profileUrl: "" },
  business: { companyName: "", role: "", businessCategory: "", companyWebsite: "", yearsInBusiness: "", businessDescription: "" },
  profile: { interests: [], productsOfInterest: "", exploreNotes: "" },
  travel: { nationality: "", hasPassport: null, travelledToChina: null },
  consent: { accuracy: false, terms: false },
};

/** Session-only draft of steps 01–03. Never step 04, never consent. */
const DRAFT_KEY = "affhan:trip-apply-draft";

export function toPayload(s: ApplicationState): TripApplicationPayload {
  return {
    personal: {
      fullName: s.personal.fullName.trim(),
      email: s.personal.email.trim(),
      phone: `${s.personal.phoneCode} ${s.personal.phone}`.trim(),
      country: s.personal.country,
      city: s.personal.city.trim(),
      profileUrl: s.personal.profileUrl.trim(),
    },
    business: { ...s.business },
    profile: { ...s.profile },
    travel: { ...s.travel },
    consent: { ...s.consent },
  };
}

export function useApplication() {
  const { user } = useAuth();
  const [state, setState] = useState<ApplicationState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const restored = useRef(false);

  // Bring back a draft of steps 01–03 from this session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Pick<ApplicationState, "personal" | "business" | "profile">>;
        setState((s) => ({
          ...s,
          personal: { ...s.personal, ...(d.personal ?? {}) },
          business: { ...s.business, ...(d.business ?? {}) },
          profile: { ...s.profile, ...(d.profile ?? {}), interests: Array.isArray(d.profile?.interests) ? d.profile.interests : s.profile.interests },
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
        email: s.personal.email || user.email || "",
        ...(known && !s.personal.phone ? { phoneIso: known.iso, phoneCode: known.dial, phone: known.national } : {}),
      },
    }));
  }, [user]);

  // Save the draft (01–03 only), a moment after typing stops.
  useEffect(() => {
    if (!restored.current) return;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ personal: state.personal, business: state.business, profile: state.profile }));
      } catch {
        /* storage full or blocked: the draft is a convenience */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [state.personal, state.business, state.profile]);

  /** Update one section; clears the complaints of the fields that changed. */
  const update = useCallback(<K extends keyof ApplicationState>(section: K, patch: Partial<ApplicationState[K]>) => {
    setState((s) => ({ ...s, [section]: { ...s[section], ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
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

  return { state, update, errors, setErrors, check, phoneOk, clearDraft };
}

export type ApplicationApi = ReturnType<typeof useApplication>;

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";
import { isBusinessStatus, type FieldErrors, type TripApplicationPayload } from "@/lib/trip-application";

/**
 * The application's one state object: { personal, business, travel, consent },
 * plus the dial code the mobile field needs. One page, six answers (2026-10-29).
 *
 * - The name, mobile, country, city and the business answer (nothing
 *   sensitive) are kept as a draft in sessionStorage, so an accidental refresh
 *   does not lose them. The passport answer and the consents are NEVER stored
 *   anywhere in the browser: they live in memory only. The Privacy Policy and
 *   the Terms are agreed in the popup before the questions (ApplyExperience;
 *   on a phone, the sheet first), and nothing is asked again: the third
 *   consent, accurate information, is the Terms' own (clause 2), so it is sent
 *   as their agreement (toPayload).
 * - Someone signed in has their name and mobile filled in, into fields that
 *   are still empty.
 */

export interface ApplicationState {
  personal: { fullName: string; phoneIso: string; phoneCode: string; phone: string; country: string; city: string };
  business: TripApplicationPayload["business"];
  travel: TripApplicationPayload["travel"];
  /** The popup's agreement, before the questions. */
  consent: { privacy: boolean; terms: boolean };
}

const EMPTY: ApplicationState = {
  personal: { fullName: "", phoneIso: "in", phoneCode: "+91", phone: "", country: "", city: "" },
  business: { businessStatus: "" },
  travel: { hasPassport: null },
  consent: { privacy: false, terms: false },
};

/** Session-only draft of the name, mobile, country, city and business answer. Never the passport, never consent. */
const DRAFT_KEY = "affhan:trip-apply-draft";

/** What is sent. */
export function toPayload(s: ApplicationState): TripApplicationPayload {
  return {
    personal: {
      fullName: s.personal.fullName.trim(),
      // No number, no phone: the dial code alone ("+91") is not an answer, and must not pass as one.
      phone: s.personal.phone ? `${s.personal.phoneCode} ${s.personal.phone}` : "",
      country: s.personal.country,
      city: s.personal.city.trim(),
    },
    business: { businessStatus: s.business.businessStatus },
    travel: { hasPassport: s.travel.hasPassport },
    // The Terms require accurate, complete information (clause 2): agreeing to them is agreeing to that.
    consent: { privacy: s.consent.privacy, accuracy: s.consent.terms, terms: s.consent.terms },
  };
}

export function useApplication() {
  const { user } = useAuth();
  const [state, setState] = useState<ApplicationState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const restored = useRef(false);

  // Bring back this session's draft: only the answers this page asks. A draft from an earlier form may carry more
  // (an email, a website, a company, a step-02 answer no longer offered), all left behind.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { personal?: Record<string, unknown>; business?: Record<string, unknown> };
        const was = d.personal ?? {};
        const personal: Partial<ApplicationState["personal"]> = {};
        for (const k of ["fullName", "phoneIso", "phoneCode", "phone", "country", "city"] as const) {
          const v = was[k];
          if (typeof v === "string") personal[k] = v;
        }
        const status = d.business?.businessStatus;
        setState((s) => ({
          ...s,
          personal: { ...s.personal, ...personal },
          business: isBusinessStatus(status) ? { businessStatus: status } : s.business,
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

  // Save the draft, a moment after typing stops.
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

  const phoneOk = useMemo(
    () => (state.personal.phone ? isValidMobile(state.personal.phone, state.personal.phoneIso) : undefined),
    [state.personal.phone, state.personal.phoneIso],
  );

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  return { state, update, errors, setErrors, phoneOk, clearDraft };
}

export type ApplicationApi = ReturnType<typeof useApplication>;

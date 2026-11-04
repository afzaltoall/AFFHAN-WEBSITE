"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";
import { isBusinessStatus, type FieldErrors, type TripApplicationPayload } from "@/lib/trip-application";
import {
  REFERRAL_CODE_MAX,
  REFERRAL_DROPPED_EVENT,
  REFERRAL_EVENT,
  REFERRAL_STORAGE_DAYS,
  REFERRAL_STORAGE_KEY,
  normalizeReferralCode,
  referralFromSearch,
  type IdProof,
} from "@/lib/trip-referral-shared";

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
  /**
   * The code of the employee whose link brought this browser (TripRefCapture, 2026-11-02), "" when none. Never shown
   * or asked: it only goes with the application, so the employee is credited.
   */
  referral: { code: string };
  /**
   * With a code, the ID proof the applicant must add (the owner, 2026-11-02): the files uploaded so far, and how many
   * are still on their way. Memory only, never the draft.
   */
  documents: { files: UploadedDocument[]; uploading: number };
}

/** One ID file in the private bucket: its key, which of the five IDs it is (`proof`), and what the form shows of it
 *  (`preview`, an object URL for a photo). */
export interface UploadedDocument {
  key: string;
  proof: IdProof;
  kind: "image" | "pdf";
  preview: string | null;
}

const EMPTY: ApplicationState = {
  personal: { fullName: "", phoneIso: "in", phoneCode: "+91", phone: "", country: "", city: "" },
  business: { businessStatus: "" },
  travel: { hasPassport: null },
  consent: { privacy: false, terms: false },
  referral: { code: "" },
  documents: { files: [], uploading: 0 },
};

/** The code an employee's link left in this browser, while it is fresh (REFERRAL_STORAGE_DAYS); "" when none. */
function codeFromLink(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY) ?? "null") as { code?: unknown; at?: unknown } | null;
    if (!saved || typeof saved.at !== "number" || Date.now() - saved.at > REFERRAL_STORAGE_DAYS * 86_400_000) return "";
    return normalizeReferralCode(saved.code).slice(0, REFERRAL_CODE_MAX);
  } catch {
    return "";
  }
}

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
    referralCode: normalizeReferralCode(s.referral.code),
    documents: s.documents.files.map((f) => f.key),
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
    // The employee's code, to go with the application; the applicant never sees it. The address's own first (?ref=, on
    // the link itself), so the ID proof shows with the first question whatever the server and the browser's storage
    // do (2026-11-04: it waited for the server's answer, and some applied without it); else the one a link left here.
    const linked = referralFromSearch(window.location.search) || codeFromLink();
    if (linked) setState((s) => ({ ...s, referral: { code: linked } }));
    restored.current = true;
  }, []);

  // A link kept while this page is open (TripRefCapture), and one the server has answered credits nobody: forgotten,
  // or the live link this browser kept before it taken instead.
  useEffect(() => {
    const kept = (e: Event) => {
      const code = normalizeReferralCode((e as CustomEvent<unknown>).detail) || codeFromLink();
      if (code) setState((s) => (s.referral.code === code ? s : { ...s, referral: { code } }));
    };
    const dropped = (e: Event) => {
      const gone = normalizeReferralCode((e as CustomEvent<unknown>).detail);
      const back = codeFromLink();
      setState((s) => {
        if (s.referral.code !== gone) return s;
        return back && back !== gone ? { ...s, referral: { code: back } } : { ...s, referral: { code: "" }, documents: { files: [], uploading: 0 } };
      });
      setErrors((x) => ({ ...x, idDocument: undefined }));
    };
    window.addEventListener(REFERRAL_EVENT, kept);
    window.addEventListener(REFERRAL_DROPPED_EVENT, dropped);
    return () => {
      window.removeEventListener(REFERRAL_EVENT, kept);
      window.removeEventListener(REFERRAL_DROPPED_EVENT, dropped);
    };
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

  // After an application is recorded: the draft, and the link's code too (it has credited its one applicant; the next
  // person on this browser is only an employee's if they came through a link themselves).
  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  /**
   * The link no longer credits anyone (its employee left after it was kept): forget it, and its ID files with it, so
   * the applicant goes on like anyone else, asked for nothing more.
   */
  const dropReferral = useCallback(() => {
    try {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch {
      /* nothing to forget */
    }
    setState((s) => ({ ...s, referral: { code: "" }, documents: { files: [], uploading: 0 } }));
    setErrors((e) => ({ ...e, idDocument: undefined }));
  }, []);

  /** ID files: one more on its way, one arrived (or failed: null), one removed. */
  const documentStarted = useCallback(() => {
    setState((s) => ({ ...s, documents: { ...s.documents, uploading: s.documents.uploading + 1 } }));
  }, []);
  const documentSettled = useCallback((file: UploadedDocument | null) => {
    setState((s) => ({
      ...s,
      documents: { files: file ? [...s.documents.files, file] : s.documents.files, uploading: Math.max(0, s.documents.uploading - 1) },
    }));
    if (file) setErrors((e) => ({ ...e, idDocument: undefined }));
  }, []);
  const removeDocument = useCallback((key: string) => {
    setState((s) => ({ ...s, documents: { ...s.documents, files: s.documents.files.filter((f) => f.key !== key) } }));
  }, []);

  return { state, update, errors, setErrors, phoneOk, clearDraft, dropReferral, documentStarted, documentSettled, removeDocument };
}

export type ApplicationApi = ReturnType<typeof useApplication>;

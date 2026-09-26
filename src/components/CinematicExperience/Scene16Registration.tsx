"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";
import { FORM, MESSAGE_HEADER } from "./content";
import { DISPLAY, EYEBROW } from "./parts";
import { Scene17Success } from "./Scene17Success";

/**
 * 16 Registration: four steps, then the success state (Scene17).
 *
 * Personal -> Business -> Location -> Travel & documents. Each step is checked
 * before the next opens; errors sit under their fields, the first bad field
 * takes focus, and a live region announces each new step. Steps change with a
 * short time-based transition (slide and resolve), which becomes a plain
 * cross-fade under reduced motion. Enter moves forward, as in any form.
 *
 * Sent through /api/contact, the endpoint the Contact Us page uses, so an
 * application lands in the admin console's Contact messages with the
 * applicant's customer number, like any enquiry. No new table and no schema
 * change. The message opens with a line that names it, so it cannot be
 * mistaken for a general enquiry.
 *
 * Someone signed in has their name, email and mobile filled in, into fields
 * that are still empty.
 */

interface Draft {
  fullName: string;
  email: string;
  phoneIso: string;
  phoneCode: string;
  phone: string;
  companyName: string;
  role: string;
  category: string;
  city: string;
  country: string;
  passport: string;
  notes: string;
}
type Field = Exclude<keyof Draft, "phoneIso" | "phoneCode" | "notes">;

const EMPTY: Draft = {
  fullName: "", email: "", phoneIso: "in", phoneCode: "+91", phone: "",
  companyName: "", role: "", category: "", city: "", country: "", passport: "", notes: "",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEP_FIELDS: Field[][] = [
  ["fullName", "email", "phone"],
  ["companyName", "role", "category"],
  ["city", "country"],
  ["passport"],
];
const E = FORM.errors;

function validate(d: Draft, step: number): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  const need = (f: Field, msg: string) => { if (!String(d[f]).trim()) e[f] = msg; };
  if (step === 0) {
    need("fullName", E.fullName);
    if (!d.email.trim()) e.email = E.email;
    else if (!EMAIL_RE.test(d.email.trim())) e.email = E.emailShape;
    if (!d.phone) e.phone = E.phone;
    else if (!isValidMobile(d.phone, d.phoneIso)) e.phone = E.phoneShape(d.phoneCode);
  } else if (step === 1) {
    need("companyName", E.companyName);
    need("role", E.role);
    need("category", E.category);
  } else if (step === 2) {
    need("city", E.city);
    need("country", E.country);
  } else {
    need("passport", E.passport);
  }
  return e;
}

/** The message the team reads in the console: what it is, first. */
function message(d: Draft) {
  const passport = FORM.passportOptions.find((o) => o.value === d.passport)?.label ?? d.passport;
  return [
    MESSAGE_HEADER,
    "",
    `Role: ${d.role.trim()}`,
    `Business category: ${d.category.trim()}`,
    `City: ${d.city.trim()}`,
    `Valid passport: ${passport}`,
    `Notes: ${d.notes.trim() || "none"}`,
  ].join("\n");
}

const INPUT =
  "block h-14 w-full rounded-none border-0 border-b bg-transparent px-0 text-[19px] text-(--cx-white) caret-(--cx-gold) placeholder:text-(--cx-white)/25 transition-[border-color,box-shadow] duration-300 focus:outline-none md:text-[21px]";
const inputState = (bad: boolean) =>
  bad
    ? "border-(--cx-error) focus:shadow-[inset_0_-1px_0_0_var(--cx-error)]"
    : "border-(--cx-white)/25 hover:border-(--cx-white)/45 focus:border-(--cx-gold) focus:shadow-[inset_0_-1px_0_0_var(--cx-gold)]";
const selectClass = (bad: boolean) =>
  `h-14! rounded-none! border-0! border-b! bg-transparent! px-0! text-[19px]! text-(--cx-white)! shadow-none! focus-visible:ring-0! md:text-[21px]! ${
    bad ? "border-(--cx-error)!" : "border-(--cx-white)/25! hover:border-(--cx-white)/45! focus-visible:border-(--cx-gold)! focus-visible:shadow-[inset_0_-1px_0_0_var(--cx-gold)]!"
  }`;

function Row({ id, label, error, optional, children }: { id: string; label: string; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold uppercase tracking-[0.2em] text-(--cx-mute)">
        {label}
        {optional ? <span className="normal-case tracking-normal"> (optional)</span> : <span aria-hidden className="text-(--cx-gold)"> *</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="pt-1 text-[14px] font-medium text-(--cx-error)">
          {error}
        </p>
      )}
    </div>
  );
}

export function Scene16Registration() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [phase, setPhase] = useState<"editing" | "sending" | "sent">("editing");
  const [failure, setFailure] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  /** Direction of the last move, and whether the user made it (so focus follows). */
  const move = useRef<{ dir: 1 | -1; byUser: boolean }>({ dir: 1, byUser: false });

  // What the account already knows, into fields that are still empty.
  useEffect(() => {
    if (!user) return;
    const phone = user.phone ? splitE164(user.phone) : null;
    const known = phone && COUNTRIES.some((c) => c.iso === phone.iso && c.dial === phone.dial) ? phone : null;
    setDraft((d) => ({
      ...d,
      fullName: d.fullName || user.name || "",
      email: d.email || user.email || "",
      ...(known && !d.phone ? { phoneIso: known.iso, phoneCode: known.dial, phone: known.national } : {}),
    }));
  }, [user]);

  // Each new step arrives: slide in and resolve (or just fade, under reduced
  // motion), then focus its first field if the user moved here.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !move.current.byUser) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tween = reduced
      ? gsap.fromTo(panel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 })
      : gsap.fromTo(
          panel,
          { autoAlpha: 0, x: 36 * move.current.dir, filter: "blur(8px)" },
          { autoAlpha: 1, x: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out", clearProps: "filter,transform" },
        );
    panel.querySelector<HTMLElement>("input, button[aria-haspopup]")?.focus({ preventScroll: true });
    return () => { tween.kill(); };
  }, [step]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // A corrected field stops showing its old complaint.
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as Field];
      return next;
    });
  };

  /** Leave the current step (slide out) and open another. */
  function go(next: number) {
    const panel = panelRef.current;
    move.current = { dir: next > step ? 1 : -1, byUser: true };
    setFailure(null);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!panel || reduced) { setStep(next); return; }
    gsap.to(panel, {
      autoAlpha: 0,
      x: -28 * move.current.dir,
      filter: "blur(6px)",
      duration: 0.22,
      ease: "power2.in",
      onComplete: () => setStep(next),
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    const problems = validate(draft, step);
    setErrors(problems);
    const first = STEP_FIELDS[step].find((f) => problems[f]);
    if (first) {
      document.getElementById(`cx-${first}`)?.focus();
      return;
    }
    if (step < 3) { go(step + 1); return; }

    setFailure(null);
    setPhase("sending");
    try {
      const res = await fetch("/api/contact/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          companyName: draft.companyName.trim(),
          country: draft.country,
          phone: `${draft.phoneCode} ${draft.phone}`,
          message: message(draft),
        }),
      });
      if (res.ok) {
        setPhase("sent");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setPhase("editing");
      setFailure(typeof body.error === "string" ? body.error : E.server);
    } catch {
      setPhase("editing");
      setFailure(E.network);
    }
  }

  const describedBy = (f: Field) => (errors[f] ? `cx-${f}-error` : undefined);
  const invalid = (f: Field) => (errors[f] ? true : undefined);
  const countrySelected = COUNTRIES.find((c) => c.name === draft.country) ?? null;
  const phoneCountry = COUNTRIES.find((c) => c.iso === draft.phoneIso && c.dial === draft.phoneCode) ?? null;
  const sending = phase === "sending";

  return (
    <section id="apply" aria-labelledby="cx-apply-title" className="relative pb-28 pt-24 md:pb-40 md:pt-32">
      {/* The final stage ends on black with a warm horizon; the form opens on the
          same black, fading to the night sky, and the same horizon. No seam. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[44svh] bg-linear-to-b from-(--cx-ink) to-transparent" />
      <div aria-hidden className="cx-horizon pointer-events-none absolute inset-x-0 top-0 h-[42svh] rotate-180" />
      <div className="relative mx-auto max-w-[920px] px-6 md:px-12">
        <div ref={headRef} data-cx="apply-head">
          <p className={EYEBROW}>{FORM.eyebrow}</p>
          <h2
            id="cx-apply-title"
            tabIndex={-1}
            className={`${DISPLAY} mt-4 text-balance text-[clamp(36px,9vw,60px)] leading-[1] text-(--cx-white) outline-none md:text-[clamp(48px,5vw,84px)]`}
          >
            {FORM.heading}
          </h2>
          {phase !== "sent" && <p className="mt-5 text-[15px] text-(--cx-mute) md:text-[16px]">{FORM.intro}</p>}
        </div>

        {phase === "sent" ? (
          <Scene17Success />
        ) : (
          <>
            {/* Progress: four segments, gold up to and including this step. */}
            <ol aria-label="Application progress" className="mt-12 grid grid-cols-4 gap-2 md:mt-16 md:gap-3">
              {FORM.steps.map((name, i) => (
                <li key={name} aria-current={i === step ? "step" : undefined} className="min-w-0">
                  <span aria-hidden className="relative block h-[2px] overflow-hidden bg-(--cx-faint)">
                    <span
                      className="absolute inset-0 origin-left bg-(--cx-gold) transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                      style={{ transform: `scaleX(${i <= step ? 1 : 0})` }}
                    />
                  </span>
                  <span className={`mt-3 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${i === step ? "text-(--cx-white)" : "text-(--cx-mute)"}`}>
                    <span className="tabular-nums text-(--cx-gold)">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hidden truncate sm:inline">{name}</span>
                    <span className="sr-only sm:hidden">{name}</span>
                    {i < step && <span className="sr-only"> (done)</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p aria-live="polite" className="sr-only">
              Step {step + 1} of 4: {FORM.steps[step]}
            </p>

            <form noValidate onSubmit={onSubmit} aria-busy={sending} className="mt-12 md:mt-14">
              <div ref={panelRef} className="grid gap-9">
                <h3 className={`${DISPLAY} text-[28px] leading-tight text-(--cx-white) md:text-[36px]`}>
                  <span className="sr-only">Step {step + 1}: </span>
                  {FORM.steps[step]}
                </h3>

                {step === 0 && (
                  <>
                    <Row id="cx-fullName" label={FORM.labels.fullName} error={errors.fullName}>
                      <input id="cx-fullName" type="text" autoComplete="name" maxLength={100} value={draft.fullName}
                        onChange={(e) => set({ fullName: e.target.value })} placeholder={FORM.placeholders.fullName}
                        aria-required aria-invalid={invalid("fullName")} aria-describedby={describedBy("fullName")}
                        className={`${INPUT} ${inputState(!!errors.fullName)}`} />
                    </Row>
                    <Row id="cx-email" label={FORM.labels.email} error={errors.email}>
                      <input id="cx-email" type="email" autoComplete="email" maxLength={200} value={draft.email}
                        onChange={(e) => set({ email: e.target.value })} placeholder={FORM.placeholders.email}
                        aria-required aria-invalid={invalid("email")} aria-describedby={describedBy("email")}
                        className={`${INPUT} ${inputState(!!errors.email)}`} />
                    </Row>
                    <Row id="cx-phone" label={FORM.labels.phone} error={errors.phone}>
                      <div className="flex items-end gap-5">
                        <div className="w-[6.5rem] shrink-0">
                          <FlagSelect mode="dial" placeholder="Code" selected={phoneCountry}
                            onSelect={(c) => set({ phoneIso: c.iso, phoneCode: c.dial })} buttonClassName={selectClass(false)} />
                        </div>
                        <input id="cx-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={18} value={draft.phone}
                          onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "") })} placeholder={FORM.placeholders.phone}
                          aria-required aria-invalid={invalid("phone")} aria-describedby={describedBy("phone")}
                          className={`min-w-0 flex-1 ${INPUT} ${inputState(!!errors.phone)}`} />
                      </div>
                    </Row>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Row id="cx-companyName" label={FORM.labels.companyName} error={errors.companyName}>
                      <input id="cx-companyName" type="text" autoComplete="organization" maxLength={200} value={draft.companyName}
                        onChange={(e) => set({ companyName: e.target.value })} placeholder={FORM.placeholders.companyName}
                        aria-required aria-invalid={invalid("companyName")} aria-describedby={describedBy("companyName")}
                        className={`${INPUT} ${inputState(!!errors.companyName)}`} />
                    </Row>
                    <Row id="cx-role" label={FORM.labels.role} error={errors.role}>
                      <input id="cx-role" type="text" autoComplete="organization-title" maxLength={120} value={draft.role}
                        onChange={(e) => set({ role: e.target.value })} placeholder={FORM.placeholders.role}
                        aria-required aria-invalid={invalid("role")} aria-describedby={describedBy("role")}
                        className={`${INPUT} ${inputState(!!errors.role)}`} />
                    </Row>
                    <Row id="cx-category" label={FORM.labels.category} error={errors.category}>
                      <input id="cx-category" type="text" maxLength={200} value={draft.category}
                        onChange={(e) => set({ category: e.target.value })} placeholder={FORM.placeholders.category}
                        aria-required aria-invalid={invalid("category")} aria-describedby={describedBy("category")}
                        className={`${INPUT} ${inputState(!!errors.category)}`} />
                    </Row>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Row id="cx-city" label={FORM.labels.city} error={errors.city}>
                      <input id="cx-city" type="text" autoComplete="address-level2" maxLength={100} value={draft.city}
                        onChange={(e) => set({ city: e.target.value })} placeholder={FORM.placeholders.city}
                        aria-required aria-invalid={invalid("city")} aria-describedby={describedBy("city")}
                        className={`${INPUT} ${inputState(!!errors.city)}`} />
                    </Row>
                    <Row id="cx-country" label={FORM.labels.country} error={errors.country}>
                      <FlagSelect id="cx-country" mode="country" placeholder="Select country" selected={countrySelected}
                        onSelect={(c) => set({ country: c.name })} buttonClassName={selectClass(!!errors.country)} />
                    </Row>
                  </>
                )}

                {step === 3 && (
                  <>
                    <fieldset aria-describedby={describedBy("passport")} className="grid gap-4">
                      <legend className="text-[12px] font-semibold uppercase tracking-[0.2em] text-(--cx-mute)">
                        {FORM.labels.passport}
                        <span aria-hidden className="text-(--cx-gold)"> *</span>
                      </legend>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {FORM.passportOptions.map((o, i) => (
                          <label key={o.value} className="group relative cursor-pointer">
                            <input
                              id={i === 0 ? "cx-passport" : undefined}
                              type="radio"
                              name="passport"
                              value={o.value}
                              checked={draft.passport === o.value}
                              onChange={() => set({ passport: o.value })}
                              className="peer sr-only"
                            />
                            <span className="inline-flex min-h-12 items-center rounded-full border border-(--cx-white)/25 px-5 text-[15px] text-(--cx-white) transition-colors duration-300 group-hover:border-(--cx-white)/50 peer-checked:border-(--cx-gold) peer-checked:bg-(--cx-gold) peer-checked:text-(--cx-ink) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-(--cx-white) md:text-[16px]">
                              {o.label}
                            </span>
                          </label>
                        ))}
                      </div>
                      {errors.passport && (
                        <p id="cx-passport-error" className="text-[14px] font-medium text-(--cx-error)">
                          {errors.passport}
                        </p>
                      )}
                    </fieldset>
                    <Row id="cx-notes" label={FORM.labels.notes} optional>
                      <textarea id="cx-notes" rows={3} maxLength={2000} value={draft.notes}
                        onChange={(e) => set({ notes: e.target.value })} placeholder={FORM.placeholders.notes}
                        className={`${INPUT} h-auto resize-y py-3 ${inputState(false)}`} />
                    </Row>
                  </>
                )}

                {failure && (
                  <p role="alert" className="border-l-2 border-(--cx-error) py-1 pl-4 text-[15px] font-medium text-(--cx-error)">
                    {failure}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <button
                    type="submit"
                    disabled={sending}
                    className="group inline-flex items-center gap-3 rounded-full bg-(--cx-gold) py-3.5 pl-7 pr-3.5 text-[16px] font-semibold text-(--cx-ink) transition-colors duration-300 hover:bg-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) disabled:opacity-70"
                  >
                    {step < 3 ? FORM.next : sending ? FORM.sending : FORM.submit}
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--cx-ink)/10">
                      {sending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <ArrowRight size={17} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />}
                    </span>
                  </button>
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={() => go(step - 1)}
                      disabled={sending}
                      className="inline-flex items-center gap-2 rounded-full px-2 py-3 text-[15px] font-medium text-(--cx-mute) transition-colors hover:text-(--cx-white) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white)"
                    >
                      <ArrowLeft size={16} aria-hidden />
                      {FORM.back}
                    </button>
                  )}
                </div>
                {step === 3 && (
                  <p className="-mt-3 text-[13px] text-(--cx-mute)">
                    {FORM.privacy}{" "}
                    <Link href={FORM.privacyLink.href} className="underline decoration-(--cx-gold)/50 underline-offset-4 hover:text-(--cx-white)">
                      {FORM.privacyLink.label}
                    </Link>
                  </p>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES } from "@/lib/countries";
import { isValidMobile, splitE164 } from "@/lib/phone";

/**
 * The application form on /free-china-trip/.
 *
 * It sends through /api/contact, the Contact Us endpoint, rather than a table
 * of its own: an application is a message to the team, and it arrives in the
 * admin console's Contact messages, with the customer's number and rotation
 * queue entry, like any other. The message opens with a line that says what
 * it is, so it cannot be mistaken for a general enquiry.
 *
 * No sign-in, as on /contact/; someone signed in has their name, email and
 * mobile filled in, as the freight form does, into fields that are still
 * empty. The mobile is checked the way every form on the site checks it: a
 * real mobile number for the dial code chosen.
 *
 * Drawn in the site's typographic style (the /shipping/ page's): underlined
 * fields on the warm off-white ground, navy ink, the teal accent.
 */

interface Draft {
  fullName: string;
  companyName: string;
  email: string;
  phoneIso: string;
  phoneCode: string;
  phone: string;
  country: string;
  sourcing: string;
  travelWhen: string;
  notes: string;
}
type FieldName = "fullName" | "email" | "phone" | "country" | "sourcing";

const EMPTY: Draft = {
  fullName: "", companyName: "", email: "", phoneIso: "in", phoneCode: "+91", phone: "",
  country: "", sourcing: "", travelWhen: "", notes: "",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER: FieldName[] = ["fullName", "email", "phone", "country", "sourcing"];

function validate(d: Draft): Partial<Record<FieldName, string>> {
  const e: Partial<Record<FieldName, string>> = {};
  if (!d.fullName.trim()) e.fullName = "Enter your name.";
  if (!d.email.trim()) e.email = "Enter your email.";
  else if (!EMAIL_RE.test(d.email.trim())) e.email = "That email doesn't look complete.";
  if (!d.phone) e.phone = "Enter your mobile number.";
  else if (!isValidMobile(d.phone, d.phoneIso)) e.phone = `That isn't a valid mobile number for ${d.phoneCode}.`;
  if (!d.country) e.country = "Choose your country.";
  if (!d.sourcing.trim()) e.sourcing = "Tell us what you want to source.";
  return e;
}

/** The message the team reads in the console: what it is, first. */
function message(d: Draft) {
  return [
    "FREE CHINA BUSINESS TRIP: application (from affhan.com/free-china-trip/)",
    "",
    `What they want to source: ${d.sourcing.trim()}`,
    `When they would like to travel: ${d.travelWhen.trim() || "not given"}`,
    `Notes: ${d.notes.trim() || "none"}`,
  ].join("\n");
}

function lineInput(bad: boolean) {
  return `h-12 block w-full rounded-none border-b bg-transparent px-0 text-[17px] text-[#08222e] transition-[border-color,box-shadow] duration-200 placeholder:text-[#08222e]/25 focus:outline-none ${
    bad
      ? "border-[#b42318] focus:shadow-[inset_0_-1px_0_0_#b42318]"
      : "border-[#08222e]/25 hover:border-[#08222e]/50 focus:border-[#176579] focus:shadow-[inset_0_-1px_0_0_#176579]"
  }`;
}
function lineSelect(bad: boolean) {
  return `h-12! rounded-none! border-x-0! border-t-0! bg-transparent! px-0! text-[17px]! text-[#08222e]! focus-visible:ring-0! focus-visible:shadow-[inset_0_-1px_0_0_#176579]! ${
    bad ? "border-[#b42318]!" : "border-[#08222e]/25! hover:border-[#08222e]/50! focus-visible:border-[#176579]!"
  }`;
}

function Field({ id, label, required, optional, error, children }: {
  id: string; label: string; required?: boolean; optional?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
        {required && <span aria-hidden className="text-[#b42318]"> *</span>}
        {optional && <span className="font-normal text-[#5a6e77]"> (optional)</span>}
      </label>
      {children}
      {error && <p id={`${id}-error`} className="text-[13px] font-medium text-[#b42318]">{error}</p>}
    </div>
  );
}

export function ChinaTripApplyForm() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<"editing" | "sending" | "sent">("editing");
  const [failure, setFailure] = useState<string | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

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

  useEffect(() => {
    if (phase === "sent") doneRef.current?.focus();
  }, [phase]);

  const errors = attempted ? validate(draft) : {};
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const describedBy = (f: FieldName) => (errors[f] ? `ct-${f}-error` : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    setAttempted(true);
    const problems = validate(draft);
    const first = ORDER.find((f) => problems[f]);
    if (first) {
      setFailure(Object.keys(problems).length === 1 ? "One field needs another look." : `${Object.keys(problems).length} fields need another look.`);
      document.getElementById(`ct-${first}`)?.focus();
      return;
    }
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
      if (res.ok) { setPhase("sent"); return; }
      const body = await res.json().catch(() => ({}));
      setPhase("editing");
      setFailure(typeof body.error === "string" ? body.error : "That didn't go through. Please try again.");
    } catch {
      setPhase("editing");
      setFailure("We couldn't reach Affhan. Check your connection and try again; everything you typed is still here.");
    }
  }

  if (phase === "sent") {
    return (
      <div className="border-t-2 border-[#08222e] pt-8">
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">Application received</span>
        <h3 ref={doneRef} tabIndex={-1} className="mt-5 text-3xl font-medium tracking-[-0.02em] outline-none lg:text-4xl">
          Thank you, {draft.fullName.trim().split(/\s+/)[0]}.
        </h3>
        <p className="mt-6 max-w-2xl text-[22px] font-medium leading-snug tracking-[-0.01em] lg:text-[26px]">
          Our team will contact you as soon as possible.
        </p>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-[#5a6e77]">
          On <strong className="font-semibold text-[#08222e]">{draft.phoneCode} {draft.phone}</strong> or{" "}
          <strong className="break-words font-semibold text-[#08222e]">{draft.email.trim()}</strong>, to talk through your trip.
        </p>
      </div>
    );
  }

  const countrySelected = COUNTRIES.find((c) => c.name === draft.country) ?? null;
  const phoneCountry = COUNTRIES.find((c) => c.iso === draft.phoneIso && c.dial === draft.phoneCode) ?? null;
  const sending = phase === "sending";

  return (
    <form noValidate onSubmit={submit} aria-busy={sending} className="grid gap-10">
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        <Field id="ct-fullName" label="Your name" required error={errors.fullName}>
          <input id="ct-fullName" type="text" autoComplete="name" maxLength={100} value={draft.fullName}
            onChange={(e) => set({ fullName: e.target.value })} placeholder="Full name" aria-required
            aria-invalid={errors.fullName ? true : undefined} aria-describedby={describedBy("fullName")} className={lineInput(!!errors.fullName)} />
        </Field>
        <Field id="ct-companyName" label="Company" optional>
          <input id="ct-companyName" type="text" autoComplete="organization" maxLength={200} value={draft.companyName}
            onChange={(e) => set({ companyName: e.target.value })} placeholder="Your company" className={lineInput(false)} />
        </Field>
        <Field id="ct-email" label="Email" required error={errors.email}>
          <input id="ct-email" type="email" autoComplete="email" maxLength={200} value={draft.email}
            onChange={(e) => set({ email: e.target.value })} placeholder="you@company.com" aria-required
            aria-invalid={errors.email ? true : undefined} aria-describedby={describedBy("email")} className={lineInput(!!errors.email)} />
        </Field>
        <Field id="ct-phone" label="Mobile number" required error={errors.phone}>
          <div className="flex items-end gap-4">
            <div className="w-[5.75rem] shrink-0">
              <FlagSelect mode="dial" placeholder="Code" selected={phoneCountry}
                onSelect={(c) => set({ phoneIso: c.iso, phoneCode: c.dial })} buttonClassName={lineSelect(false)} />
            </div>
            <input id="ct-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={18} value={draft.phone}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "") })} placeholder="9876543210" aria-required
              aria-invalid={errors.phone ? true : undefined} aria-describedby={describedBy("phone")}
              className={`min-w-0 flex-1 ${lineInput(!!errors.phone)}`} />
          </div>
        </Field>
        <Field id="ct-country" label="Country" required error={errors.country}>
          <FlagSelect id="ct-country" mode="country" placeholder="Select country" selected={countrySelected}
            onSelect={(c) => set({ country: c.name })} buttonClassName={lineSelect(!!errors.country)} />
        </Field>
        <Field id="ct-travelWhen" label="When would you like to travel?" optional>
          <input id="ct-travelWhen" type="text" maxLength={100} value={draft.travelWhen}
            onChange={(e) => set({ travelWhen: e.target.value })} placeholder="e.g. next month, or March" className={lineInput(false)} />
        </Field>
      </div>

      <Field id="ct-sourcing" label="What do you want to source?" required error={errors.sourcing}>
        <input id="ct-sourcing" type="text" maxLength={300} value={draft.sourcing}
          onChange={(e) => set({ sourcing: e.target.value })} placeholder="e.g. LED lights, furniture, packaging" aria-required
          aria-invalid={errors.sourcing ? true : undefined} aria-describedby={describedBy("sourcing")} className={lineInput(!!errors.sourcing)} />
      </Field>

      <Field id="ct-notes" label="Anything else we should know" optional>
        <textarea id="ct-notes" rows={3} maxLength={2000} value={draft.notes} onChange={(e) => set({ notes: e.target.value })}
          placeholder="Your business, the suppliers or cities you'd like to visit, dates that suit you"
          className="block w-full resize-y rounded-none border-b border-[#08222e]/25 bg-transparent px-0 py-2 text-[17px] text-[#08222e] placeholder:text-[#08222e]/25 hover:border-[#08222e]/50 focus:border-[#176579] focus:shadow-[inset_0_-1px_0_0_#176579] focus:outline-none" />
      </Field>

      {failure && (
        <p role="alert" className="border-l-2 border-[#b42318] py-1 pl-4 text-[15px] font-medium text-[#b42318]">{failure}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="submit" disabled={sending}
          className="group inline-flex items-center gap-3 rounded-full bg-[#08222e] py-3 pl-7 pr-3 text-[16px] font-medium text-[#FAFAF7] transition-colors hover:bg-[#176579] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176579]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF7] disabled:opacity-70">
          {sending ? "Sending…" : "Apply for the trip"}
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FAFAF7]/15">
            {sending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <ArrowRight size={17} aria-hidden className="transition-transform group-hover:translate-x-0.5" />}
          </span>
        </button>
        <p className="text-[13px] text-[#5a6e77]">
          Fields marked <span className="text-[#b42318]">*</span> are required.
        </p>
      </div>
      <p className="-mt-4 flex items-center gap-2 text-[13px] text-[#5a6e77]">
        <Check size={14} className="text-[#176579]" aria-hidden />
        Your details are used to arrange your trip. Affhan does not sell or share them.
      </p>
    </form>
  );
}

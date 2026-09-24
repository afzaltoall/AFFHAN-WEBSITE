"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Loader2, Plane, Ship, type LucideIcon } from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { Reveal } from "@/components/ui/Reveal";
import { COUNTRIES } from "@/lib/countries";
import {
  COMMODITY_TYPES,
  LIMITS,
  TERMS,
  methodLabel,
  methodsFor,
  termsLabel,
  termsName,
  validateShipmentInquiry,
  type CleanShipmentInquiry,
  type FieldErrors,
  type ShipmentField,
  type ShipmentInquiryInput,
} from "@/lib/shipment-inquiry";

/**
 * The freight quote request at the foot of /shipping/.
 *
 * It asks for what the freight CRM's enquiry screen records and nothing else,
 * and it checks with validateShipmentInquiry, the function the API runs on
 * arrival, so the form cannot let through what the server will refuse.
 *
 * Drawn in the page's own typographic language (see ShippingContent): the
 * warm off-white ground, navy ink, hairline rules between numbered sections
 * the way the journey numbers its stages, underlined fields rather than boxes,
 * and the hero's pill for the send button. Beside the form the request is
 * read back as one sentence, built from the four things a rate is made of.
 *
 * Plain <input>s rather than ui/input: that component's classes include
 * rounded-full and bg-white, and cn() in lib/utils only joins class names, so
 * an override sitting beside them wins or loses on stylesheet order.
 */

interface Draft {
  customerName: string;
  phoneIso: string;
  phoneCode: string;
  /** National digits only; the dial code goes in front when it is sent. */
  phone: string;
  email: string;
  country: string;
  commodity: string;
  commodityType: string;
  mode: string;
  method: string;
  portOfLoading: string;
  portOfDischarge: string;
  terms: string;
  cbm: string;
  weightKg: string;
  cartonBoxes: string;
  notes: string;
}

/** Everything about the shipment, which "Send another request" clears. */
const NO_SHIPMENT = {
  commodity: "",
  commodityType: "",
  mode: "",
  method: "",
  portOfLoading: "",
  portOfDischarge: "",
  terms: "",
  cbm: "",
  weightKg: "",
  cartonBoxes: "",
  notes: "",
};

const EMPTY: Draft = {
  customerName: "",
  phoneIso: "in",
  phoneCode: "+91",
  phone: "",
  email: "",
  country: "",
  ...NO_SHIPMENT,
};

/** Top to bottom, so a failed send can take the customer to the first problem. */
const FIELD_ORDER: ShipmentField[] = [
  "customerName", "phone", "email", "country",
  "commodity", "commodityType",
  "mode", "method", "portOfLoading", "portOfDischarge", "terms",
  "cbm", "weightKg", "cartonBoxes", "notes",
];

const MODE_CARDS: { value: string; title: string; sub: string; icon: LucideIcon }[] = [
  { value: "SEA", title: "Sea freight", sub: "Full or shared container", icon: Ship },
  { value: "AIR", title: "Air freight", sub: "Airport to airport", icon: Plane },
];

// What staff will ask next for these two, asked up front.
const CARGO_HINTS: Record<string, string> = {
  HAZARDOUS: "If you have the safety data sheet (MSDS) or the UN number, add it in the notes.",
  PERISHABLE: "Add the temperature it has to travel at in the notes.",
};

const STEPS = [
  "Send the form and your request gets a reference number straight away.",
  "The shipping desk looks over the lane, the cargo and the terms.",
  "We come back to you with a rate and a routing.",
];

const toInput = (d: Draft): ShipmentInquiryInput => ({
  customerName: d.customerName,
  // Empty stays empty, so the message is "enter a number" rather than
  // "that number is invalid" for a field nobody has typed in.
  phone: d.phone ? `${d.phoneCode} ${d.phone}` : "",
  email: d.email,
  country: d.country,
  commodity: d.commodity,
  commodityType: d.commodityType,
  mode: d.mode,
  portOfLoading: d.portOfLoading,
  portOfDischarge: d.portOfDischarge,
  terms: d.terms,
  cbm: d.cbm,
  cartonBoxes: d.cartonBoxes,
  weightKg: d.weightKg,
  method: d.method,
  notes: d.notes,
});

const prefersMotion = () =>
  typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Put the cursor in a field and bring it into view clear of the fixed navbar. */
function focusField(field: ShipmentField) {
  const el = document.getElementById(`sq-${field}`);
  if (!el) return;
  const target = el.matches("input, textarea, button")
    ? el
    : el.querySelector<HTMLElement>("input:checked") ?? el.querySelector<HTMLElement>("input");
  target?.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: prefersMotion() ? "smooth" : "auto" });
}

type Phase =
  | { kind: "editing" }
  | { kind: "sending" }
  | { kind: "sent"; referenceNo: string; sent: CleanShipmentInquiry };

export function ShippingQuoteSection() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  // Errors appear for a field once it has been left with something in it, and
  // for every field once a send has been tried. Nobody is told off for tabbing
  // through an empty form.
  const [touched, setTouched] = useState<ReadonlySet<ShipmentField>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<ShipmentField | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const live = useMemo(() => {
    const r = validateShipmentInquiry(toInput(draft));
    return r.ok ? {} : r.errors;
  }, [draft]);

  const filled = (f: ShipmentField) => {
    const v = f === "phone" ? draft.phone : draft[f];
    return typeof v === "string" && v.trim() !== "";
  };
  const errorFor = (f: ShipmentField): string | undefined =>
    serverErrors[f] ?? (attempted || (touched.has(f) && filled(f)) ? live[f] : undefined);

  const leave = (f: ShipmentField) => () =>
    setTouched((t) => (t.has(f) ? t : new Set(t).add(f)));

  const clearServer = (...fields: ShipmentField[]) =>
    setServerErrors((e) => {
      if (!fields.some((f) => f in e)) return e;
      const next = { ...e };
      for (const f of fields) delete next[f];
      return next;
    });

  const update = (patch: Partial<Draft>, ...fields: ShipmentField[]) => {
    setDraft((d) => ({ ...d, ...patch }));
    setFailure(null);
    clearServer(...fields);
  };

  const text = (f: Exclude<ShipmentField, "phone">) => ({
    id: `sq-${f}`,
    name: f,
    value: draft[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update({ [f]: e.target.value } as Partial<Draft>, f),
    onBlur: leave(f),
    "aria-invalid": errorFor(f) ? true : undefined,
    "aria-describedby": errorFor(f) ? `sq-${f}-error` : undefined,
  });

  // Air has one method and it is chosen for them; switching to sea keeps FCL or
  // LCL if one was already picked and otherwise asks.
  const pickMode = (mode: string) =>
    setDraft((d) => {
      const method = mode === "AIR"
        ? "AIR_FREIGHT"
        : methodsFor(mode).some((m) => m.value === d.method) ? d.method : "";
      return { ...d, mode, method };
    });

  const onModeChange = (mode: string) => {
    pickMode(mode);
    setFailure(null);
    clearServer("mode", "method");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind === "sending") return;
    setAttempted(true);

    const result = validateShipmentInquiry(toInput(draft));
    if (!result.ok) {
      const bad = FIELD_ORDER.filter((f) => result.errors[f]);
      setFailure(bad.length === 1 ? "One field needs another look." : `${bad.length} fields need another look.`);
      focusField(bad[0]);
      return;
    }

    setFailure(null);
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/shipping-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toInput(draft)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.referenceNo === "string") {
        setPhase({ kind: "sent", referenceNo: body.referenceNo, sent: result.value });
        return;
      }
      setPhase({ kind: "editing" });
      if (res.status === 400 && body.fields && typeof body.fields === "object") {
        const fields = body.fields as FieldErrors;
        setServerErrors(fields);
        setFailure(body.error || "Some details need another look.");
        const first = FIELD_ORDER.find((f) => fields[f]);
        if (first) focusField(first);
        return;
      }
      setFailure("Your request didn't go through. Everything you typed is still here, so send it again in a moment.");
    } catch {
      setPhase({ kind: "editing" });
      setFailure("We couldn't reach Affhan. Check your connection and send it again; everything you typed is still here.");
    }
  }

  function sendAnother() {
    setDraft((d) => ({ ...d, ...NO_SHIPMENT }));
    setTouched(new Set());
    setAttempted(false);
    setServerErrors({});
    setFailure(null);
    setCopied(false);
    setPhase({ kind: "editing" });
    focusNext.current = "commodity";
  }

  async function copyReference(ref: string, el: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an insecure origin, a refused permission): select the
      // text instead, so a Ctrl+C still works.
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  // The confirmation is far shorter than the form, so without this the reader
  // is left looking at whatever was below it.
  useEffect(() => {
    if (phase.kind !== "sent") return;
    cardRef.current?.scrollIntoView({ block: "start", behavior: prefersMotion() ? "smooth" : "auto" });
    successRef.current?.focus({ preventScroll: true });
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind === "editing" && focusNext.current) {
      focusField(focusNext.current);
      focusNext.current = null;
    }
  });

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const sending = phase.kind === "sending";
  const phoneCountry = COUNTRIES.find((c) => c.iso === draft.phoneIso && c.dial === draft.phoneCode)
    ?? COUNTRIES.find((c) => c.iso === draft.phoneIso)
    ?? null;
  const methodOptions = draft.mode ? methodsFor(draft.mode) : [];
  const air = draft.mode === "AIR";

  return (
    <section
      id="shipping-quote"
      aria-labelledby="shipping-quote-title"
      className="scroll-mt-16 bg-[#FAFAF7] text-[#08222e]"
    >
      <div className="mx-auto w-full max-w-[1500px] px-6 py-24 md:px-12 lg:px-16 lg:py-32">
        {/* The hero's composition: the heading takes the width, the copy
            sits on its baseline to the right. */}
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal className="lg:col-span-7">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
              Freight quote
            </span>
            <h2
              id="shipping-quote-title"
              className="mt-4 text-[11vw] font-medium leading-[0.9] tracking-[-0.04em] sm:text-[7vw] lg:text-[5vw]"
            >
              Request a freight quote
            </h2>
          </Reveal>
          <div className="lg:col-span-5 lg:self-end">
            <p className="text-[18px] leading-relaxed text-[#5a6e77]">
              A rate comes down to four things: the volume, the mode, the lane, and how much
              of the job the quote covers. This form asks for exactly those, and the shipping
              desk comes back with a rate and a routing.
            </p>
            <ol className="mt-8 border-t border-[#08222e]/10">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-5 border-b border-[#08222e]/10 py-3.5">
                  <span className="pt-[3px] text-[11px] font-bold tracking-[0.2em] text-[#176579] tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] leading-relaxed text-[#5a6e77]">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-16 grid gap-12 lg:mt-24 lg:grid-cols-12 lg:gap-14">
          {/* The request read back as a sentence, kept in view while the form
              scrolls past. The column stretches to the form's height, which
              is what lets its contents stick. */}
          <div className="hidden lg:col-span-4 lg:block">
            <div aria-hidden className="sticky top-28 border-t-2 border-[#08222e] pt-7">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                Your request
              </span>
              <RequestSentence v={draft} className="mt-5 text-[28px] xl:text-[32px]" />
              <p className="mt-8 border-t border-[#08222e]/10 pt-4 text-[14px] leading-relaxed text-[#5a6e77]">
                {phase.kind === "sent" ? (
                  <>
                    Reference{" "}
                    <span className="font-bold tabular-nums text-[#08222e]">{phase.referenceNo}</span>
                  </>
                ) : (
                  "A reference number is issued the moment you send it."
                )}
              </p>
            </div>
          </div>

          <div ref={cardRef} className="min-w-0 scroll-mt-24 lg:col-span-8">
            {phase.kind === "sent" ? (
              <Sent
                phase={phase}
                copied={copied}
                onCopy={copyReference}
                onAnother={sendAnother}
                headingRef={successRef}
              />
            ) : (
              // method="post" so that a submit without JavaScript cannot put a
              // phone number into the address bar as a query string.
              <form method="post" noValidate onSubmit={submit} aria-busy={sending}>
                <Group n="01" title="Your details" id="sq-group-you">
                  <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
                    <Field id="sq-customerName" label="Company or your name" required error={errorFor("customerName")}>
                      <input
                        {...text("customerName")}
                        type="text"
                        autoComplete="organization"
                        maxLength={LIMITS.customerName}
                        placeholder="Company, or your full name"
                        aria-required
                        className={lineInput(!!errorFor("customerName"))}
                      />
                    </Field>

                    <Field id="sq-phone" label="Mobile number" required error={errorFor("phone")}>
                      <div className="flex items-end gap-4">
                        <div className="w-[5.75rem] shrink-0">
                          <FlagSelect
                            mode="dial"
                            placeholder="Code"
                            selected={phoneCountry}
                            onSelect={(c) => update({ phoneIso: c.iso, phoneCode: c.dial }, "phone")}
                            buttonClassName={lineSelect(false)}
                          />
                        </div>
                        <input
                          id="sq-phone"
                          name="phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={18}
                          value={draft.phone}
                          // Digits only, so pasted formatting cannot pass for a
                          // longer number than it is.
                          onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "") }, "phone")}
                          onBlur={leave("phone")}
                          placeholder="9876543210"
                          aria-required
                          aria-invalid={errorFor("phone") ? true : undefined}
                          aria-describedby={errorFor("phone") ? "sq-phone-error" : undefined}
                          className={`min-w-0 flex-1 ${lineInput(!!errorFor("phone"))}`}
                        />
                      </div>
                    </Field>

                    <Field id="sq-email" label="Email" optional error={errorFor("email")}>
                      <input
                        {...text("email")}
                        type="email"
                        autoComplete="email"
                        maxLength={LIMITS.email}
                        placeholder="you@company.com"
                        className={lineInput(!!errorFor("email"))}
                      />
                    </Field>

                    <Field id="sq-country" label="Shipment country" required error={errorFor("country")}>
                      <FlagSelect
                        id="sq-country"
                        mode="country"
                        placeholder="Select country"
                        selected={COUNTRIES.find((c) => c.name === draft.country) ?? null}
                        onSelect={(c) => {
                          update({ country: c.name }, "country");
                          setTouched((t) => new Set(t).add("country"));
                        }}
                        buttonClassName={lineSelect(!!errorFor("country"))}
                      />
                    </Field>
                  </div>
                </Group>

                <Group n="02" title="The cargo" id="sq-group-cargo">
                  <Field id="sq-commodity" label="Commodity" required error={errorFor("commodity")}>
                    <input
                      {...text("commodity")}
                      type="text"
                      autoComplete="off"
                      maxLength={LIMITS.commodity}
                      placeholder="What the goods are, e.g. LED panel lights"
                      aria-required
                      className={lineInput(!!errorFor("commodity"))}
                    />
                  </Field>

                  <Choice
                    id="sq-commodityType"
                    legend="Type of cargo"
                    error={errorFor("commodityType")}
                    hint={CARGO_HINTS[draft.commodityType]}
                  >
                    <div className="flex flex-wrap gap-2 sm:gap-2.5">
                      {COMMODITY_TYPES.map((t) => (
                        <Pill
                          key={t.value}
                          name="commodityType"
                          value={t.value}
                          on={draft.commodityType === t.value}
                          onPick={() => update({ commodityType: t.value }, "commodityType")}
                        >
                          {t.label}
                        </Pill>
                      ))}
                    </div>
                  </Choice>
                </Group>

                <Group n="03" title="Route and terms" id="sq-group-route">
                  <Choice id="sq-mode" legend="Mode of shipment" error={errorFor("mode")}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {MODE_CARDS.map(({ value, title, sub, icon: Icon }) => {
                        const on = draft.mode === value;
                        return (
                          <label
                            key={value}
                            className={`flex cursor-pointer select-none items-center gap-4 rounded-2xl border p-5 transition-colors ${FOCUS_RING} ${
                              on
                                ? "border-[#08222e] bg-[#08222e] text-[#FAFAF7]"
                                : "border-[#08222e]/15 hover:border-[#08222e]/45"
                            }`}
                          >
                            <input
                              type="radio"
                              required
                              name="mode"
                              value={value}
                              checked={on}
                              onChange={() => onModeChange(value)}
                              className="sr-only"
                            />
                            <Icon aria-hidden size={28} strokeWidth={1.5} className={on ? "text-[#FAFAF7]" : "text-[#176579]"} />
                            <span className="min-w-0">
                              <span className="block text-xl font-medium tracking-tight">{title}</span>
                              <span className={`block text-[13px] ${on ? "text-[#FAFAF7]/70" : "text-[#5a6e77]"}`}>{sub}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </Choice>

                  <Choice id="sq-method" legend="Method of shipment" error={errorFor("method")}>
                    {methodOptions.length > 0 ? (
                      <div className={`grid gap-3 ${methodOptions.length > 1 ? "sm:grid-cols-2" : ""}`}>
                        {methodOptions.map((m) => {
                          const on = draft.method === m.value;
                          return (
                            <label
                              key={m.value}
                              className={`flex cursor-pointer select-none items-center justify-between gap-3 rounded-2xl border px-5 py-4 transition-colors ${FOCUS_RING} ${
                                on
                                  ? "border-[#08222e] bg-[#08222e] text-[#FAFAF7]"
                                  : "border-[#08222e]/15 hover:border-[#08222e]/45"
                              }`}
                            >
                              <input
                                type="radio"
                                required
                                name="method"
                                value={m.value}
                                checked={on}
                                onChange={() => update({ method: m.value }, "method")}
                                className="sr-only"
                              />
                              <span className="min-w-0">
                                <span className="block text-lg font-medium tracking-tight">{m.label}</span>
                                <span className={`block text-[13px] ${on ? "text-[#FAFAF7]/70" : "text-[#5a6e77]"}`}>{m.name}</span>
                              </span>
                              {on && <Check aria-hidden size={18} strokeWidth={2.5} className="shrink-0" />}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="border-b border-dashed border-[#08222e]/25 py-3 text-[15px] text-[#5a6e77]">
                        Choose sea or air above, and the ways to ship by it appear here.
                      </p>
                    )}
                  </Choice>

                  <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
                    <Field id="sq-portOfLoading" label="Port of loading (POL)" required error={errorFor("portOfLoading")}>
                      <input
                        {...text("portOfLoading")}
                        type="text"
                        autoComplete="off"
                        maxLength={LIMITS.port}
                        placeholder={air ? "e.g. Guangzhou (CAN)" : "e.g. Shanghai"}
                        aria-required
                        className={lineInput(!!errorFor("portOfLoading"))}
                      />
                    </Field>
                    <Field id="sq-portOfDischarge" label="Port of discharge (POD)" required error={errorFor("portOfDischarge")}>
                      <input
                        {...text("portOfDischarge")}
                        type="text"
                        autoComplete="off"
                        maxLength={LIMITS.port}
                        placeholder={air ? "e.g. Chennai (MAA)" : "e.g. Chennai"}
                        aria-required
                        className={lineInput(!!errorFor("portOfDischarge"))}
                      />
                    </Field>
                  </div>

                  <Choice
                    id="sq-terms"
                    legend="Terms (Incoterm)"
                    error={errorFor("terms")}
                    hint={
                      draft.terms
                        ? draft.terms === "OTHER"
                          ? "Say which terms in the notes."
                          : `${termsLabel(draft.terms)}: ${termsName(draft.terms)}`
                        : "The term on your supplier's quote. Not sure? Choose Other and say so in the notes."
                    }
                  >
                    {/* Five short codes: an even grid on a phone, where a
                        wrapping row left "Other" alone on a line of its own. */}
                    <div className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:gap-2.5">
                      {TERMS.map((t) => (
                        <Pill
                          key={t.value}
                          cell
                          name="terms"
                          value={t.value}
                          title={t.name}
                          on={draft.terms === t.value}
                          onPick={() => update({ terms: t.value }, "terms")}
                        >
                          {t.label}
                          {t.value !== "OTHER" && <span className="sr-only">, {t.name}</span>}
                        </Pill>
                      ))}
                    </div>
                  </Choice>
                </Group>

                <Group n="04" title="Size of the load" id="sq-group-load">
                  {/* The figures a rate is built from, set as figures. */}
                  <div className="grid gap-x-10 gap-y-9 sm:grid-cols-3">
                    <Field
                      id="sq-cbm"
                      label="Volume (CBM)"
                      required
                      error={errorFor("cbm")}
                      hint="Carton length × width × height in metres, times the cartons."
                    >
                      <Suffixed unit="m³">
                        <input
                          {...text("cbm")}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          maxLength={14}
                          placeholder="68"
                          aria-required
                          className={lineInput(!!errorFor("cbm"), "figure")}
                        />
                      </Suffixed>
                    </Field>
                    <Field id="sq-weightKg" label="Weight" required error={errorFor("weightKg")} hint="Gross, packing included.">
                      <Suffixed unit="kg">
                        <input
                          {...text("weightKg")}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          maxLength={16}
                          placeholder="6500"
                          aria-required
                          className={lineInput(!!errorFor("weightKg"), "figure")}
                        />
                      </Suffixed>
                    </Field>
                    <Field id="sq-cartonBoxes" label="Cartons" optional error={errorFor("cartonBoxes")}>
                      <input
                        {...text("cartonBoxes")}
                        // Whole cartons, so stripping everything but digits
                        // cannot misread a decimal the way it could for CBM.
                        onChange={(e) => update({ cartonBoxes: e.target.value.replace(/\D/g, "") }, "cartonBoxes")}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={7}
                        placeholder="120"
                        className={lineInput(!!errorFor("cartonBoxes"), "figure-plain")}
                      />
                    </Field>
                  </div>

                  <Field id="sq-notes" label="Anything else we should know" optional error={errorFor("notes")}>
                    <textarea
                      {...text("notes")}
                      rows={4}
                      maxLength={LIMITS.notes}
                      placeholder="Ready date, pickup address, oversized pieces, a temperature range…"
                      className="min-h-[128px] w-full resize-y rounded-2xl border border-[#08222e]/20 bg-transparent p-4 text-[17px] leading-relaxed text-[#08222e] transition-colors placeholder:text-[#08222e]/35 hover:border-[#08222e]/45 focus:border-[#176579] focus:outline-none focus:ring-1 focus:ring-[#176579]"
                    />
                  </Field>
                </Group>

                <div className="border-t border-[#08222e]/20 pt-10">
                  {/* Below lg the sentence beside the form is out of sight, so
                      it is read back here instead, just before sending. */}
                  <div aria-hidden className="mb-10 lg:hidden">
                    <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                      Your request
                    </span>
                    <RequestSentence v={draft} className="mt-4 text-[24px]" />
                  </div>

                  {failure && (
                    <p role="alert" className="mb-8 border-l-2 border-[#b42318] py-1 pl-4 text-[15px] font-medium text-[#b42318]">
                      {failure}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                    {/* The hero's own button. */}
                    <button
                      type="submit"
                      disabled={sending}
                      className="group inline-flex items-center gap-3 rounded-full bg-[#08222e] py-1.5 pl-7 pr-1.5 text-[16px] font-medium text-[#FAFAF7] transition-all duration-300 hover:gap-4 hover:bg-[#176579] hover:shadow-lg hover:shadow-[#176579]/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176579]/30 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {sending ? "Sending…" : "Send quote request"}
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FAFAF7] text-[#08222e] transition-transform duration-300 group-hover:scale-110">
                        {sending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} aria-hidden />}
                      </span>
                    </button>
                    <p className="text-[13px] text-[#5a6e77]">
                      Fields marked <span className="text-[#b42318]">*</span> are required.
                    </p>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Keyboard focus on a radio drawn as a pill or a card, off the page's ground. */
const FOCUS_RING =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#176579]/50 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[#FAFAF7]";

/**
 * An underlined field. `figure` sets the three load figures large, with room
 * on the right for their unit; `figure-plain` is the same without the unit.
 * Size and padding live here so no caller has to override them.
 */
function lineInput(bad: boolean, size: "text" | "figure" | "figure-plain" = "text") {
  const shape =
    size === "text"
      ? "h-12 px-0 text-[17px]"
      : `h-16 pl-0 ${size === "figure" ? "pr-12" : "pr-0"} text-[34px] font-medium tracking-[-0.03em] tabular-nums`;
  return `${shape} block w-full rounded-none border-b bg-transparent text-[#08222e] transition-[border-color,box-shadow] duration-200 placeholder:text-[#08222e]/25 focus:outline-none ${
    bad
      ? "border-[#b42318] focus:shadow-[inset_0_-1px_0_0_#b42318]"
      : "border-[#08222e]/25 hover:border-[#08222e]/50 focus:border-[#176579] focus:shadow-[inset_0_-1px_0_0_#176579]"
  }`;
}

/**
 * FlagSelect as an underlined field. Its own classes draw a box, and they are
 * joined rather than merged, so every property that differs is set with the
 * important modifier.
 */
function lineSelect(bad: boolean) {
  return `h-12! rounded-none! border-x-0! border-t-0! bg-transparent! px-0! text-[17px]! text-[#08222e]! focus-visible:ring-0! focus-visible:shadow-[inset_0_-1px_0_0_#176579]! ${
    bad ? "border-[#b42318]!" : "border-[#08222e]/25! hover:border-[#08222e]/50! focus-visible:border-[#176579]!"
  }`;
}

function Group({ n, title, id, children }: { n: string; title: string; id: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="grid gap-9 border-t border-[#08222e]/20 pb-14 pt-8 lg:pb-16">
      {/* Numbered the way the journey numbers its stages: the order is the
          order the form is filled in. */}
      <div className="flex items-baseline gap-5">
        <span aria-hidden className="text-4xl font-medium leading-none tracking-tight text-[#08222e]/15 tabular-nums lg:text-5xl">
          {n}
        </span>
        <h3 id={id} className="text-2xl font-bold tracking-tight lg:text-3xl">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Mark({ required, optional }: { required?: boolean; optional?: boolean }) {
  if (required) return <span aria-hidden className="text-[#b42318]"> *</span>;
  if (optional) return <span className="font-normal text-[#5a6e77]"> (optional)</span>;
  return null;
}

function Field({
  id, label, required, optional, hint, error, children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
        <Mark required={required} optional={optional} />
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-[#b42318]">{error}</p>
      ) : hint ? (
        <p className="text-[13px] leading-relaxed text-[#5a6e77]">{hint}</p>
      ) : null}
    </div>
  );
}

/** A radio group: native radios, so arrow keys and screen readers work unaided. */
function Choice({
  id, legend, hint, error, children,
}: {
  id: string;
  legend: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset id={id} aria-describedby={error ? `${id}-error` : undefined} className="grid min-w-0 gap-3">
      <legend className="mb-3 text-[14px] font-semibold">
        {legend}
        <Mark required />
      </legend>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-[#b42318]">{error}</p>
      ) : hint ? (
        <p className="text-[13px] leading-relaxed text-[#5a6e77]">{hint}</p>
      ) : null}
    </fieldset>
  );
}

/** One answer of a short list, as a pill: navy when chosen, like the hero's button. */
function Pill({
  name, value, on, onPick, title, cell, children,
}: {
  name: string;
  value: string;
  on: boolean;
  onPick: () => void;
  title?: string;
  /** Fills a grid cell below sm, centred, instead of sizing to its text. */
  cell?: boolean;
  children: React.ReactNode;
}) {
  const size = cell
    ? "justify-center gap-1 px-1 text-[14px] sm:justify-start sm:gap-1.5 sm:px-4 sm:text-[15px]"
    : "gap-1.5 px-3.5 text-[15px] sm:px-4";
  return (
    <label
      title={title}
      className={`inline-flex cursor-pointer select-none items-center rounded-full border py-2 font-medium transition-colors ${size} ${FOCUS_RING} ${
        on ? "border-[#08222e] bg-[#08222e] text-[#FAFAF7]" : "border-[#08222e]/20 hover:border-[#08222e]/50"
      }`}
    >
      <input type="radio" required name={name} value={value} checked={on} onChange={onPick} className="sr-only" />
      {/* A tick as well as the fill, so the choice does not rest on colour alone. */}
      {on && <Check size={14} strokeWidth={3} aria-hidden className="-ml-0.5" />}
      {children}
    </label>
  );
}

function Suffixed({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span aria-hidden className="pointer-events-none absolute bottom-3.5 right-0 text-lg font-medium text-[#5a6e77]">
        {unit}
      </span>
    </div>
  );
}

/** What the sentence reads: a draft as typed, or a request as sent. */
interface SentenceValues {
  mode: string;
  method: string;
  cbm: string;
  weightKg: string;
  commodity: string;
  portOfLoading: string;
  portOfDischarge: string;
  terms: string;
}

/** "6500" → "6,500"; anything that is not yet a number is shown as typed. */
const figureText = (v: string) => {
  const s = v.trim();
  return /^\d+(\.\d+)?$/.test(s) ? Number(s).toLocaleString("en-IN", { maximumFractionDigits: 3 }) : s;
};

/**
 * The request as one sentence, built from the four things a rate is made of:
 * mode, volume, lane and terms.
 *
 *   Sea freight, FCL — 68 m³ and 6,500 kg of LED panel lights,
 *   Shanghai to Chennai, on FOB terms.
 *
 * What has not been answered yet stays in the sentence as a faint blank, so it
 * says as it fills in what is still missing.
 */
function RequestSentence({ v, className = "" }: { v: SentenceValues; className?: string }) {
  const blank = (s: string) => <span className="text-[#08222e]/25">{s}</span>;
  const said = (s: string, placeholder: string) => (s.trim() ? s.trim() : blank(placeholder));
  const how = v.mode === "SEA"
    ? `Sea freight${v.method ? `, ${methodLabel(v.method)}` : ""}`
    : v.mode === "AIR" ? "Air freight" : "";
  const terms = v.terms === "OTHER" ? "on other terms" : v.terms ? `on ${termsLabel(v.terms)} terms` : "";

  return (
    <p className={`break-words font-medium leading-[1.2] tracking-[-0.02em] text-[#08222e] ${className}`}>
      {how || blank("Sea or air")} — {v.cbm.trim() ? `${figureText(v.cbm)} m³` : blank("___ m³")} and{" "}
      {v.weightKg.trim() ? `${figureText(v.weightKg)} kg` : blank("___ kg")} of {said(v.commodity, "your goods")},{" "}
      {said(v.portOfLoading, "from ___")} to {said(v.portOfDischarge, "___")}, {terms || blank("on ___ terms")}.
    </p>
  );
}

function Sent({
  phase, copied, onCopy, onAnother, headingRef,
}: {
  phase: Extract<Phase, { kind: "sent" }>;
  copied: boolean;
  onCopy: (ref: string, el: HTMLElement | null) => void;
  onAnother: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const refText = useRef<HTMLSpanElement>(null);
  const { referenceNo, sent } = phase;

  return (
    <div className="border-t-2 border-[#08222e] pt-8">
      <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">Request received</span>
      <h3 ref={headingRef} tabIndex={-1} className="mt-5 text-3xl font-medium tracking-[-0.02em] outline-none lg:text-4xl">
        The shipping desk has it.
      </h3>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-5 border-b border-[#08222e]/15 pb-8">
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.2em] text-[#5a6e77]">Your reference</span>
          {/* The one thing on this screen that must never be cut short: it is
              what the customer quotes on the phone. */}
          <span
            ref={refText}
            className="mt-3 block whitespace-nowrap text-[11vw] font-medium leading-none tracking-[-0.04em] tabular-nums sm:text-[8vw] lg:text-[4.75vw]"
          >
            {referenceNo}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onCopy(referenceNo, refText.current)}
          aria-label={copied ? "Reference copied" : "Copy reference"}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#08222e]/20 px-5 text-[14px] font-medium transition-colors hover:border-[#08222e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176579]/50"
        >
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
        </button>
        <span aria-live="polite" className="sr-only">{copied ? "Reference copied" : ""}</span>
      </div>

      <p className="mt-8 max-w-2xl text-[18px] leading-relaxed text-[#5a6e77]">
        Quote it whenever you speak to us about this shipment.
      </p>
      <RequestSentence v={sent} className="mt-8 text-[24px] lg:text-[30px]" />
      <p className="mt-8 max-w-2xl text-[16px] leading-relaxed text-[#5a6e77]">
        We&apos;ll come back to you on <strong className="font-semibold text-[#08222e]">{sent.phone}</strong>
        {sent.email && (
          <>
            {" "}or <strong className="break-words font-semibold text-[#08222e]">{sent.email}</strong>
          </>
        )}{" "}
        with a rate and a routing.
      </p>

      <button
        type="button"
        onClick={onAnother}
        className="group mt-10 inline-flex items-center gap-2 rounded-full border border-[#08222e]/20 px-6 py-3 text-[15px] font-medium transition-colors hover:border-[#08222e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176579]/50"
      >
        Send another request <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" />
      </button>
      <p className="mt-3 text-[13px] text-[#5a6e77]">Your contact details stay filled in.</p>
    </div>
  );
}

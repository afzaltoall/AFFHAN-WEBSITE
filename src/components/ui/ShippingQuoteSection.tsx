"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Building2,
  Check,
  Copy,
  Loader2,
  Package,
  Plane,
  Route,
  Ship,
  type LucideIcon,
} from "lucide-react";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { Reveal } from "@/components/ui/Reveal";
import { COUNTRIES } from "@/lib/countries";
import {
  COMMODITY_TYPES,
  LIMITS,
  TERMS,
  commodityTypeLabel,
  loadSummary,
  methodLabel,
  methodsFor,
  modeLabel,
  routeSummary,
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

  // The success card is far shorter than the form, so without this the reader
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
      className="scroll-mt-16 bg-slate-50 py-16 lg:py-24"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10 xl:gap-14">
        {/* Intro. The column stretches to the form's height, which is what lets
            the ticket at its foot stay in view while the form scrolls past. */}
        <div className="min-w-0">
          <Reveal>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-dark">
              Freight quote
            </span>
            <h2
              id="shipping-quote-title"
              className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              Request a freight quote
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
              A rate comes down to four things: the volume, the mode, the lane, and how
              much of the job the quote covers. This form asks for exactly those, and the
              shipping desk comes back with a rate and a routing.
            </p>
          </Reveal>

          <ol className="mt-8 grid max-w-md gap-4">
            {[
              "Send the form and your request gets a reference number straight away.",
              "The shipping desk looks over the lane, the cargo and the terms.",
              "We come back to you with a rate and a routing.",
            ].map((step, i) => (
              <li key={step} className="flex gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-white text-xs font-bold text-brand-dark">
                  {i + 1}
                </span>
                <p className="pt-1 text-[14px] leading-relaxed text-slate-600">{step}</p>
              </li>
            ))}
          </ol>

          <div className="sticky top-24 mt-10 hidden lg:block">
            <RouteTicket
              draft={draft}
              referenceNo={phase.kind === "sent" ? phase.referenceNo : undefined}
              notchClass="bg-slate-50"
            />
          </div>
        </div>

        <div
          ref={cardRef}
          className="min-w-0 scroll-mt-24 self-start rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.18)] sm:p-8 xl:p-10"
        >
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
            <form method="post" noValidate onSubmit={submit} className="grid gap-9" aria-busy={sending}>
              <Group icon={Building2} title="Your details" id="sq-group-you">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="sq-customerName" label="Company or your name" required error={errorFor("customerName")}>
                    <input
                      {...text("customerName")}
                      type="text"
                      autoComplete="organization"
                      maxLength={LIMITS.customerName}
                      placeholder="Company, or your full name"
                      aria-required
                      className={inputClass(!!errorFor("customerName"))}
                    />
                  </Field>

                  <Field id="sq-phone" label="Mobile number" required error={errorFor("phone")}>
                    <div className="flex items-stretch gap-2">
                      <div className="w-[6.5rem] shrink-0">
                        <FlagSelect
                          mode="dial"
                          placeholder="Code"
                          selected={phoneCountry}
                          onSelect={(c) => update({ phoneIso: c.iso, phoneCode: c.dial }, "phone")}
                          buttonClassName="!h-11 bg-slate-100"
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
                        className={`min-w-0 flex-1 ${inputClass(!!errorFor("phone"))}`}
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
                      className={inputClass(!!errorFor("email"))}
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
                      buttonClassName={`!h-11 ${errorFor("country") ? "!border-red-400" : ""}`}
                    />
                  </Field>
                </div>
              </Group>

              <Group icon={Package} title="The cargo" id="sq-group-cargo">
                <Field id="sq-commodity" label="Commodity" required error={errorFor("commodity")}>
                  <input
                    {...text("commodity")}
                    type="text"
                    autoComplete="off"
                    maxLength={LIMITS.commodity}
                    placeholder="What the goods are, e.g. LED panel lights"
                    aria-required
                    className={inputClass(!!errorFor("commodity"))}
                  />
                </Field>

                <Choice
                  id="sq-commodityType"
                  legend="Type of cargo"
                  error={errorFor("commodityType")}
                  hint={CARGO_HINTS[draft.commodityType]}
                >
                  <div className="flex flex-wrap gap-2">
                    {COMMODITY_TYPES.map((t) => {
                      const on = draft.commodityType === t.value;
                      return (
                        <label
                          key={t.value}
                          className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                            on
                              ? "border-brand bg-brand/10 text-brand-dark"
                              : "border-slate-200 bg-white text-slate-700 hover:border-brand/50"
                          }`}
                        >
                          <input
                            type="radio"
                            required
                            name="commodityType"
                            value={t.value}
                            checked={on}
                            onChange={() => update({ commodityType: t.value }, "commodityType")}
                            className="sr-only"
                          />
                          {/* A tick as well as the tint, so the choice does not
                              rest on colour alone. */}
                          {on && <Check size={14} strokeWidth={3} aria-hidden className="-ml-0.5" />}
                          {t.label}
                        </label>
                      );
                    })}
                  </div>
                </Choice>
              </Group>

              <Group icon={Route} title="Route and terms" id="sq-group-route">
                <Choice id="sq-mode" legend="Mode of shipment" error={errorFor("mode")}>
                  <div className="grid grid-cols-2 gap-3">
                    {MODE_CARDS.map(({ value, title, sub, icon: Icon }) => {
                      const on = draft.mode === value;
                      return (
                        <label
                          key={value}
                          // Stacked on a phone: side by side, two cards leave
                          // the words about ninety pixels.
                          className={`flex cursor-pointer select-none flex-col items-start gap-2.5 rounded-2xl border p-3.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 sm:flex-row sm:items-center sm:gap-3 sm:p-4 ${
                            on
                              ? "border-brand bg-brand/[0.06] shadow-[inset_0_0_0_1px_var(--color-brand)]"
                              : "border-slate-200 bg-white hover:border-brand/50"
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
                          <span
                            aria-hidden
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors sm:h-11 sm:w-11 ${
                              on ? "bg-brand-dark text-white" : "bg-brand/10 text-brand-dark"
                            }`}
                          >
                            <Icon size={20} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[15px] font-bold text-slate-900">{title}</span>
                            <span className="block text-xs text-slate-500">{sub}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </Choice>

                <Choice id="sq-method" legend="Method of shipment" error={errorFor("method")}>
                  {methodOptions.length > 0 ? (
                    <div className={`grid gap-3 ${methodOptions.length > 1 ? "grid-cols-2" : ""}`}>
                      {methodOptions.map((m) => {
                        const on = draft.method === m.value;
                        return (
                          <label
                            key={m.value}
                            className={`flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                              on
                                ? "border-brand bg-brand/[0.06]"
                                : "border-slate-200 bg-white hover:border-brand/50"
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
                              <span className="block text-sm font-bold text-slate-900">{m.label}</span>
                              <span className="block text-xs text-slate-500">{m.name}</span>
                            </span>
                            <span
                              aria-hidden
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                on ? "border-brand-dark bg-brand-dark text-white" : "border-slate-300 bg-white"
                              }`}
                            >
                              {on && <Check size={12} strokeWidth={3} />}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                      Choose sea or air above, and the ways to ship by it appear here.
                    </p>
                  )}
                </Choice>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="sq-portOfLoading" label="Port of loading (POL)" required error={errorFor("portOfLoading")}>
                    <input
                      {...text("portOfLoading")}
                      type="text"
                      autoComplete="off"
                      maxLength={LIMITS.port}
                      placeholder={air ? "e.g. Guangzhou (CAN)" : "e.g. Shanghai"}
                      aria-required
                      className={inputClass(!!errorFor("portOfLoading"))}
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
                      className={inputClass(!!errorFor("portOfDischarge"))}
                    />
                  </Field>
                </div>

                <Choice
                  id="sq-terms"
                  legend="Terms (Incoterm)"
                  error={errorFor("terms")}
                  hint={
                    draft.terms
                      ? `${termsLabel(draft.terms)}: ${termsName(draft.terms)}`
                      : "The term on your supplier's quote. Not sure? Choose Other and say so in the notes."
                  }
                >
                  <div className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
                    {TERMS.map((t) => {
                      const on = draft.terms === t.value;
                      return (
                        <label
                          key={t.value}
                          title={t.name}
                          className={`flex h-10 cursor-pointer select-none items-center justify-center rounded-lg text-sm font-semibold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                            on
                              ? "bg-white text-brand-dark shadow-sm ring-1 ring-slate-200"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <input
                            type="radio"
                            required
                            name="terms"
                            value={t.value}
                            checked={on}
                            onChange={() => update({ terms: t.value }, "terms")}
                            className="sr-only"
                          />
                          {t.label}
                          {t.value !== "OTHER" && <span className="sr-only">, {t.name}</span>}
                        </label>
                      );
                    })}
                  </div>
                </Choice>
              </Group>

              <Group icon={Boxes} title="Size of the load" id="sq-group-load">
                <div className="grid gap-5 sm:grid-cols-3">
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
                        className={inputClass(!!errorFor("cbm"), "h-11 pl-4 pr-11")}
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
                        className={inputClass(!!errorFor("weightKg"), "h-11 pl-4 pr-11")}
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
                      className={inputClass(!!errorFor("cartonBoxes"))}
                    />
                  </Field>
                </div>

                <Field id="sq-notes" label="Anything else we should know" optional error={errorFor("notes")}>
                  <textarea
                    {...text("notes")}
                    rows={4}
                    maxLength={LIMITS.notes}
                    placeholder="Ready date, pickup address, oversized pieces, a temperature range…"
                    className={inputClass(false, "min-h-[112px] resize-y px-4 py-3")}
                  />
                </Field>
              </Group>

              <div className="grid gap-4 border-t border-slate-100 pt-8">
                {/* Below lg the intro's ticket is out of sight, so the summary
                    sits here instead, where it is read just before sending. */}
                <div className="lg:hidden">
                  <RouteTicket draft={draft} notchClass="bg-white" />
                </div>

                {failure && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {failure}
                  </p>
                )}

                {/* brand-dark rather than the brand gradient /contact/ uses: white
                    on brand is 2.81:1, see the note at the top of globals.css. */}
                <button
                  type="submit"
                  disabled={sending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-dark text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(23,101,121,0.6)] transition-colors hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sending ? (
                    <>
                      <Loader2 size={17} className="animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send quote request
                      <ArrowRight size={17} aria-hidden />
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-slate-500">
                  Fields marked <span className="text-red-500">*</span> are required.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/** `shape` carries height and padding, so no caller has to override them. */
function inputClass(bad: boolean, shape = "h-11 px-4") {
  return `${shape} w-full rounded-xl border bg-slate-50/70 text-sm text-slate-950 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] transition-all placeholder:text-slate-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 ${
    bad
      ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-400/30"
      : "border-slate-200 focus-visible:border-brand focus-visible:ring-brand/30 focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]"
  }`;
}

function Group({ icon: Icon, title, id, children }: { icon: LucideIcon; title: string; id: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="grid gap-5">
      <h3 id={id} className="flex items-center gap-2.5 text-[15px] font-bold text-slate-900">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand-dark">
          <Icon size={16} />
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Mark({ required, optional }: { required?: boolean; optional?: boolean }) {
  if (required) return <span aria-hidden className="text-red-500"> *</span>;
  if (optional) return <span className="font-normal text-slate-500"> (optional)</span>;
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
      <label htmlFor={id} className="text-sm font-semibold tracking-wide text-slate-700">
        {label}
        <Mark required={required} optional={optional} />
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-slate-500">{hint}</p>
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
    <fieldset id={id} aria-describedby={error ? `${id}-error` : undefined} className="grid min-w-0 gap-2.5">
      <legend className="mb-2 text-sm font-semibold tracking-wide text-slate-700">
        {legend}
        <Mark required />
      </legend>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-slate-500">{hint}</p>
      ) : null}
    </fieldset>
  );
}

function Suffixed({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
        {unit}
      </span>
    </div>
  );
}

/**
 * The request as it stands, drawn like a booking: POL to POD, and underneath
 * it the four figures a rate is built from. It fills in as the form does, and
 * gets its SHP number once the request is sent.
 *
 * Hidden from screen readers. It repeats what the form fields already say.
 */
function RouteTicket({
  draft, referenceNo, notchClass,
}: {
  draft: Draft;
  referenceNo?: string;
  /** The colour behind the ticket, which the two notches are cut to. */
  notchClass: string;
}) {
  const ModeIcon = draft.mode === "AIR" ? Plane : draft.mode === "SEA" ? Ship : Route;
  const t = (s: string) => s.trim();
  const load = [
    t(draft.cbm) && `${t(draft.cbm)} m³`,
    t(draft.weightKg) && `${t(draft.weightKg)} kg`,
    t(draft.cartonBoxes) && `${t(draft.cartonBoxes)} ctns`,
  ].filter(Boolean).join(" · ");
  const how = [draft.mode && modeLabel(draft.mode), draft.method && methodLabel(draft.method)]
    .filter(Boolean).join(" · ");
  const cargo = [t(draft.commodity), draft.commodityType && commodityTypeLabel(draft.commodityType)]
    .filter(Boolean).join(" · ");

  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-dark to-brand-deep p-5 text-white shadow-[0_22px_44px_-22px_rgba(16,80,95,0.7)] sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
        <span>Freight quote</span>
        <span className={`tabular-nums ${referenceNo ? "text-white" : ""}`}>
          {referenceNo ?? "Ref. on sending"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
        <TicketPort code="POL" value={t(draft.portOfLoading)} />
        <div className="flex items-center gap-1 pt-5 text-white/80 sm:gap-1.5">
          <span className="w-3 border-t border-dashed border-white/40 sm:w-7" />
          <ModeIcon size={18} />
          <span className="w-3 border-t border-dashed border-white/40 sm:w-7" />
        </div>
        <TicketPort code="POD" value={t(draft.portOfDischarge)} right />
      </div>

      <div className="relative my-5">
        <div className="border-t border-dashed border-white/25" />
        <span className={`absolute -left-8 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full sm:-left-9 ${notchClass}`} />
        <span className={`absolute -right-8 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full sm:-right-9 ${notchClass}`} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <TicketCell term="Cargo" value={cargo} />
        <TicketCell term="Method" value={how} />
        <TicketCell term="Terms" value={draft.terms ? termsLabel(draft.terms) : ""} />
        <TicketCell term="Load" value={load} />
      </dl>
    </div>
  );
}

function TicketPort({ code, value, right }: { code: string; value: string; right?: boolean }) {
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{code}</p>
      {/* Two lines rather than an ellipsis: "Guangzhou (CAN)" cut to
          "Guangz…" on a phone says nothing. */}
      <p className={`mt-1 line-clamp-2 break-words text-[15px] font-bold leading-snug sm:text-lg ${value ? "text-white" : "text-white/40"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function TicketCell({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">{term}</dt>
      <dd className={`mt-0.5 line-clamp-2 break-words text-sm font-semibold ${value ? "text-white" : "text-white/40"}`}>
        {value || "—"}
      </dd>
    </div>
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
  const rows: [string, string][] = [
    ["Route", routeSummary(sent)],
    ["Load", loadSummary(sent)],
    ["Cargo", `${sent.commodity} · ${commodityTypeLabel(sent.commodityType)}`],
    ["Terms", `${termsLabel(sent.terms)}${sent.terms === "OTHER" ? "" : ` · ${termsName(sent.terms)}`}`],
  ];

  return (
    <div className="py-2 text-center sm:py-6">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
        <Check size={26} strokeWidth={2.5} aria-hidden />
      </span>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-2xl font-bold tracking-tight text-slate-900 outline-none"
      >
        Request received
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-slate-600">
        The shipping desk has it. Keep this reference and quote it whenever you speak to us
        about this shipment.
      </p>

      <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-3 rounded-2xl border border-dashed border-brand/50 bg-brand/[0.05] py-3 pl-5 pr-3 text-left">
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Reference</span>
          <span ref={refText} className="block whitespace-nowrap text-[22px] font-bold tabular-nums tracking-wide text-brand-dark sm:text-2xl">
            {referenceNo}
          </span>
        </span>
        {/* Icon only on a phone: the reference is the one thing on this card
            that must never be cut short, and it needs the width. */}
        <button
          type="button"
          onClick={() => onCopy(referenceNo, refText.current)}
          aria-label={copied ? "Reference copied" : "Copy reference"}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-0 text-sm font-semibold text-slate-700 transition-colors hover:border-brand hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:w-auto sm:px-3.5"
        >
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          <span aria-hidden className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
        <span aria-live="polite" className="sr-only">{copied ? "Reference copied" : ""}</span>
      </div>

      <dl className="mx-auto mt-6 grid max-w-md gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-left text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
            <dt className="text-slate-500">{k}</dt>
            <dd className="break-words font-semibold text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-slate-600">
        We&apos;ll come back to you on <strong className="font-semibold text-slate-800">{sent.phone}</strong>
        {sent.email && (
          <>
            {" "}or <strong className="font-semibold text-slate-800 break-words">{sent.email}</strong>
          </>
        )}{" "}
        with a rate and a routing.
      </p>

      <button
        type="button"
        onClick={onAnother}
        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-dark transition-colors hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        Send another request <ArrowRight size={15} aria-hidden />
      </button>
      <p className="mt-2 text-xs text-slate-500">Your contact details stay filled in.</p>
    </div>
  );
}

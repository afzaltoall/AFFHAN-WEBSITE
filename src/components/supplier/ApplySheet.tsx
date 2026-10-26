"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Pencil, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { lockBodyScroll } from "@/lib/scrollLock";
import { DETAILS_MAX, MOQ_UNITS, moqPhrase, readOffer, type SupplierContact } from "@/lib/supplier-offer";

/** The account's contact details as the form starts from them: "" for any not given yet. */
export type ContactDraft = SupplierContact;
import { authFieldError, authInput, authLabel } from "@/components/ui/authFieldStyles";
import { MobileNumberField } from "@/components/supplier/MobileNumberField";
import { PhotoPicker } from "@/components/supplier/PhotoPicker";

export interface CatalogueProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
}

/** What the sheet applies for: a catalogue product, or one the supplier names themselves. */
export type ApplyTarget = { kind: "catalogue"; product: CatalogueProduct } | { kind: "own"; name?: string };

export interface SentOffer {
  id: string;
  productId: number | null;
  productName: string;
  moq: number;
  moqUnit: string;
}

/**
 * "I have this": the application, in one sheet over the catalogue (the owner, 2026-10-21). The MOQ and the
 * product's details, photos if the supplier has them, and the contact details. No price and no lead time: the
 * owner's list.
 *
 * The contact details are where the company, the WeChat ID and the address are first asked: an account is made
 * with a name, an email, a mobile and a password, like a customer's. Until they are given the section is open
 * for typing; once given, it shows them with a Change button. What an application is sent with is remembered
 * on the account (the offers route), so the next one opens filled in.
 *
 * A panel on the right from a tablet up, a sheet from the bottom on a phone. It keeps the catalogue where it
 * was underneath, so a supplier going down a page of products applies for one after another without losing
 * their place.
 */
export function ApplySheet({
  target,
  contact,
  onClose,
  onSent,
  onPickCatalogue,
}: {
  target: ApplyTarget;
  contact: ContactDraft;
  onClose: () => void;
  onSent: (offer: SentOffer) => void;
  /** A product of the catalogue's chosen from "Similar products in our catalogue": its own application instead. */
  onPickCatalogue?: (product: CatalogueProduct) => void;
}) {
  const [productName, setProductName] = useState(target.kind === "own" ? target.name ?? "" : "");
  // Adding a product not in the catalogue, the catalogue's own that are like what is typed, each with "I have this":
  // a supplier never adds one we already list as their own (the owner, 2026-10-26: "user confuse aga koodadhu").
  const [similar, setSimilar] = useState<CatalogueProduct[]>([]);
  useEffect(() => {
    if (target.kind !== "own") return;
    const words = productName.trim();
    if (words.length < 3) {
      setSimilar([]);
      return;
    }
    const stop = new AbortController();
    const wait = window.setTimeout(() => {
      fetch(`/api/products/?${new URLSearchParams({ q: words, page: "1", limit: "3" })}`, { signal: stop.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const rows = (data?.data ?? []) as Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryRef: { name: string | null } | null }>;
          setSimilar(rows.slice(0, 3).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.categoryRef?.name ?? p.category ?? null })));
        })
        .catch(() => {});
    }, 450);
    return () => {
      window.clearTimeout(wait);
      stop.abort();
    };
  }, [productName, target.kind]);
  const [moq, setMoq] = useState("");
  const [unit, setUnit] = useState<string>("pieces");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [card, setCard] = useState<ContactDraft>(contact);
  // Open for typing while anything is missing: the first application after sign-up.
  const firstTime = !contact.companyName || !contact.wechatId || !contact.companyAddress;
  const [editingCard, setEditingCard] = useState(firstTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [sent, setSent] = useState<SentOffer | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const still = useReducedMotion();

  // The page stays put underneath; Escape closes; focus comes into the sheet and goes back where it was.
  useEffect(() => {
    opener.current = document.activeElement;
    const release = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The first field where there is a mouse; on a touch screen the sheet itself, so no keyboard jumps up over it.
    const first = panel.current?.querySelector<HTMLElement>("form input, form textarea");
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
    else panel.current?.focus();
    return () => {
      release();
      window.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return setError({ text: "Wait for the photos to finish uploading.", field: "photos" });
    const body = {
      productId: target.kind === "catalogue" ? target.product.id : null,
      productName: target.kind === "own" ? productName : null,
      moq,
      moqUnit: unit,
      details,
      photos,
      contact: card,
    };
    // The server's own rules, so the answer comes before a round trip. Photos are the server's to judge.
    const check = readOffer(body, () => true);
    if (!check.ok) {
      if (["name", "companyName", "mobile", "wechatId", "companyAddress"].includes(check.field)) setEditingCard(true);
      return setError({ text: check.error, field: check.field });
    }
    setBusy(true);
    setError(null);
    setDuplicateId(null);
    try {
      const res = await fetch("/api/supplier/offers/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) return setError({ text: "Your session has ended. Sign in again to send this." });
        if (data?.reason === "duplicate" && data?.offerId) setDuplicateId(data.offerId);
        if (["name", "companyName", "mobile", "wechatId", "companyAddress"].includes(data?.field)) setEditingCard(true);
        return setError({ text: data?.error ?? "Your application did not send. Try again.", field: data?.field });
      }
      const offer: SentOffer = data.offer;
      setSent(offer);
      onSent(offer);
    } catch {
      setError({ text: "Network error. Your application did not send. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (field: string) => (error?.field === field ? <span className={authFieldError}>{error.text}</span> : null);
  const ring = (field: string) => (error?.field === field ? " !border-red-300 !ring-4 !ring-red-100" : "");
  const product = target.kind === "catalogue" ? target.product : null;
  const image = product ? getCdnUrl(product.imageUrl, 200) : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#071319]/55 backdrop-blur-[2px] md:items-stretch md:justify-end" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl outline-none md:max-h-none md:max-w-[560px] md:rounded-none md:rounded-l-[22px]"
      >
        <div className="flex items-center gap-3 border-b border-[#e6ecee] px-5 py-3.5">
          <h2 id="apply-title" className="flex-1 text-[16px] font-bold tracking-tight">
            {sent ? "Application sent" : target.kind === "own" ? "Add a product not in our catalogue" : "Apply to supply this product"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5b6f76] hover:bg-[#eef3f4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-10 text-center">
            {/* The tick lands with a small spring, then the words follow it in. */}
            <motion.span
              initial={still ? false : { scale: 0.3, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 17 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60"
            >
              <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            </motion.span>
            <motion.div
              initial={still ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              className="flex flex-col items-center"
            >
              <p className="mt-5 text-[15px] font-semibold">{sent.productName}</p>
              <p className="mt-1 text-[13.5px] text-[#5b6f76]">MOQ {moqPhrase(sent.moq, sent.moqUnit)}</p>
              <p className="mt-5 max-w-sm text-[13.5px] leading-relaxed text-[#33494f]">
                Our sourcing team reviews every application. If it is a match, we will contact you on WeChat or by phone.
                You can follow it in My applications.
              </p>
            </motion.div>
            <div className="mt-7 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-brand-dark px-4 py-2.5 text-[13.5px] font-bold text-white hover:bg-brand-deep">
                Find another product
              </button>
              <Link href="/supplier/applications/" className="flex-1 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-brand-dark ring-1 ring-[#cfdcdf] hover:bg-[#f2f7f8]">
                My applications
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {product ? (
                <div className="flex gap-3.5 rounded-2xl bg-[#f4f7f8] p-3 ring-1 ring-[#e3eaec]">
                  <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl bg-white">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {product.category && <p className="truncate text-[11.5px] font-medium text-[#5b6f76]">{product.category}</p>}
                    <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{product.name}</p>
                    <a
                      href={`/products/${product.id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-dark hover:underline"
                    >
                      See it on affhan.com <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  {/* No note over the form: its "Not in our catalogue? …" read as written by AI (the owner, 2026-10-26),
                      and the sheet's own title says what this is. */}
                  <label htmlFor="apply-name" className={authLabel}>
                    Product name
                  </label>
                  <input
                    id="apply-name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Stainless steel insulated water bottle"
                    className={authInput + ring("productName")}
                  />
                  {fieldError("productName")}
                  {similar.length > 0 && onPickCatalogue && (
                    <div className="mt-2 rounded-xl bg-[#f6f8f9] p-2.5 ring-1 ring-[#e6ecee]">
                      <p className="px-1 pb-2 text-[12.5px] font-semibold text-[#444]">Similar products in our catalogue</p>
                      <ul className="space-y-1.5">
                        {similar.map((p) => {
                          const thumb = getCdnUrl(p.imageUrl, 100);
                          return (
                            <li key={p.id} className="flex items-center gap-2.5 rounded-lg bg-white p-1.5 ring-1 ring-[#eef2f3]">
                              <span className="size-10 shrink-0 overflow-hidden rounded-md bg-[#f2f2f2]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {thumb && <img src={thumb} alt="" width={40} height={40} className="h-full w-full object-cover" />}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] text-[#222]">{p.name}</span>
                              <button
                                type="button"
                                onClick={() => onPickCatalogue(p)}
                                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-brand-dark ring-1 ring-[#bcd3d9] transition-colors hover:bg-brand-dark hover:text-white"
                              >
                                I have this
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="apply-moq" className={authLabel}>
                  Minimum order quantity (MOQ)
                </label>
                <div className="flex gap-2">
                  <input
                    id="apply-moq"
                    inputMode="numeric"
                    value={moq}
                    onChange={(e) => setMoq(e.target.value.replace(/[^\d,]/g, ""))}
                    placeholder="500"
                    className={`${authInput} tabular-nums${ring("moq")}`}
                  />
                  <select
                    aria-label="Unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className={`${authInput} !w-[8.5rem] shrink-0 cursor-pointer`}
                  >
                    {MOQ_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldError("moq")}
              </div>

              <div>
                <label htmlFor="apply-details" className={authLabel}>
                  Product details
                </label>
                <textarea
                  id="apply-details"
                  rows={5}
                  maxLength={DETAILS_MAX}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Material, sizes, colours, packing, certificates, how many you can make in a month…"
                  className={`${authInput} resize-y leading-relaxed${ring("details")}`}
                />
                <div className="mt-1 flex justify-between gap-3">
                  {fieldError("details") ?? <span />}
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[#7b8d93]">
                    {details.length.toLocaleString("en-US")} / {DETAILS_MAX.toLocaleString("en-US")}
                  </span>
                </div>
              </div>

              <div>
                {/* Not called optional (the owner, 2026-10-26: "dont mention photos optional"); none are still accepted. */}
                <p className={authLabel}>
                  Photos <span className="font-normal text-[#7b8d93]">(up to 5)</span>
                </p>
                <PhotoPicker onChange={setPhotos} onBusyChange={setUploading} />
                {fieldError("photos")}
              </div>

              <div className="rounded-2xl ring-1 ring-[#e3eaec]">
                <div className="flex items-center gap-2 border-b border-[#e9eff1] px-4 py-2.5">
                  <p className="flex-1 text-[12.5px] font-bold">Your contact details</p>
                  {!editingCard && (
                    <button type="button" onClick={() => setEditingCard(true)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark hover:underline">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Change
                    </button>
                  )}
                </div>
                {editingCard ? (
                  <div className="space-y-3 px-4 py-3.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="apply-cname" className={authLabel}>
                          Your name
                        </label>
                        <input id="apply-cname" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} className={authInput + ring("name")} />
                        {fieldError("name")}
                      </div>
                      <div>
                        <label htmlFor="apply-company" className={authLabel}>
                          Company name
                        </label>
                        <input id="apply-company" value={card.companyName} onChange={(e) => setCard({ ...card, companyName: e.target.value })} className={authInput + ring("companyName")} />
                        {fieldError("companyName")}
                      </div>
                    </div>
                    <div>
                      <MobileNumberField id="apply-mobile" initial={contact.mobile} onChange={(mobile) => setCard((c) => ({ ...c, mobile }))} />
                      {fieldError("mobile")}
                    </div>
                    <div>
                      <label htmlFor="apply-wechat" className={authLabel}>
                        WeChat ID
                      </label>
                      <input
                        id="apply-wechat"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={card.wechatId}
                        onChange={(e) => setCard({ ...card, wechatId: e.target.value })}
                        className={authInput + ring("wechatId")}
                      />
                      {fieldError("wechatId")}
                    </div>
                    <div>
                      <label htmlFor="apply-address" className={authLabel}>
                        Company address
                      </label>
                      <textarea
                        id="apply-address"
                        rows={2}
                        value={card.companyAddress}
                        onChange={(e) => setCard({ ...card, companyAddress: e.target.value })}
                        className={`${authInput} resize-none${ring("companyAddress")}`}
                      />
                      {fieldError("companyAddress")}
                    </div>
                    <p className="text-[11.5px] text-[#7b8d93]">
                      {firstTime
                        ? "Asked once: we remember them for your next application."
                        : "We remember them for your next application."}{" "}
                      You can also change them in{" "}
                      <Link href="/supplier/profile/" className="font-semibold text-brand-dark hover:underline">
                        Profile
                      </Link>
                      .
                    </p>
                  </div>
                ) : (
                  <dl className="grid gap-x-4 gap-y-2 px-4 py-3 text-[13px] sm:grid-cols-2">
                    {[
                      ["Name", card.name],
                      ["Company", card.companyName],
                      ["Mobile", card.mobile],
                      ["WeChat ID", card.wechatId],
                    ].map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[11.5px] text-[#7b8d93]">{k}</dt>
                        <dd className="truncate font-medium">{v}</dd>
                      </div>
                    ))}
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-[11.5px] text-[#7b8d93]">Address</dt>
                      <dd className="whitespace-pre-line font-medium">{card.companyAddress}</dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>

            <div className="border-t border-[#e6ecee] bg-white px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <div aria-live="polite">
                {error && !["productName", "moq", "details", "photos", "name", "companyName", "mobile", "wechatId", "companyAddress"].includes(error.field ?? "") && (
                  <p role="alert" className="mb-2.5 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700 ring-1 ring-red-100">
                    <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {error.text}
                      {duplicateId && (
                        <>
                          {" "}
                          <Link href={`/supplier/applications/#${duplicateId}`} className="font-bold underline">
                            Open it
                          </Link>
                        </>
                      )}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-[#33494f] ring-1 ring-[#d5e0e3] hover:bg-[#f4f7f8]">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-dark px-4 py-2.5 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
                >
                  {busy || uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {busy ? "Sending…" : uploading ? "Uploading photos…" : "Send application"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

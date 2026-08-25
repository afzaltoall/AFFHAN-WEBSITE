"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, MapPin, Package, User, Building2, Hash, Sun, Moon,
  ExternalLink, AlertTriangle, ChevronRight,
} from "lucide-react";
import type { SupplierRecord } from "@/lib/suppliers";
import { supplierTitle } from "@/lib/suppliers";
import { SupplierContacts } from "@/components/admin/SupplierContacts";

/**
 * One supplier, in full.
 *
 * The directory row is a summary you scan; this is the page you have open while
 * you are actually talking to them, so it holds everything the sheet knows and
 * says plainly where each part came from — including the original contact cell,
 * printed verbatim under our reading of it.
 */

interface Props {
  supplier: SupplierRecord;
  /** Others recorded against the same product, for "who else makes this". */
  related: { id: number; title: string; person: string; productsRaw: string }[];
  /** The product term `related` was matched on, named so the link is honest. */
  relatedTerm: string | null;
}

export function SupplierDetail({ supplier: s, related, relatedTerm }: Props) {
  const [dark, setDark] = useState(false);

  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", card: "bg-[#151517] ring-white/[0.08]",
        soft: "text-[#8a8a8e]", border: "border-white/[0.08]", divide: "divide-white/[0.06]",
        hover: "hover:bg-white/[0.03]", chip: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
        bar: "bg-[#151517]/90 border-white/10",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", card: "bg-white ring-black/[0.04]",
        soft: "text-[#6e6e73]", border: "border-black/[0.06]", divide: "divide-black/[0.06]",
        hover: "hover:bg-black/[0.015]", chip: "bg-black/[0.04] text-[#1d1d1f] ring-black/[0.06]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
        bar: "bg-white/80 border-black/[0.06]",
      };

  const title = supplierTitle(s);
  const mapsHref = s.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`
    : null;

  const facts: { Icon: typeof User; label: string; value: string }[] = [
    ...(s.person ? [{ Icon: User, label: "Contact person", value: s.person }] : []),
    ...(s.company ? [{ Icon: Building2, label: "Company", value: s.company }] : []),
    { Icon: Hash, label: "Sheet reference", value: s.serial !== null ? `S.No ${s.serial}` : `Row ${s.sourceRow}` },
  ];

  return (
    <div className={`min-h-screen ${t.page}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' }}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${t.bar}`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin/suppliers/"
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="hidden sm:inline">All suppliers</span>
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{title}</p>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-pressed={dark}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className={`rounded-2xl p-5 ring-1 sm:p-6 ${t.card}`}>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
          {s.company && s.person && <p className={`mt-1 text-[14px] ${t.soft}`}>{s.person}</p>}

          {(s.flags.incompleteNumber || s.flags.noContact) && (
            <p className={`mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[12.5px] font-medium ${dark ? "text-amber-500" : "text-amber-700"}`}>
              <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
              {s.flags.noContact
                ? "No contact details were recorded for this supplier."
                : "One of these numbers has too few digits to dial — worth checking against the original chat."}
            </p>
          )}

          <dl className={`mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3 ${t.border}`}>
            {facts.map(({ Icon, label, value }) => (
              <div key={label}>
                <dt className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
                  <Icon size={12} aria-hidden="true" /> {label}
                </dt>
                <dd className="mt-1 text-[13.5px] font-medium leading-snug">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Contact */}
          <section className={`rounded-2xl p-5 ring-1 ${t.card}`} aria-labelledby="supplier-contact-heading">
            <h2 id="supplier-contact-heading" className={`mb-3.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
              Contact
            </h2>
            <SupplierContacts
              phones={s.phones}
              handles={s.handles}
              webs={s.webs}
              raw={s.contactRaw}
              dark={dark}
              variant="full"
            />
          </section>

          {/* Products */}
          <section className={`rounded-2xl p-5 ring-1 ${t.card}`} aria-labelledby="supplier-products-heading">
            <h2 id="supplier-products-heading" className={`mb-3.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
              <Package size={12} aria-hidden="true" /> Products
            </h2>
            {s.productsRaw ? (
              <>
                <p className="text-[14px] leading-relaxed">{s.productsRaw}</p>
                {s.products.length > 1 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {s.products.map((p) => (
                      <li key={p}>
                        <Link
                          href={`/admin/suppliers/?product=${encodeURIComponent(p.toLowerCase())}`}
                          className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.chip}`}
                        >
                          {p}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className={`text-[13px] ${t.soft}`}>No product recorded.</p>
            )}
          </section>

          {/* Address */}
          <section className={`rounded-2xl p-5 ring-1 lg:col-span-2 ${t.card}`} aria-labelledby="supplier-address-heading">
            <h2 id="supplier-address-heading" className={`mb-3.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
              <MapPin size={12} aria-hidden="true" /> Address
            </h2>
            {s.address ? (
              <>
                <p className="text-[14px] leading-relaxed">{s.address}</p>
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                  >
                    Open in Google Maps <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </>
            ) : (
              // 510 of the 845 rows have no address. Saying so beats an empty
              // panel that looks like something failed to load.
              <p className={`text-[13px] ${t.soft}`}>
                No address recorded. Most of this book was built from WeChat contacts, where an address was
                only ever exchanged when it was needed.
              </p>
            )}
          </section>
        </div>

        {related.length > 0 && relatedTerm && (
          <section className="mt-6" aria-labelledby="supplier-related-heading">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
              <h2 id="supplier-related-heading" className="text-[15px] font-semibold tracking-tight">
                Others recorded for “{relatedTerm}”
              </h2>
              <Link
                href={`/admin/suppliers/?q=${encodeURIComponent(relatedTerm)}`}
                className="inline-flex items-center gap-1 text-[12px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
              >
                Search all <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <ul className={`overflow-hidden rounded-2xl ring-1 ${t.card}`}>
              {related.map((r, i) => (
                <li key={r.id} className={i ? `border-t ${t.border}` : ""}>
                  <Link
                    href={`/admin/suppliers/${r.id}/`}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.hover}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{r.title}</span>
                      <span className={`block truncate text-[11.5px] ${t.soft}`}>
                        {[r.person, r.productsRaw].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" className={t.soft} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

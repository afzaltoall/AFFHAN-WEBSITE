"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Factory, RotateCcw, Search } from "lucide-react";
import { SupplierContacts } from "@/components/admin/SupplierContacts";
import type { Theme } from "@/components/admin/console-theme";
import type { ContactEntry, PhoneView } from "@/lib/suppliers";

/**
 * "Matching suppliers" for one inquiry: who could source the inquired product (src/lib/server/supplier-match). In the
 * console's inquiry panel (audience "admin", GET /api/admin/inquiries/[id]/supplier-matches) and in the staff
 * workspace's lead, for the reader's own leads only (audience "employee",
 * GET /api/employee/inquiries/[id]/supplier-matches). Fetched when the inquiry is opened, never with any list; this
 * component holds no supplier data of its own.
 *
 * New suppliers first, when any match (the owner, 2026-10-23): those whose application on the supplier portal is for
 * this product, then for a similar one, each with where the application stands, its MOQ and its contact. Then the
 * old suppliers, from the WeChat book: three first, then up to ten, each saying why it matched (the words of its own
 * entry found in the title, or the synonym that stood in for them; the category when that agreed; "Broad match" when
 * its entry is a material or a use rather than a product). Staff get the same rows, contacts included; the links into
 * the two supplier pages are the console's alone, since those are admin pages.
 */

interface Suggestion {
  id: number;
  name: string;
  person: string;
  products: string;
  score: number;
  vague: boolean;
  term: string;
  matchedWords: string[];
  synonym: boolean;
  matchedCategory: string | null;
  phones: PhoneView[];
  handles: ContactEntry[];
  webs: ContactEntry[];
  contactRaw: string;
}

/** A new supplier: their application on the supplier portal (src/lib/server/supplier-match/portal.ts). */
interface PortalSuggestion {
  offerId: string;
  supplierId: string;
  name: string;
  person: string;
  match: "product" | "similar";
  productName: string;
  shared: string[];
  status: "NEW" | "REVIEWING" | "ACCEPTED";
  moq: string;
  appliedAt: string;
  phones: PhoneView[];
  handles: ContactEntry[];
}

interface Payload {
  suggestions: Suggestion[];
  total: number;
  /** Missing from an answer made before new suppliers were matched. */
  portal?: PortalSuggestion[];
  searchWord: string;
}

/** The board's words for where an application stands (lib/supplier-offer.ts, TEAM_STATUS_LABEL). */
const STATUS_LABEL: Record<PortalSuggestion["status"], string> = { NEW: "New", REVIEWING: "Reviewing", ACCEPTED: "Accepted" };

const appliedOn = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

type State = { status: "loading" } | { status: "error"; code: number } | { status: "done"; data: Payload };

const FIRST = 3;

/** The console's theme tokens this panel uses; the staff workspace's `wt` carries the same ones. */
type PanelTheme = Pick<Theme, "soft" | "mid" | "strong" | "pill" | "thumb">;

export function InquirySupplierMatches({
  inquiryId,
  t,
  dark,
  audience = "admin",
}: {
  inquiryId: string;
  t: PanelTheme;
  dark: boolean;
  audience?: "admin" | "employee";
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [all, setAll] = useState(false);
  const admin = audience === "admin";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/${admin ? "admin" : "employee"}/inquiries/${encodeURIComponent(inquiryId)}/supplier-matches/`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) return setState({ status: "error", code: res.status });
        setState({ status: "done", data: (await res.json()) as Payload });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState({ status: "error", code: 0 });
      }
    },
    [inquiryId, admin],
  );

  // Mounted fresh for each inquiry (the panel keys it by id), so this starts in "loading" and only fetches.
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const retry = () => {
    setState({ status: "loading" });
    void load();
  };

  const chip = dark ? "bg-white/[0.08] text-[#e5e5e7]" : "bg-black/[0.05] text-[#1d1d1f]";
  // The console's teal in each theme (its quantity chip's): brand-dark is too dark to read on the dark panel.
  const accent = dark ? "text-[#7fd8ea]" : "text-brand-dark";
  const accentHover = dark ? "hover:text-[#7fd8ea]" : "hover:text-brand-dark";
  const data = state.status === "done" ? state.data : null;
  const shown = data ? (all ? data.suggestions : data.suggestions.slice(0, FIRST)) : [];
  const portal = data?.portal ?? [];
  // Where an application stands, in the board's colours (NewSuppliersBoard).
  const statusTone: Record<PortalSuggestion["status"], string> = dark
    ? { NEW: "bg-[#0a84ff]/15 text-[#64a8ff]", REVIEWING: "bg-amber-400/15 text-amber-300", ACCEPTED: "bg-emerald-400/15 text-emerald-300" }
    : { NEW: "bg-[#0071e3]/10 text-[#0058b0]", REVIEWING: "bg-amber-500/15 text-amber-800", ACCEPTED: "bg-emerald-500/10 text-emerald-700" };
  const brandChip = dark ? "bg-brand/25 text-[#7fd8ea]" : "bg-brand/10 text-brand-dark";
  // The two kinds are named only when both are there; old suppliers alone read as they always have.
  const grouped = portal.length > 0 && data !== null && data.suggestions.length > 0;
  const groupLabel = `mb-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`;
  const found = data ? portal.length + data.total : 0;
  const listed = data ? portal.length + data.suggestions.length : 0;

  return (
    <section aria-labelledby={`supplier-matches-${inquiryId}`} className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p id={`supplier-matches-${inquiryId}`} className={`text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>
          Matching suppliers
        </p>
        {found > 0 && <span className={`text-[11px] tabular-nums ${t.soft}`}>{found > listed ? `${listed} of ${found}` : found} found</span>}
      </div>

      {state.status === "loading" && (
        <ul aria-busy="true" aria-label="Loading matching suppliers" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className={`animate-pulse rounded-xl p-3 ${t.thumb}`}>
              <div className={`h-3.5 w-2/5 rounded ${dark ? "bg-white/10" : "bg-black/[0.07]"}`} />
              <div className={`mt-2 h-3 w-3/5 rounded ${dark ? "bg-white/[0.07]" : "bg-black/[0.05]"}`} />
              <div className={`mt-2.5 h-6 w-1/3 rounded-full ${dark ? "bg-white/[0.07]" : "bg-black/[0.05]"}`} />
            </li>
          ))}
        </ul>
      )}

      {state.status === "error" && (
        <div role="alert" className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm ${t.thumb}`}>
          <span className={t.mid}>
            {state.code === 401 || state.code === 403
              ? "Sign in again to see matching suppliers."
              : state.code === 404
                ? admin
                  ? "This inquiry is no longer there."
                  : "This lead is no longer assigned to you."
                : "Matching suppliers could not be loaded."}
          </span>
          <button
            type="button"
            onClick={retry}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${t.pill}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {portal.length > 0 && (
        <div className={grouped ? "mb-3" : ""}>
          <p className={groupLabel}>
            New suppliers <span className="font-medium normal-case tracking-normal">· applied on the supplier portal</span>
          </p>
          <ul className="space-y-2">
            {portal.map((p) => (
              <li key={p.offerId} className={`rounded-xl p-3 ${t.thumb}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    {/* The supplier's page opens at this application, in a new tab, so the inquiry stays open here. */}
                    {admin ? (
                      <Link
                        href={`/admin/new-suppliers/${encodeURIComponent(p.supplierId)}/#application-${encodeURIComponent(p.offerId)}`}
                        target="_blank"
                        rel="noopener"
                        className={`inline-flex items-center gap-1.5 text-sm font-semibold ${accentHover} ${t.strong}`}
                      >
                        <Factory className={`h-3.5 w-3.5 shrink-0 ${t.soft}`} aria-hidden="true" />
                        <span className="break-words">{p.name}</span>
                        <ExternalLink className={`h-3 w-3 shrink-0 ${t.soft}`} aria-hidden="true" />
                      </Link>
                    ) : (
                      <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${t.strong}`}>
                        <Factory className={`h-3.5 w-3.5 shrink-0 ${t.soft}`} aria-hidden="true" />
                        <span className="break-words">{p.name}</span>
                      </p>
                    )}
                    {p.person && p.person !== p.name && <p className={`mt-0.5 text-xs ${t.mid}`}>{p.person}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${p.match === "product" ? brandChip : chip}`}
                  >
                    {p.match === "product" ? "Applied for this product" : "Similar product"}
                  </span>
                </div>
                {p.match === "similar" && <p className={`mt-1.5 text-xs leading-relaxed ${t.mid}`}>Applied for “{p.productName}”</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${chip}`}>MOQ {p.moq}</span>
                  {p.match === "similar" &&
                    p.shared.map((w) => (
                      <span key={w} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip}`}>
                        {w}
                      </span>
                    ))}
                  <span className={`text-[11px] ${t.soft}`}>applied {appliedOn(p.appliedAt)}</span>
                </div>
                <div className="mt-2.5">
                  <SupplierContacts phones={p.phones} handles={p.handles} webs={[]} raw="" dark={dark} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {grouped && <p className={groupLabel}>Old suppliers</p>}

      {/* The book opens in a new tab, as a supplier's page does, so the inquiry stays open here. */}
      {data && data.suggestions.length === 0 && portal.length === 0 && (
        <div className={`rounded-xl p-3 text-sm ${t.thumb}`}>
          <p className={`font-semibold ${t.strong}`}>No matching supplier</p>
          {admin && (
            <Link
              href={data.searchWord ? `/admin/suppliers/?q=${encodeURIComponent(data.searchWord)}` : "/admin/suppliers/"}
              target="_blank"
              rel="noopener"
              className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline ${accent}`}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {data.searchWord ? `Search the supplier book for “${data.searchWord}”` : "Open the supplier book"}
            </Link>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((s) => (
            <li key={s.id} className={`rounded-xl p-3 ${t.thumb}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  {admin ? (
                    <Link
                      href={`/admin/suppliers/${s.id}/`}
                      target="_blank"
                      rel="noopener"
                      className={`inline-flex items-center gap-1.5 text-sm font-semibold ${accentHover} ${t.strong}`}
                    >
                      <Factory className={`h-3.5 w-3.5 shrink-0 ${t.soft}`} aria-hidden="true" />
                      <span className="break-words">{s.name}</span>
                      <ExternalLink className={`h-3 w-3 shrink-0 ${t.soft}`} aria-hidden="true" />
                    </Link>
                  ) : (
                    <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${t.strong}`}>
                      <Factory className={`h-3.5 w-3.5 shrink-0 ${t.soft}`} aria-hidden="true" />
                      <span className="break-words">{s.name}</span>
                    </p>
                  )}
                  {s.person && s.person !== s.name && <p className={`mt-0.5 text-xs ${t.mid}`}>{s.person}</p>}
                </div>
                {s.vague && (
                  <span
                    title="This supplier's entry names a material or a use, not a product"
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${dark ? "bg-amber-500/15 text-amber-400" : "bg-amber-500/10 text-amber-700"}`}
                  >
                    Broad match
                  </span>
                )}
              </div>
              {s.products && <p className={`mt-1.5 text-xs leading-relaxed ${t.mid}`}>{s.products}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.matchedWords.map((w, i) => (
                  <span key={`${w}-${i}`} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip}`}>
                    {w}
                  </span>
                ))}
                {s.synonym && <span className={`text-[11px] ${t.soft}`}>synonym for “{s.term}”</span>}
                {s.matchedCategory && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${dark ? "bg-brand/25 text-[#7fd8ea]" : "bg-brand/10 text-brand-dark"}`}>
                    {s.matchedCategory.split(" > ").pop()}
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <SupplierContacts phones={s.phones} handles={s.handles} webs={s.webs} raw={s.contactRaw} dark={dark} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && !all && data.suggestions.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${t.pill}`}
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Show {data.suggestions.length - FIRST} more
        </button>
      )}
    </section>
  );
}

export default InquirySupplierMatches;

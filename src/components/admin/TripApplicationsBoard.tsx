"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, Mail, MessageCircle, Phone, RefreshCw, Search, Users, X } from "lucide-react";
import { EVERY_BUSINESS_STATUS, businessStatusBrief, isKnownBusinessStatus } from "@/lib/trip-application";
import { countryFlagUrl } from "@/lib/countryFlag";
import { TripLockPanel } from "./TripLockPanel";
import { TripStagePanel } from "./TripStagePanel";

/**
 * The Free China Business Trip's participants, for the office (the admin
 * rail's "Free China Trip" section).
 *
 * Each row shows the participant's Trip ID (TRIP-26-00001, the application's
 * own number), their account when they had one (AFFHAN customer number, how
 * they sign in, when the account was made) and every answer they gave. No
 * account is needed to apply since 2026-10-28 (the owner: "remove the login");
 * an application sent while signed in still belongs to that account. Above
 * the list: how many have registered, today, this week, and from how many
 * countries.
 *
 * The business profile step and "About your business" were taken out of the
 * form the same day: an application that answered them still shows them (and
 * the export keeps their columns); one that did not has no such rows.
 *
 * Newest first, in the triage the other leads use (new, handled, spam, and a
 * soft delete). A row opens every answer the applicant gave, grouped the way
 * the form asked them, with call / WhatsApp / email on top so the next step
 * is one tap. Excel export of whatever the filter shows.
 *
 * Filters (the owner, 2026-10-13): the business journey, as step 02's first
 * question asked it, and the country, either or both, one of each at a time,
 * as the form's own choices are one of four (picking another switches to it;
 * several at once read as a fault: "multiple of items are selecting"). Every
 * count on the page answers "how many would I get": an option's count is the
 * list with every other filter applied and its own set aside, so with India
 * picked, "Runs a business" shows how many Indians run one, and an option
 * that would empty the list is dimmed.
 *
 * Step 02 is the applicant's business journey (running a business, planning
 * one, expanding one, or none yet), and only the answers that journey asked
 * are shown. The order is arrival only: nothing here scores or ranks an
 * application, and the winners are drawn at random (Terms, clause 3).
 *
 * Registered again (the owner, 2026-10-29: with no sign-in and no email,
 * people can apply "again and again" from any browser): a button beside the
 * tabs that shows, in place of the list, the applications sent with the same
 * mobile number, one group a number. By the number only, never the name
 * ("name vachu pakadha mobile number same haa matu paru": a name like Mohamed
 * is many people's). Worked out over every application, not the list's
 * newest 2,000 (/api/admin/trip-applications/repeats/, lib/trip-repeats.ts);
 * spam and deleted ones never count, so marking the extra ones spam settles a
 * group.
 *
 * Nothing sensitive is collected by the form (no passport numbers, no
 * documents), so there is nothing here to mask.
 */

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

type Status = "new" | "handled" | "spam" | "deleted";

interface Application {
  id: string;
  referenceNo: string;
  createdAt: string;
  status: Status;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  profileUrl: string | null;
  businessStatus: string;
  companyName: string | null;
  role: string | null;
  businessCategory: string | null;
  companyWebsite: string | null;
  yearsInBusiness: string | null;
  businessDescription: string | null;
  businessPlan: string | null;
  areaOfInterest: string | null;
  exploreGoal: string | null;
  interests: string[];
  productsOfInterest: string;
  exploreNotes: string | null;
  nationality: string;
  hasPassport: boolean;
  travelledToChina: boolean;
  consentPrivacy: boolean;
  consentAccuracy: boolean;
  consentTerms: boolean;
  userId: string | null;
  source: string;
  /** AFFHAN-0001: the customer's number (CustomerCode), when one has been issued. */
  customerCode: string | null;
  /** The account that sent it; null when it was sent without signing in (allowed since 2026-10-28, and before sign-in was first required). */
  user: Account | null;
}

interface Account {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  authProvider: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileImage: string | null;
  accountStatus: string;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

/** How the account signs in, in the office's words. */
const SIGN_IN: Record<string, string> = {
  EMAIL: "Email & password",
  GOOGLE: "Google",
  EMAIL_AND_GOOGLE: "Email & Google",
  PHONE: "Mobile number",
};
const signInOf = (p: string) => SIGN_IN[p] ?? p;

type TabKey = "new" | "handled" | "spam" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "handled", label: "Handled" },
  { key: "spam", label: "Spam" },
  { key: "all", label: "All" },
];

/** What the address asked for (page.tsx), before it is checked. */
export interface InitialFilters {
  tab: string;
  journey: string;
  country: string;
  /** "again": the Registered again view. */
  view?: string;
}

/** The applications with one mobile number, newest first (/api/admin/trip-applications/repeats/). */
interface RepeatGroupView {
  applications: Application[];
}

interface Repeats {
  /** How many applications were looked at (every one not spam or deleted). */
  checked: number;
  groups: RepeatGroupView[];
}

/**
 * A status change seen at once in the groups: spam and deleted leave their group, and a group left with one
 * application goes (the server's next answer says the same).
 */
function withStatus(repeats: Repeats, id: string, status: Status): Repeats {
  const groups = repeats.groups
    .map((g) => ({
      ...g,
      applications:
        status === "spam" || status === "deleted"
          ? g.applications.filter((a) => a.id !== id)
          : g.applications.map((a) => (a.id === id ? { ...a, status } : a)),
    }))
    .filter((g) => g.applications.length > 1);
  return { ...repeats, groups };
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const IST = 5.5 * 3600 * 1000;
/** Midnight in India before `ms`, as a timestamp. */
const istDayStart = (ms: number) => {
  const d = new Date(ms + IST);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - IST;
};
/** A phone row's date, as a messaging app writes it: the time today, "Yesterday", then the day. */
const shortDate = (iso: string, now: number) => {
  const t = Date.parse(iso);
  const today = istDayStart(now);
  if (t >= today) return new Date(t).toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (t >= today - 86400 * 1000) return "Yesterday";
  return new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

/** The country as filtered and counted: the name the form stored, trimmed. */
const countryOf = (r: { country: string }) => r.country.trim();

/** A small real flag (flagcdn SVG; Windows has no flag emoji), or nothing for a name the list does not know. */
function Flag({ country, className = "" }: { country: string; className?: string }) {
  const src = countryFlagUrl(country);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden="true" width={18} height={13} loading="lazy" className={`h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 ${className}`} />;
}

const statusPill: Record<Status, string> = {
  new: "bg-[#0071e3]/10 text-[#0058b0]",
  handled: "bg-emerald-500/10 text-emerald-700",
  spam: "bg-amber-500/15 text-amber-800",
  deleted: "bg-black/[0.06] text-[#86868b]",
};

const digits = (phone: string) => phone.replace(/[^\d]/g, "");
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function TripApplicationsBoard({ initial }: { initial?: InitialFilters }) {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(() => TABS.find((t) => t.key === initial?.tab)?.key ?? "new");
  const [q, setQ] = useState("");
  /** The business journey and the country picked, one of each at most; null is everyone. */
  const [journey, setJourney] = useState<string | null>(() => (isKnownBusinessStatus(initial?.journey) ? initial.journey : null));
  const [country, setCountry] = useState<string | null>(() => initial?.country?.trim().slice(0, 100) || null);
  /** Registered again: the groups in place of the list. */
  const [showRepeats, setShowRepeats] = useState(() => initial?.view === "again");
  /** The groups from the server, or null until they are read (or when they could not be). */
  const [repeats, setRepeats] = useState<Repeats | null>(null);
  const [repeatsFailed, setRepeatsFailed] = useState(false);
  /** Picking the one already picked lets it go; picking another switches to it. */
  const pick = (current: string | null, v: string) => (current === v ? null : v);
  const clearFilters = () => {
    setJourney(null);
    setCountry(null);
    setQ("");
  };

  // The filters into the address as they change, without a server round trip, so a reload or a shared link
  // opens the same list (page.tsx reads them back). The search stays out: it is typing, not a list.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "new") p.set("tab", tab);
    if (journey) p.set("journey", journey);
    if (country) p.set("country", country);
    if (showRepeats) p.set("view", "again");
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [tab, journey, country, showRepeats]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What "Today" and "This week" count from: the last read, so after midnight a refresh moves them on.
  const [now, setNow] = useState(() => Date.now());

  /** The list from the server, or null when it could not be read (the error says why). */
  const load = useCallback(async (): Promise<Application[] | null> => {
    setError(null);
    try {
      const res = await fetch("/api/admin/trip-applications/", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : "Could not load applications.");
      const body = (await res.json()) as { applications: Application[] };
      setRows(body.applications);
      return body.applications;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
      setRows((r) => r ?? []);
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Registered again, over every application (not only the list's newest 2,000). Unread, the button has no count. */
  const loadRepeats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/trip-applications/repeats/", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRepeats((await res.json()) as Repeats);
      setRepeatsFailed(false);
    } catch {
      // The list is unaffected; Registered again says so, and the next refresh tries again.
      setRepeatsFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadRepeats();
  }, [loadRepeats]);

  // Refresh: the list, the lock and the stage together (the two panels add their own reads here), with the
  // button saying what it is doing and then what it found. It had no state at all, so a press that found
  // nothing new looked like a button that did nothing (the owner: "refresh button not working", 2026-10-12).
  const panelLoads = useRef(new Set<() => Promise<void>>());
  const [refreshing, setRefreshing] = useState<null | "busy" | { fresh: number }>(null);
  /** The applications the last refresh brought in, lit in the list for a moment. */
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const refreshAll = async () => {
    if (refreshing === "busy") return;
    setRefreshing("busy");
    const known = new Set((rows ?? []).map((r) => r.id));
    const panels = [...panelLoads.current].map((read) => read());
    panels.push(loadRepeats());
    const next = await load();
    await Promise.all(panels);
    setNow(Date.now());
    if (!next) return setRefreshing(null);
    const fresh = next.filter((r) => !known.has(r.id)).map((r) => r.id);
    setLit(new Set(fresh));
    setRefreshing({ fresh: fresh.length });
  };
  useEffect(() => {
    if (!refreshing || refreshing === "busy") return;
    const t = window.setTimeout(() => setRefreshing(null), 2600);
    return () => window.clearTimeout(t);
  }, [refreshing]);
  useEffect(() => {
    if (!lit.size) return;
    const t = window.setTimeout(() => setLit(new Set()), 4000);
    return () => window.clearTimeout(t);
  }, [lit]);

  const newCount = useMemo(() => (rows ?? []).filter((r) => r.status === "new").length, [rows]);

  /** The figures over the list: registrations (not spam), today and this week in India's time, and countries. */
  const stats = useMemo(() => {
    const real = (rows ?? []).filter((r) => r.status !== "spam");
    const today = istDayStart(now);
    const week = today - 6 * 86400 * 1000;
    return {
      total: real.length,
      today: real.filter((r) => Date.parse(r.createdAt) >= today).length,
      week: real.filter((r) => Date.parse(r.createdAt) >= week).length,
      countries: new Set(real.map((r) => r.country)).size,
    };
  }, [rows, now]);

  /** Every row's searchable words, once per load rather than once per keystroke. */
  const words = useMemo(
    () =>
      new Map(
        (rows ?? []).map((r) => [
          r.id,
          [r.referenceNo, r.fullName, r.email, r.phone, r.companyName, r.city, r.country, r.businessCategory, r.areaOfInterest, businessStatusBrief(r.businessStatus), r.customerCode, r.user?.email, r.user?.name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        ]),
      ),
    [rows],
  );

  const needle = q.trim().toLowerCase();
  const narrowed = journey !== null || country !== null || needle !== "";

  // One pass for the list and every count beside a filter. Each count leaves out its own filter and keeps the
  // others: the tabs count across the journey, the country and the search; a journey's count is the list as it
  // would be with that journey picked instead; a country's likewise.
  const view = useMemo(() => {
    const tabs: Record<TabKey, number> = { new: 0, handled: 0, spam: 0, all: 0 };
    const byJourney = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const list: Application[] = [];
    let inTab = 0;
    for (const r of rows ?? []) {
      const t = tab === "all" || r.status === tab;
      const s = !needle || (words.get(r.id) ?? "").includes(needle);
      const j = !journey || r.businessStatus === journey;
      const c = !country || countryOf(r) === country;
      if (s && j && c) {
        tabs.all++;
        if (r.status === "new" || r.status === "handled" || r.status === "spam") tabs[r.status]++;
      }
      if (t) inTab++;
      if (t && s && c) byJourney.set(r.businessStatus, (byJourney.get(r.businessStatus) ?? 0) + 1);
      if (t && s && j) byCountry.set(countryOf(r), (byCountry.get(countryOf(r)) ?? 0) + 1);
      if (t && s && j && c) list.push(r);
    }
    return { tabs, byJourney, byCountry, list, inTab };
  }, [rows, words, tab, needle, journey, country]);
  const list = view.list;

  /** Every country anyone applied from, most applications first: an order the filters never reshuffle. */
  const countryOptions = useMemo(() => {
    const total = new Map<string, number>();
    for (const r of rows ?? []) if (countryOf(r)) total.set(countryOf(r), (total.get(countryOf(r)) ?? 0) + 1);
    if (country && !total.has(country)) total.set(country, 0);
    return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  }, [rows, country]);

  // A group's application may be older than the list's newest 2,000: then it is found in the groups.
  const open = rows?.find((r) => r.id === openId) ?? repeats?.groups.flatMap((g) => g.applications).find((r) => r.id === openId) ?? null;

  const setStatus = async (id: string, status: Status) => {
    if (!rows) return;
    if (status === "deleted" && !window.confirm("Delete this application? It will be hidden from this list.")) return;
    const before = rows;
    const repeatsBefore = repeats;
    setRows(status === "deleted" ? rows.filter((r) => r.id !== id) : rows.map((r) => (r.id === id ? { ...r, status } : r)));
    if (repeats) setRepeats(withStatus(repeats, id, status));
    if (status === "deleted") setOpenId(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/trip-applications/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      // The groups as the server now works them out (back to New or Handled, an application rejoins its group).
      void loadRepeats();
    } catch {
      setRows(before);
      setRepeats(repeatsBefore);
      setError("That change did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Registered again's groups, narrowed by the search: a group shows when any of its applications matches. */
  const shownGroups = useMemo(() => {
    const groups = repeats?.groups ?? [];
    if (!needle) return groups;
    const has = (a: Application) =>
      [a.referenceNo, a.fullName, a.email, a.phone, a.city, a.country, a.companyName, a.customerCode].filter(Boolean).join(" ").toLowerCase().includes(needle);
    return groups.filter((g) => g.applications.some(has));
  }, [repeats, needle]);
  /** What the page shows, as rows: the list, or every application in the groups shown, group by group. */
  const shownRows = showRepeats ? shownGroups.flatMap((g) => g.applications) : list;

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    // Registered again: each row says which number's group it is in.
    const groupOf = new Map<string, string>();
    if (showRepeats) shownGroups.forEach((g, i) => g.applications.forEach((a) => groupOf.set(a.id, `Number ${i + 1} (${g.applications.length} applications)`)));
    const headers = [
      ...(showRepeats ? ["Same mobile number"] : []),
      "Trip ID", "Registered", "Status", "Customer no.", "Account ID", "Account email", "Signs in with", "Account created",
      "Full name", "Email", "Mobile", "Country", "City", "Website / LinkedIn",
      "Business journey", "Company / brand", "Role", "Business category / area", "Company website", "Years in business",
      "About the business", "Planning to build", "Area of interest", "Would like to explore",
      "Interested in", "Products of interest", "Hoping to explore", "Nationality", "Valid passport", "Been to China",
      "Privacy Policy", "Accurate & complete", "Terms & Conditions",
    ];
    const yes = (v: boolean) => (v ? "Yes" : "No");
    const data = shownRows.map((r) => [
      ...(showRepeats ? [groupOf.get(r.id) ?? ""] : []),
      r.referenceNo, fmtDate(r.createdAt), r.status, r.customerCode ?? "", r.user?.id ?? "", r.user?.email ?? "", r.user ? signInOf(r.user.authProvider) : "", r.user ? fmtDate(r.user.createdAt) : "",
      r.fullName, r.email, r.phone, r.country, r.city, r.profileUrl ?? "",
      businessStatusBrief(r.businessStatus), r.companyName ?? "", r.role ?? "", r.businessCategory ?? "", r.companyWebsite ?? "", r.yearsInBusiness ?? "",
      r.businessDescription ?? "", r.businessPlan ?? "", r.areaOfInterest ?? "", r.exploreGoal ?? "",
      r.interests.join(", "), r.productsOfInterest, r.exploreNotes ?? "", r.nationality, yes(r.hasPassport), r.travelledToChina ? "Yes" : "",
      yes(r.consentPrivacy), yes(r.consentAccuracy), yes(r.consentTerms),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    // Mobile numbers as text, or Excel shows 919876543210 as 9.19E+11.
    for (let row = 1; row <= data.length; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: headers.indexOf("Mobile") })];
      if (cell) {
        cell.t = "s";
        cell.z = "@";
        cell.v = String(cell.v ?? "");
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Free China Trip");
    // A filtered list says so in its name ("…-sri-lanka.xlsx"), so a file found later is not taken for everyone.
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const parts = (showRepeats ? ["registered again"] : [country ?? "", journey ? businessStatusBrief(journey) : ""]).map(slug).filter(Boolean);
    const suffix = parts.length ? `-${parts.join("-")}` : "";
    XLSX.writeFile(wb, `free-china-trip-${new Date().toISOString().slice(0, 10)}${suffix}.xlsx`);
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        {/* The title keeps a readable width: on a phone the buttons beside it had squeezed it to one word a
            line (2026-10-12). They drop under it together instead, on the right. */}
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-[min(100%,15rem)] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Free China Trip</h1>
            <p className="text-[13px] text-[#86868b]">
              Everyone registered for the Free China Business Trip, with their Trip ID and every answer
              {rows ? ` · ${newCount} new` : ""}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* One width for all three words, so Export beside it never moves. */}
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshing === "busy"}
              aria-busy={refreshing === "busy"}
              className="inline-flex h-9 min-w-[8.75rem] items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:cursor-wait"
            >
              {refreshing === "busy" ? (
                <>
                  <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" /> Refreshing…
                </>
              ) : refreshing ? (
                <>
                  <Check size={14} className="text-emerald-600" /> {refreshing.fresh ? `${refreshing.fresh} new` : "Up to date"}
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Refresh
                </>
              )}
            </button>
            <span aria-live="polite" className="sr-only">
              {refreshing && refreshing !== "busy" ? (refreshing.fresh ? `${refreshing.fresh} new applications` : "Up to date") : ""}
            </span>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={!shownRows.length}
              title={`Export the ${shownRows.length} ${shownRows.length === 1 ? "application" : "applications"} shown`}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:opacity-50"
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {/* The homepage banner's chain lock, and the key to it. */}
        <TripLockPanel refreshers={panelLoads} />
        {/* How far the trip has got: what every applicant's "What happens next" shows. */}
        <TripStagePanel refreshers={panelLoads} />

        {error && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</p>}

        {/* On a phone the four figures share one row (they were a 2 x 2 of tall cards, a screen's worth of
            height before the list began); from a tablet up, as they were. */}
        {rows && rows.length > 0 && (
          <dl className="mb-5 grid grid-cols-4 gap-2 sm:gap-3">
            {[
              ["Registered", stats.total],
              ["Today", stats.today],
              ["This week", stats.week],
              ["Countries", stats.countries],
            ].map(([label, n]) => (
              <div key={label} className="min-w-0 rounded-2xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-black/[0.06] sm:px-4 sm:py-3">
                <dt className="truncate text-[11px] text-[#86868b] sm:text-[12px]">{label}</dt>
                <dd className="mt-0.5 text-[19px] font-semibold tabular-nums tracking-tight sm:text-[24px]">{n}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* The journey and country filters narrow the list; Registered again looks at everyone, so not there. */}
        {rows && rows.length > 0 && !showRepeats && (
          <FilterPanel
            journey={journey}
            country={country}
            byJourney={view.byJourney}
            byCountry={view.byCountry}
            countryOptions={countryOptions}
            onJourney={(v) => setJourney((j) => pick(j, v))}
            onCountry={(v) => setCountry((c) => pick(c, v))}
            onAllJourneys={() => setJourney(null)}
            onAllCountries={() => setCountry(null)}
          />
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filter by status" className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-black/[0.06]">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key && !showRepeats}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  setShowRepeats(false);
                }}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${tab === t.key && !showRepeats ? "bg-[#1d1d1f] text-white" : "text-[#1d1d1f] hover:bg-black/[0.04]"}`}
              >
                {t.label} <span className={tab === t.key && !showRepeats ? "text-white/70" : "text-[#86868b]"}>{view.tabs[t.key]}</span>
              </button>
            ))}
          </div>
          {/* Registered again: in place of the list, the applications sent with the same mobile number, grouped. */}
          <button
            type="button"
            aria-pressed={showRepeats}
            onClick={() => setShowRepeats((v) => !v)}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] transition-colors ${showRepeats ? "bg-[#1d1d1f] text-white" : "bg-white text-[#1d1d1f] hover:bg-black/[0.02]"}`}
          >
            <Users size={14} /> Registered again
            {repeats && <span className={showRepeats ? "text-white/70" : "text-[#86868b]"}>{repeats.groups.length}</span>}
          </button>
          <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <span className="sr-only">Search applications</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, Trip ID, email, customer no., company…"
              className="h-9 w-full rounded-full bg-white pl-9 pr-4 text-[13px] shadow-sm ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
        </div>

        {/* What the list is narrowed to, each piece removable, while anything narrows it. */}
        {rows && rows.length > 0 && narrowed && !showRepeats && (
          <div aria-live="polite" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]">
            <span className="mr-1 font-medium">
              <span className="tabular-nums">{list.length}</span> of <span className="tabular-nums">{view.inTab}</span>{" "}
              {tab === "all" ? (view.inTab === 1 ? "application" : "applications") : tab}
            </span>
            {journey && <ActiveFilter label={businessStatusBrief(journey)} onRemove={() => setJourney(null)} />}
            {country && <ActiveFilter label={country} flag={country} onRemove={() => setCountry(null)} />}
            {needle && <ActiveFilter label={`“${q.trim()}”`} onRemove={() => setQ("")} />}
            <button type="button" onClick={clearFilters} className="ml-auto font-medium text-[#0058b0] hover:underline">
              Clear all
            </button>
          </div>
        )}

        {showRepeats ? (
          <RepeatsView repeats={repeats} failed={repeatsFailed} groups={shownGroups} query={q.trim()} now={now} onOpen={setOpenId} onClearSearch={() => setQ("")} />
        ) : rows === null ? (
          <p className="py-16 text-center text-[13px] text-[#86868b]">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/[0.06]">
            {narrowed ? (
              <>
                <p className="text-[15px] font-medium">No applications match these filters.</p>
                <button type="button" onClick={clearFilters} className="mt-2 text-[13px] font-medium text-[#0058b0] hover:underline">
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <p className="text-[15px] font-medium">No applications {tab === "all" ? "yet" : `marked ${tab}`}.</p>
                <p className="mt-1 text-[13px] text-[#86868b]">Applications from the free China business trip page arrive here.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
            <ul className="divide-y divide-black/[0.06]">
              {list.map((r) => (
                <ApplicationRow key={r.id} r={r} now={now} lit={lit.has(r.id)} showStatus={tab === "all"} onOpen={setOpenId} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && <Detail a={open} busy={busy} onClose={() => setOpenId(null)} onStatus={(s) => void setStatus(open.id, s)} />}
    </div>
  );
}

/**
 * One application as a row: on a phone or a tablet three lines, the person first; from lg the five columns.
 * `compare` (a Registered again group): the mobile number and email where the company or the email alone stood,
 * and the status always, so a group's applications can be told apart at a glance.
 */
function ApplicationRow({
  r, now, lit = false, showStatus, compare = false, onOpen,
}: { r: Application; now: number; lit?: boolean; showStatus: boolean; compare?: boolean; onOpen: (id: string) => void }) {
  const contact = compare ? [r.phone, r.email].filter(Boolean).join(" · ") : r.email || r.phone;
  return (
    // Lit for a moment when the last refresh brought it in, fading back as the light goes.
    <li className={`transition-colors duration-1000 ${lit ? "bg-[#0071e3]/[0.07]" : ""}`}>
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] lg:grid-cols-[9rem_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem] lg:items-center lg:gap-4 lg:px-5 lg:py-4"
      >
        {/* A phone or a tablet: three lines, the person first. On a phone the five columns below
            stacked into nine lines a row (240 applications came to some 55,000px); on a tablet they cut
            the company short and wrapped the time (2026-10-13). From lg, the five columns. */}
        <span className="min-w-0 lg:hidden">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.fullName}</span>
            <span className="shrink-0 font-mono text-[11.5px] font-semibold text-[#0058b0]">{r.referenceNo}</span>
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-[#48484a]">
            {compare ? contact : [r.companyName || businessStatusBrief(r.businessStatus), r.businessCategory || r.areaOfInterest].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[12px] text-[#86868b]">
            <Flag country={r.country} />
            <span className="min-w-0 flex-1 truncate">{r.city}, {r.country}</span>
            {(showStatus || compare) && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusPill[r.status]}`}>{r.status}</span>
            )}
            <span className="shrink-0 tabular-nums">{shortDate(r.createdAt, now)}</span>
          </span>
        </span>
        <span className="min-w-0 max-lg:hidden">
          <span className="block font-mono text-[12.5px] font-semibold text-[#0058b0]">{r.referenceNo}</span>
          <span className="block truncate text-[12px] text-[#86868b]">{r.customerCode ?? (r.user ? "Account linked" : "No account")}</span>
        </span>
        <span className="min-w-0 max-lg:hidden">
          <span className="block truncate text-[14px] font-semibold">{r.fullName}</span>
          <span className={`block truncate text-[12px] ${compare ? "text-[#48484a]" : "text-[#86868b]"}`}>{contact}</span>
        </span>
        <span className="min-w-0 max-lg:hidden">
          <span className="block truncate text-[14px]">{r.companyName || businessStatusBrief(r.businessStatus)}</span>
          <span className="block truncate text-[12px] text-[#86868b]">{r.businessCategory || r.areaOfInterest}</span>
        </span>
        <span className="min-w-0 text-[13px] max-lg:hidden">
          <span className="block truncate">{r.city}, {r.country}</span>
          <span className="block text-[12px] text-[#86868b]">{fmtDate(r.createdAt)}</span>
        </span>
        <span className={`w-fit rounded-full px-2.5 py-1 text-[12px] font-medium capitalize max-lg:hidden ${statusPill[r.status]}`}>{r.status}</span>
      </button>
    </li>
  );
}

/**
 * Registered again: one card a mobile number, the number across its top and its applications under it, newest
 * first; the number with the newest application first.
 */
function RepeatsView({
  repeats, failed, groups, query, now, onOpen, onClearSearch,
}: {
  repeats: Repeats | null;
  failed: boolean;
  groups: RepeatGroupView[];
  query: string;
  now: number;
  onOpen: (id: string) => void;
  onClearSearch: () => void;
}) {
  if (!repeats) {
    return <p className="py-16 text-center text-[13px] text-[#86868b]">{failed ? "Could not check for repeat applications. Press Refresh to try again." : "Checking every application…"}</p>;
  }
  if (!repeats.groups.length) {
    return (
      <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/[0.06]">
        <p className="text-[15px] font-medium">No mobile number has more than one application.</p>
        <p className="mt-1 text-[13px] text-[#48484a]">All {repeats.checked.toLocaleString("en-IN")} applications checked.</p>
      </div>
    );
  }
  const numbers = (n: number) => `${n.toLocaleString("en-IN")} ${n === 1 ? "mobile number" : "mobile numbers"}`;
  return (
    <div className="grid gap-3">
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span>
          <span className="font-medium">{query ? `${groups.length} of ${numbers(repeats.groups.length)}` : numbers(repeats.groups.length)}</span> with more
          than one application, out of {repeats.checked.toLocaleString("en-IN")}
        </span>
        {query && (
          <button type="button" onClick={onClearSearch} className="font-medium text-[#0058b0] hover:underline">
            Clear search
          </button>
        )}
      </p>
      {groups.length === 0 && <p className="text-[13px] text-[#48484a]">No one here matches “{query}”.</p>}
      {groups.map((g) => (
        <section key={g.applications[0]?.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
          <h3 className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] bg-black/[0.015] px-4 py-2.5 text-[13px] lg:px-5">
            <span className="font-semibold tabular-nums">{g.applications[0]?.phone}</span>
            <span className="shrink-0 tabular-nums text-[#48484a]">{g.applications.length} applications</span>
          </h3>
          <ul className="divide-y divide-black/[0.06]">
            {g.applications.map((r) => (
              <ApplicationRow key={r.id} r={r} now={now} showStatus compare onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The two filters over the list: the business journey, step 02's first question in the board's words (the
 * form's own wording on hover), and the country. One of each at a time, as the form asks for one of four:
 * picking another switches to it, picking the one that is on lets it go, and "Show all" beside a heading
 * goes back to everyone for that filter. Each option shows what picking it would leave (the board's counts),
 * and one that would leave nothing is dimmed and cannot be pressed unless it is on. On a phone the four
 * journeys run one a line, every one in sight, and the countries run in one row that scrolls sideways, most
 * applications first, with the country picked kept in view.
 */
function FilterPanel({
  journey,
  country,
  byJourney,
  byCountry,
  countryOptions,
  onJourney,
  onCountry,
  onAllJourneys,
  onAllCountries,
}: {
  journey: string | null;
  country: string | null;
  byJourney: Map<string, number>;
  byCountry: Map<string, number>;
  countryOptions: string[];
  onJourney: (v: string) => void;
  onCountry: (v: string) => void;
  onAllJourneys: () => void;
  onAllCountries: () => void;
}) {
  const id = useId();
  const head = "text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]";
  const showAll = "text-[12.5px] font-medium text-[#0058b0] hover:underline";

  // The country picked, brought into the sideways row's view when it lies off either edge (a phone; from a
  // tablet up the chips wrap and nothing scrolls). The row alone moves, never the page.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    const chip = country ? row?.querySelector<HTMLElement>(`[data-country="${CSS.escape(country)}"]`) : null;
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    // The row is the chips' offset parent (relative), so this is the chip's place along the row's content.
    const left = chip.offsetLeft;
    if (left >= row.scrollLeft && left + chip.offsetWidth <= row.scrollLeft + row.clientWidth - 32) return;
    row.scrollTo({ left: Math.max(0, left - (row.clientWidth - chip.offsetWidth) / 2), behavior: "smooth" });
  }, [country]);

  return (
    <section aria-label="Filter the applications" className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.06] sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-journey`} className={head}>
          Business journey
        </h2>
        {journey && (
          <button type="button" onClick={onAllJourneys} className={showAll}>
            Show all
          </button>
        )}
      </div>
      {/* A phone: one answer a line, every count in one column (two by two squeezed "Planning to start a
          business" into three lines). Two across from a tablet, four from a computer. A radio's dot, as on
          the form: one answer at a time. */}
      <div role="group" aria-labelledby={`${id}-journey`} className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
        {/* The two journeys taken out on 2026-10-28 too: the applications sent before then carry them. */}
        {EVERY_BUSINESS_STATUS.map((s) => {
          const on = journey === s.value;
          const n = byJourney.get(s.value) ?? 0;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={on}
              disabled={!on && n === 0}
              title={s.label}
              onClick={() => onJourney(s.value)}
              className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-40 sm:min-h-[3.25rem] sm:py-2.5 ${on ? "bg-[#1d1d1f] text-white" : "bg-[#f5f5f7] text-[#1d1d1f] enabled:hover:bg-black/[0.06]"}`}
            >
              <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-white ${on ? "" : "ring-1 ring-black/20"}`}>
                {on && <span className="h-2 w-2 rounded-full bg-[#1d1d1f]" />}
              </span>
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{s.brief}</span>
              <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${on ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h2 id={`${id}-country`} className={head}>
          Country
        </h2>
        {country && (
          <button type="button" onClick={onAllCountries} className={showAll}>
            Show all
          </button>
        )}
      </div>
      {/* A phone: one row to the card's edges, scrolling sideways, fading where more waits off the right. */}
      <div
        ref={rowRef}
        role="group"
        aria-labelledby={`${id}-country`}
        className="relative -mx-4 mt-2.5 flex gap-2 overflow-x-auto pl-4 pr-10 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%_-_32px),transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {countryOptions.map((c) => {
          const on = country === c;
          const n = byCountry.get(c) ?? 0;
          return (
            <button
              key={c}
              type="button"
              data-country={c}
              aria-pressed={on}
              disabled={!on && n === 0}
              onClick={() => onCountry(c)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium ring-1 transition-colors disabled:cursor-default disabled:opacity-40 ${on ? "bg-[#1d1d1f] text-white ring-transparent" : "bg-white text-[#1d1d1f] ring-black/[0.1] enabled:hover:bg-black/[0.03]"}`}
            >
              <Flag country={c} />
              {c}
              <span className={`tabular-nums ${on ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** One thing the list is narrowed to, over the list, with its own remove. */
function ActiveFilter({ label, flag, onRemove }: { label: string; flag?: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-1 text-[12.5px] font-medium shadow-sm ring-1 ring-black/[0.06]">
      {flag && <Flag country={flag} />}
      <span className="max-w-[14rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid h-5 w-5 place-items-center rounded-full text-[#86868b] hover:bg-black/[0.06] hover:text-[#1d1d1f]"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </span>
  );
}

/**
 * Step 02's answers, as the applicant's business journey asked them (BUSINESS_FIELDS in lib/trip-application.ts).
 * Since 2026-10-28 running a business asks a company's name, role and category, and planning to start one asks
 * nothing more; what was asked before then is shown only where an application answered it.
 */
function businessRows(a: Application): Array<[string, React.ReactNode]> {
  const site = (url: string | null) =>
    url ? <a className="text-[#0058b0] underline" href={href(url)} target="_blank" rel="noopener noreferrer">{url}</a> : null;
  const answered = (rows: Array<[string, React.ReactNode]>) => rows.filter(([, v]) => v);
  const journey: [string, React.ReactNode] = ["Business journey", businessStatusBrief(a.businessStatus) || a.businessStatus];
  if (a.businessStatus === "planning_business") {
    return [journey, ...answered([["Business / brand name", a.companyName], ["Category / area", a.businessCategory], ["Company website", site(a.companyWebsite)], ["Planning to build", a.businessPlan]])];
  }
  if (a.businessStatus === "no_business_yet") {
    return [journey, ["Area of interest", a.areaOfInterest], ["Would like to explore in China", a.exploreGoal]];
  }
  return [
    journey,
    ["Company", a.companyName],
    ["Role", a.role],
    ["Category", a.businessCategory],
    ...answered([["Years in business", a.yearsInBusiness], ["Company website", site(a.companyWebsite)], ["About the business", a.businessDescription]]),
  ];
}

function Detail({ a, busy, onClose, onStatus }: { a: Application; busy: boolean; onClose: () => void; onStatus: (s: Status) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const section = (title: string, rows: Array<[string, React.ReactNode]>) => (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">{title}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12px] text-[#86868b]">{k}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px]">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-app-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[#f5f5f7] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.06] bg-[#f5f5f7]/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#86868b]">
              <span className="font-mono font-semibold text-[#0058b0]">{a.referenceNo}</span> · Registered {fmtDate(a.createdAt)}
            </p>
            <h2 id="trip-app-title" className="mt-0.5 truncate text-xl font-semibold tracking-tight">{a.fullName}</h2>
            <p className="truncate text-[13px] text-[#86868b]">{[a.role, a.companyName].filter(Boolean).join(", ") || businessStatusBrief(a.businessStatus)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06]">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          {/* A phone: Call across the top, WhatsApp and Email side by side under it (they had wrapped into a
              ragged two and one); WhatsApp across alone when there is no email (none is asked since
              2026-10-29). From a tablet up, one row as before. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a href={`tel:${a.phone.replace(/\s+/g, "")}`} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-medium text-white sm:h-9">
              <Phone size={14} /> Call {a.phone}
            </a>
            <a href={`https://wa.me/${digits(a.phone)}`} target="_blank" rel="noopener noreferrer" className={`inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] sm:h-9 ${a.email ? "" : "col-span-2"}`}>
              <MessageCircle size={14} /> WhatsApp
            </a>
            {a.email && (
            <a href={`mailto:${a.email}?subject=${encodeURIComponent(`Your Free China Business Trip application (${a.referenceNo})`)}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] sm:h-9">
              <Mail size={14} /> Email
            </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-[#86868b]">Status:</span>
            {(["new", "handled", "spam"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || a.status === s}
                onClick={() => onStatus(s)}
                className={`rounded-full px-3 py-1.5 font-medium capitalize ring-1 ring-black/[0.06] ${a.status === s ? statusPill[s] : "bg-white hover:bg-black/[0.03]"} disabled:cursor-default`}
              >
                {s === "handled" ? "Handled" : s === "spam" ? "Spam" : "New"}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => onStatus("deleted")} className="ml-auto rounded-full px-3 py-1.5 font-medium text-red-600 hover:bg-red-500/10">
              Delete
            </button>
          </div>

          {section("About the applicant", [
            // Earlier applications only: none is asked since 2026-10-29.
            ...(a.email ? [["Email", a.email] as [string, string]] : []),
            ["Mobile", a.phone],
            ["City", a.city],
            ["Country", a.country],
            // Earlier applications only: not asked since 2026-10-29.
            ...(a.profileUrl ? [["Website / LinkedIn", <a key="site" className="text-[#0058b0] underline" href={href(a.profileUrl)} target="_blank" rel="noopener noreferrer">{a.profileUrl}</a>] as [string, React.ReactNode]] : []),
          ])}
          {section("Account", a.user
            ? [
                ["Trip ID", <span key="t" className="font-mono font-semibold">{a.referenceNo}</span>],
                ["Customer no.", a.customerCode],
                ["Account name", a.user.name],
                ["Account email", a.user.email ? `${a.user.email}${a.user.emailVerified ? " (verified)" : ""}` : null],
                ["Account mobile", a.user.phone ? `${a.user.phone}${a.user.phoneVerified ? " (verified)" : ""}` : null],
                ["Signs in with", signInOf(a.user.authProvider)],
                ["Account created", fmtDate(a.user.createdAt)],
                ["Last signed in", a.user.lastLoginAt ? `${fmtDate(a.user.lastLoginAt)} (${a.user.loginCount} sign-ins)` : null],
                ["Account status", a.user.accountStatus === "ACTIVE" ? "Active" : a.user.accountStatus],
                ["Account ID", <span key="i" className="font-mono text-[12px]">{a.user.id}</span>],
              ]
            : [
                ["Trip ID", <span key="t" className="font-mono font-semibold">{a.referenceNo}</span>],
                ["Customer no.", a.customerCode],
                ["Account", "None: sent without signing in"],
              ])}
          {section("Business journey", businessRows(a))}
          {/* The business profile step, no longer asked since 2026-10-28: only where it was answered. */}
          {(a.interests.length > 0 || a.productsOfInterest || a.exploreNotes) &&
            section("Business profile", [
              ["Interested in", a.interests.join(", ")],
              ["Products or categories", a.productsOfInterest],
              ["Hoping to explore in China", a.exploreNotes],
            ])}
          {section("Travel profile", [
            ["Nationality", a.nationality],
            ["Holds a valid passport", a.hasPassport ? "Yes" : "No"],
            // No longer asked since 2026-10-29 (new rows hold false): shown only where an earlier application said yes.
            ...(a.travelledToChina ? [["Been to China before", "Yes"] as [string, string]] : []),
          ])}
          {section("Consent", [
            ["Privacy Policy", a.consentPrivacy ? "Consented" : "Not given"],
            ["Information is accurate", a.consentAccuracy ? "Confirmed" : "Not given"],
            ["Terms & Conditions", a.consentTerms ? "Agreed" : "Not given"],
          ])}
        </div>
      </aside>
    </div>
  );
}

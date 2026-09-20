"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { AssigneePicker, Avatar } from "@/components/admin/AssigneePicker";
import { CustomerGroupSummary } from "@/components/admin/CustomerGroupSummary";
import { AccountMenu } from "@/components/admin/AccountMenu";
import { RAIL_GROUPS, type RailItem } from "@/components/admin/rail-sections";
import { CustomerCodeBadge } from "@/components/ui/CustomerCodeBadge";
import type { EmployeeOption, Theme } from "@/components/admin/console-theme";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Inbox, Users, LogOut, RefreshCw, Download, Search, Phone, Mail,
  MapPin, MessageCircle, PhoneCall, Package, Layers, ChevronRight, Sun, Moon, X,
  Trash2, ZoomIn, Loader2, RotateCcw, AlertTriangle, Check, CheckSquare, Square, KeyRound,
  MessageSquare, Calendar, LayoutList, FileSpreadsheet, FileText, ChevronDown, Menu, PlayCircle, SlidersHorizontal, UserCog,
  type LucideIcon,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { countryFlagUrl } from "@/lib/countryFlag";
import { groupCustomers, buildCustomerSheet, type CustomerGroup } from "@/lib/customerGroups";
import { isInProgress, leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { timeAgo } from "@/lib/relative-time";
import { formatDateTime, formatSince } from "@/lib/datetime";
import { signOutThrough } from "@/lib/session-client";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useAdminDark } from "@/lib/useAdminDark";

interface Inquiry {
  id: string; createdAt: string; customerName: string; companyName: string | null;
  email: string | null; country: string; phone: string; productName: string; quantity: number;
  message: string | null; productId: number | null; productImage: string | null; status: string;
  // Set when the inquiry was raised by someone signed in. Null for the
  // anonymous majority, and for every row that predates the account linkage.
  userId: string | null;
  // The lifecycle the CUSTOMER sees, distinct from `status` above, which is
  // internal triage. See the note on the Inquiry model in schema.prisma.
  customerStatus: string; statusNote: string | null; statusUpdatedAt: string | null;
  /** The employee working this lead, or null. Set from the console; read by
   *  the staff workspace at /employee/dashboard. */
  assignedToId: string | null;
  /** The newest sales outcome recorded against it, if anybody has. */
  lastStatus: LeadOutcome | null;
}

/**
 * What the assigned employee last said happened.
 *
 * Deliberately separate from `status` (new | handled | spam), which is the
 * office's own triage: one says "have we dealt with this", the other says
 * "what came of it". A row can be Handled and Not converted at once.
 */
interface LeadOutcome { status: string; by: string; note: string | null; at: string }

/** Rows per employee across the whole table; employeeId null is "unassigned". */
interface AssigneeCount { employeeId: string | null; count: number }
/** The filter's value: null is "everyone", UNASSIGNED is "nobody yet". */
const UNASSIGNED = "__unassigned__";

// Kept in step with lib/inquiry-status.ts. Not imported from it because that
// module is server-shaped; this is only the wording for the console's own
// selector, which describes each stage from the office's point of view rather
// than the customer's.
type CustomerStatus = "PENDING" | "CHECKED" | "IN_PROGRESS" | "CUSTOM";
const CUSTOMER_STATUS_META: Record<CustomerStatus, { label: string; hint: string; chip: string; dot: string }> = {
  PENDING: { label: "Pending", hint: "Nobody has picked it up yet", chip: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  CHECKED: { label: "Checked", hint: "Read, feasibility being confirmed", chip: "bg-sky-500/10 text-sky-600", dot: "bg-sky-500" },
  IN_PROGRESS: { label: "In Progress", hint: "Sourcing / quoting under way", chip: "bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  CUSTOM: { label: "Custom", hint: "Your own wording is shown instead", chip: "bg-violet-500/10 text-violet-600", dot: "bg-violet-500" },
};
const CUSTOMER_STATUSES = Object.keys(CUSTOMER_STATUS_META) as CustomerStatus[];
/**
 * A write from the console, with the reason it failed kept intact.
 *
 * Every one of these used to be `if (!res.ok) throw new Error()` and an alert
 * saying "Please try again" — which is wrong advice for the failure that
 * actually happens here. The admin session ends after thirty minutes with
 * nobody touching it, but the console that is already on screen carries on
 * looking signed in until something asks; the next save then 401s and the
 * admin is told to retry something that cannot succeed until they log in
 * again.
 *
 * So a 401 says so and goes to the login screen. Anything else surfaces
 * whatever the server actually said, rather than a shrug.
 */
class AdminWriteError extends Error {}

async function adminWrite(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (res.ok) return;

  if (res.status === 401) {
    window.alert("Your admin session has ended — signing in again will restore it.\n\n(It closes after 30 minutes with no activity.)");
    window.location.href = "/admin/login";
    // Never resolves, so the caller does not also show its own message on the
    // way out of the page.
    await new Promise(() => {});
  }

  const said = await res.json().then((j) => j?.error).catch(() => null);
  throw new AdminWriteError(said || `The server refused it (HTTP ${res.status}).`);
}

const asCustomerStatus = (s: string): CustomerStatus =>
  (CUSTOMER_STATUSES as readonly string[]).includes(s) ? (s as CustomerStatus) : "PENDING";

interface ContactMessage {
  id: string; createdAt: string; fullName: string; companyName: string | null;
  email: string; country: string; phone: string; message: string; status: string;
  assignedToId: string | null;
  lastStatus: LeadOutcome | null;
}
const contactName = (c: ContactMessage) => c.fullName.trim();


type Status = "new" | "handled" | "spam";
const STATUS_META: Record<Status, { label: string; dot: string; text: string; chip: string }> = {
  new: { label: "New", dot: "bg-sky-500", text: "text-sky-600", chip: "bg-sky-500/10 text-sky-600" },
  handled: { label: "Handled", dot: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-500/10 text-emerald-600" },
  spam: { label: "Spam", dot: "bg-red-500", text: "text-red-600", chip: "bg-red-500/10 text-red-600" },
};
const asStatus = (s: string): Status => (s === "handled" || s === "spam" ? s : "new");

/** Everything, or only the people who named a company on the form. */
type CompanyFilter = "all" | "with";

/** One row of the Country filter: the stored name, and how many rows carry it. */
type CountryOption = { country: string; count: number };

/**
 * "The same country has N entries on the other list" — the point being to spot
 * one company that both requested a quote and wrote in, which is invisible
 * while the two lists are read separately.
 *
 * A button rather than a link: both lists are views of this one component at
 * /admin/, so crossing over is a state change, not a navigation. Renders
 * nothing when there is no country selected or nothing to cross to, so it
 * never occupies space saying "0".
 */
function CrossListBadge({
  t, country, count, targetLabel, onJump,
}: {
  t: Theme;
  country: string | null;
  count: number;
  /** Where the jump lands — "Contact Us" or "Inquiries". */
  targetLabel: string;
  onJump: () => void;
}) {
  if (!country || count <= 0) return null;
  const flag = countryFlagUrl(country);
  return (
    <button
      onClick={onJump}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${t.pill}`}
      title={`Show ${targetLabel} filtered to ${country}`}
    >
      {flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flag} alt="" aria-hidden="true" width={16} height={12} className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10" />
      )}
      <span>
        View <span className="tabular-nums">{count}</span> matching {count === 1 ? "entry" : "entries"} in {targetLabel}
      </span>
      <ChevronRight size={14} className="shrink-0" />
    </button>
  );
}

/**
 * Country is filtered client-side, like every other filter on this console.
 *
 * Worth stating because the obvious alternative is a `?country=` round trip.
 * This page is one server component that loads both lists once and hands them
 * to this component; status, company, search and customer-stage are all
 * useMemo passes over those arrays. Routing Country through the server instead
 * would make it the only filter that costs a reload, and it would have to
 * re-run the stats query and the Recently Deleted tabs with it.
 *
 * Trimmed and case-insensitive: the same country reaches these tables from a
 * picker and from hand-typed legacy rows, and " India" must not be a second
 * India.
 */
const matchesCountry = (value: string | null | undefined, selected: string | null) =>
  !selected || (value ?? "").trim().toLowerCase() === selected.trim().toLowerCase();
/**
 * The Company filter used to be one row per company, scrolling inside the
 * dropdown. With a few dozen companies that turned the panel into a list nobody
 * wanted to scroll, and the question being asked is nearly always the simpler
 * one — which of these are businesses? — so it is now just the two choices.
 */
const matchesCompany = (name: string | null | undefined, f: CompanyFilter) =>
  f === "all" || Boolean(name?.trim());
/** null selects everyone, UNASSIGNED selects the rows nobody is working. */
const matchesAssignee = (assignedToId: string | null, selected: string | null) =>
  !selected || (selected === UNASSIGNED ? assignedToId === null : assignedToId === selected);

// Light/dark class-name bundle threaded through every panel/dialog below —
// built once from the `dark` toggle (see the `t` definition further down).
interface Props {
  data: {
    adminName: string; adminEmail: string; adminImage: string | null;
    stats: { products: number; categories: number; categoriesTotal: number; inquiries: number; contacts: number; suppliers: number; videos: number; queue: number; queueInvalid: number };
    inquiries: Inquiry[]; deletedInquiries: Inquiry[];
    contacts: ContactMessage[]; deletedContacts: ContactMessage[];
    /**
     * Distinct countries per table with their row counts, computed by a
     * groupBy on the server. Not derived from the arrays above, because those
     * are capped (take:5500 / take:400) and these are not — so the dropdown
     * lists every country that exists and the cross-reference badge counts
     * every row, including any past the cap.
     */
    inquiryCountries: CountryOption[]; contactCountries: CountryOption[];
    /** Active staff, for the assignment pickers. */
    employees: EmployeeOption[];
    /** Whole-table assignment counts, for the filter panel. */
    inquiryAssignees: AssigneeCount[]; contactAssignees: AssigneeCount[];
    /**
     * customerKey → AFFHAN-xxxx, their permanent number (lib/customerCode.ts).
     * Keyed by exactly what groupCustomers() keys a group by, so a group finds
     * its own number with a lookup and never a scan. A key with no entry is a
     * customer whose number has not been issued yet; the badge stays away
     * rather than inventing a placeholder.
     */
    customerCodes: Record<string, string>;
  };
}

const fmtNum = (n: number) => n.toLocaleString("en-US");
/**
 * A count small enough to sit on a 17px icon in the collapsed sidebar.
 *
 * The full figure stays in the expanded pill; this one only has to answer
 * "how many, roughly" at a glance — "1.1k" beside the icon rather than a
 * five-digit number overflowing the rail.
 */
const fmtBadge = (n: number) =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n / 100_000) / 10}M`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
const sfFont = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' } as const;

type View = "all" | "inquiries" | "trash" | "contacts";

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

export function AdminConsole({ data }: Props) {
  const router = useRouter();
  // "All" is the landing screen now: recent activity first, then the export
  // tools. It absorbed the old "Overview" tab, which held nothing else.
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  /**
   * Which stage of the customer-facing lifecycle the list is narrowed to.
   *
   * Null means "not narrowed". Set by clicking a chip in the signed-in strip,
   * which until now stated four numbers and gave no way to see who they were.
   */
  const [customerStageFilter, setCustomerStageFilter] = useState<CustomerStatus | null>(null);
  /** Country the inquiries list is narrowed to, or null for all. */
  const [countryFilter, setCountryFilter] = useState<string | null>(null);
  // Shared and remembered across the admin — see useAdminDark.
  const [dark, setDark] = useAdminDark();
  const [activeInquiry, setActiveInquiry] = useState<Inquiry | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  // Local copy so the checklist toggle / delete reflect instantly, re-synced
  // whenever the server sends fresh data (refresh).
  const [items, setItems] = useState<Inquiry[]>(data.inquiries);
  const [deletedItems, setDeletedItems] = useState<Inquiry[]>(data.deletedInquiries);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  /** null = everyone, UNASSIGNED = nobody yet, otherwise an employee id. */
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // The mobile navigation drawer. Below lg there is no sidebar, and the nav
  // used to be seven pills wrapping onto three rows above the content — a
  // third of a phone screen spent on navigation before anything was read.
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * The desktop sidebar rides collapsed to an icon rail and opens on hover.
   *
   * Hover alone would strand a keyboard user on a rail of unlabelled icons, so
   * focus moving into the sidebar opens it too — which is also what makes the
   * labels reachable by Tab. The labels stay in the DOM in both states (width
   * and opacity, never `display`), so a screen reader reads the same menu
   * whether or not a mouse is anywhere near it.
   */
  const [sideOpen, setSideOpen] = useState(false);
  useEffect(() => setItems(data.inquiries), [data.inquiries]);
  useEffect(() => setDeletedItems(data.deletedInquiries), [data.deletedInquiries]);
  // Clear the multi-select whenever the user switches views/filters.
  useEffect(() => setSelected(new Set()), [view, statusFilter, customerStageFilter, countryFilter, assigneeFilter, q]);

  // The drawer closes itself when a view is chosen, and Escape closes it too.
  useEffect(() => setMenuOpen(false), [view]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the drawer scrolling under it on iOS.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  // --- Contact Us (contact form submissions) ---------------------------------
  // Self-contained state so it never crosses wires with the inquiry lists above.
  const [contactItems, setContactItems] = useState<ContactMessage[]>(data.contacts);
  const [contactDeleted, setContactDeleted] = useState<ContactMessage[]>(data.deletedContacts);
  const [contactQ, setContactQ] = useState("");
  const [contactStatusFilter, setContactStatusFilter] = useState<"all" | Status>("all");
  const [contactCompanyFilter, setContactCompanyFilter] = useState<CompanyFilter>("all");
  /** Country the Contact Us list is narrowed to, or null for all. */
  const [contactCountryFilter, setContactCountryFilter] = useState<string | null>(null);
  const [contactTab, setContactTab] = useState<"active" | "trash">("active");
  const [contactSelected, setContactSelected] = useState<Set<string>>(new Set());
  const [contactAssigneeFilter, setContactAssigneeFilter] = useState<string | null>(null);
  const [contactBusy, setContactBusy] = useState(false);
  const [activeContact, setActiveContact] = useState<ContactMessage | null>(null);
  useEffect(() => setContactItems(data.contacts), [data.contacts]);
  useEffect(() => setContactDeleted(data.deletedContacts), [data.deletedContacts]);
  useEffect(() => setContactSelected(new Set()), [contactTab, contactStatusFilter, contactCompanyFilter, contactCountryFilter, contactAssigneeFilter, contactQ, view]);


  // Whether the Inquiries list is collapsed to one row per customer (deduped by
  // phone) instead of one row per product.
  const [groupByCustomer, setGroupByCustomer] = useState(false);

  /**
   * Open the lead a link named: /admin/?inquiry=<id> or ?contact=<id>.
   * Or just a view: /admin/?view=inquiries | contacts | trash — the rail on
   * every other admin page links to these, since here they are state rather
   * than routes.
   *
   * The activity feed and an employee's own history point at rows that live
   * inside this console rather than on pages of their own, so "which lead was
   * that" has to survive the journey. The query is read once and then wiped
   * from the address bar, so a reload is not a second jump into a modal the
   * reader has already closed.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inquiryId = params.get("inquiry");
    const contactId = params.get("contact");
    const viewParam = params.get("view");
    // The two account dialogs live here, so the rail on every other admin page
    // links to them rather than carrying its own copy — see AccountMenu.
    const accountParam = params.get("account");
    if (accountParam === "email") setShowEmail(true);
    if (accountParam === "password") setShowPwd(true);
    if (!inquiryId && !contactId && !viewParam && !accountParam) return;

    if (viewParam === "all" || viewParam === "inquiries" || viewParam === "contacts" || viewParam === "trash") {
      setView(viewParam);
    }

    if (inquiryId) {
      const row = [...data.inquiries, ...data.deletedInquiries].find((i) => i.id === inquiryId);
      if (row) {
        setView(row.status === "deleted" ? "trash" : "inquiries");
        setActiveInquiry(row);
      }
    } else if (contactId) {
      const row = [...data.contacts, ...data.deletedContacts].find((c) => c.id === contactId);
      if (row) {
        setView("contacts");
        setContactTab(row.status === "deleted" ? "trash" : "active");
        setActiveContact(row);
      }
    }
    window.history.replaceState(null, "", window.location.pathname);
    // Once, on arrival: this is a deep link, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The contact list's half of assignment. Same shape as assignInquiries. */
  const assignContacts = async (ids: string[], assignedToId: string | null) => {
    if (ids.length === 0) return;
    const idset = new Set(ids);
    const prevA = contactItems, prevD = contactDeleted;
    setContactItems((cur) => cur.map((x) => (idset.has(x.id) ? { ...x, assignedToId } : x)));
    setContactDeleted((cur) => cur.map((x) => (idset.has(x.id) ? { ...x, assignedToId } : x)));
    setActiveContact((cur) => (cur && idset.has(cur.id) ? { ...cur, assignedToId } : cur));
    setContactSelected(new Set());
    setContactBusy(true);
    try {
      await adminWrite("/api/admin/contact/", { ids, action: "assign", assignedToId });
      router.refresh();
    } catch (e) {
      setContactItems(prevA); setContactDeleted(prevD);
      window.alert(e instanceof Error ? e.message : "Could not assign.");
    } finally {
      setContactBusy(false);
    }
  };

  // Bulk contact action — same optimistic-with-rollback shape as bulkAction.
  const contactBulkAction = async (
    ids: string[],
    action: "delete" | "restore" | "purge" | "status",
    newStatus?: Status,
  ) => {
    if (ids.length === 0) return;
    const idset = new Set(ids);
    const prevA = contactItems, prevD = contactDeleted;
    if (action === "delete") {
      const moving = contactItems.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "deleted" }));
      setContactItems(contactItems.filter((x) => !idset.has(x.id)));
      setContactDeleted([...moving, ...contactDeleted]);
    } else if (action === "restore") {
      const moving = contactDeleted.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "new" }));
      setContactDeleted(contactDeleted.filter((x) => !idset.has(x.id)));
      setContactItems([...moving, ...contactItems]);
    } else if (action === "purge") {
      setContactDeleted(contactDeleted.filter((x) => !idset.has(x.id)));
    } else if (action === "status" && newStatus) {
      setContactItems(contactItems.map((x) => (idset.has(x.id) ? { ...x, status: newStatus } : x)));
    }
    setContactSelected(new Set());
    setActiveContact((cur) =>
      cur && idset.has(cur.id)
        ? action === "status" && newStatus
          ? { ...cur, status: newStatus }
          : action === "delete" || action === "purge"
          ? null
          : cur
        : cur,
    );
    setContactBusy(true);
    try {
      await adminWrite(`/api/admin/contact/`, { ids, action, status: newStatus });
    } catch (e) {
      setContactItems(prevA); setContactDeleted(prevD);
      window.alert(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setContactBusy(false);
    }
  };

  const setContactStatus = (id: string, status: Status) => contactBulkAction([id], "status", status);
  const deleteContact = (id: string) =>
    setConfirm({
      title: "Move to Recently Deleted?",
      message: "This message will be moved to Recently Deleted. You can restore it any time.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => contactBulkAction([id], "delete"),
    });
  const restoreContact = (id: string) => contactBulkAction([id], "restore");
  const purgeContact = (id: string) =>
    setConfirm({
      title: "Permanently delete?",
      message: "This cannot be undone. It will be erased forever.",
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: () => contactBulkAction([id], "purge"),
    });

  // Bulk inquiry action. delete/restore/status are status flips (nothing lost);
  // purge removes permanently. Optimistic UI with rollback if the request fails.
  const bulkAction = async (
    ids: string[],
    action: "delete" | "restore" | "purge" | "status",
    newStatus?: Status,
  ) => {
    if (ids.length === 0) return;
    const idset = new Set(ids);
    const prevA = items, prevD = deletedItems;
    if (action === "delete") {
      const moving = items.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "deleted" }));
      setItems(items.filter((x) => !idset.has(x.id)));
      setDeletedItems([...moving, ...deletedItems]);
    } else if (action === "restore") {
      const moving = deletedItems.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "new" }));
      setDeletedItems(deletedItems.filter((x) => !idset.has(x.id)));
      setItems([...moving, ...items]);
    } else if (action === "purge") {
      setDeletedItems(deletedItems.filter((x) => !idset.has(x.id)));
    } else if (action === "status" && newStatus) {
      setItems(items.map((x) => (idset.has(x.id) ? { ...x, status: newStatus } : x)));
    }
    setSelected(new Set());
    setActiveInquiry((cur) =>
      cur && idset.has(cur.id)
        ? action === "status" && newStatus
          ? { ...cur, status: newStatus }
          : action === "delete" || action === "purge"
          ? null
          : cur
        : cur,
    );
    setBulkBusy(true);
    try {
      await adminWrite(`/api/admin/inquiry/`, { ids, action, status: newStatus });
    } catch (e) {
      setItems(prevA); setDeletedItems(prevD);
      window.alert(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  /**
   * Hand inquiries to somebody, or take them back with null.
   *
   * Optimistic like every other write here: the row shows the new name at
   * once, and the whole list is put back if the server refuses — which it
   * does for a deactivated employee, so a lead cannot be parked where nobody
   * will see it.
   */
  const assignInquiries = async (ids: string[], assignedToId: string | null) => {
    if (ids.length === 0) return;
    const idset = new Set(ids);
    const prevA = items, prevD = deletedItems;
    setItems((cur) => cur.map((x) => (idset.has(x.id) ? { ...x, assignedToId } : x)));
    setDeletedItems((cur) => cur.map((x) => (idset.has(x.id) ? { ...x, assignedToId } : x)));
    setActiveInquiry((cur) => (cur && idset.has(cur.id) ? { ...cur, assignedToId } : cur));
    setSelected(new Set());
    setBulkBusy(true);
    try {
      await adminWrite(`/api/admin/inquiry/`, { ids, action: "assign", assignedToId });
      router.refresh();
    } catch (e) {
      setItems(prevA); setDeletedItems(prevD);
      window.alert(e instanceof Error ? e.message : "Could not assign.");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Per-row triage (New/Handled/Spam).
  const setStatus = (id: string, status: Status) => bulkAction([id], "status", status);

  /**
   * Move an inquiry along the lifecycle the customer can see.
   *
   * Separate from triage above and deliberately not a bulk action: this is the
   * text a named customer reads on their account page, and there is no version
   * of "tell forty people at once that we are sourcing their thing" that is
   * honest. Optimistic, with the previous rows restored if the write fails,
   * matching how triage already behaves here.
   */
  const setCustomerStatus = async (id: string, customerStatus: CustomerStatus, statusNote: string) => {
    const note = statusNote.trim();
    if (customerStatus === "CUSTOM" && !note) {
      window.alert("A custom status needs the text to show the customer.");
      return;
    }
    const prev = items;
    const stampedAt = new Date().toISOString();
    const patch = { customerStatus, statusNote: note || null, statusUpdatedAt: stampedAt };
    setItems(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setActiveInquiry((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
    try {
      await adminWrite(`/api/admin/inquiry/${id}/`, { customerStatus, statusNote: note }, "PATCH");
    } catch (e) {
      setItems(prev);
      setActiveInquiry((cur) => (cur && cur.id === id ? prev.find((x) => x.id === id) ?? cur : cur));
      window.alert(e instanceof Error ? e.message : "Could not update the customer's status.");
    }
  };

  const deleteInquiry = (id: string) =>
    setConfirm({
      title: "Move to Recently Deleted?",
      message: "This inquiry will be moved to Recently Deleted. You can restore it any time.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => bulkAction([id], "delete"),
    });

  const deleteSelected = () => {
    const ids = [...selected];
    setConfirm({
      title: `Delete ${ids.length} ${ids.length === 1 ? "inquiry" : "inquiries"}?`,
      message: "They'll be moved to Recently Deleted, where you can restore them any time.",
      confirmLabel: `Delete ${ids.length}`,
      danger: true,
      onConfirm: () => bulkAction(ids, "delete"),
    });
  };
  const statusSelected = (status: Status) => bulkAction([...selected], "status", status);

  const restoreOne = (id: string) => bulkAction([id], "restore");
  const restoreSelected = () => bulkAction([...selected], "restore");
  const purgeOne = (id: string) =>
    setConfirm({
      title: "Permanently delete?",
      message: "This cannot be undone. It will be erased forever.",
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: () => bulkAction([id], "purge"),
    });
  const purgeSelected = () => {
    const ids = [...selected];
    setConfirm({
      title: `Permanently delete ${ids.length}?`,
      message: "This cannot be undone. These inquiries will be erased forever.",
      confirmLabel: "Delete forever",
      danger: true,
      onConfirm: () => bulkAction(ids, "purge"),
    });
  };

  // Every minute while the tab is in view, and at once on coming back to it:
  // new inquiries and the staff's recorded outcomes arrive without anybody
  // reloading — and reloading is no longer a thing that signs anyone out.
  // The spinner is the real refresh now, not a fixed 700ms.
  const { refresh, refreshing, updatedAt } = useLiveRefresh(60_000);
  const logout = async () => {
    // Through session-client, which holds the clearing header back until any
    // keep-alive already in flight has landed — including the one this very
    // click woke. The trailing slash matters: without it this 307s and posts
    // twice.
    await signOutThrough("/api/auth/logout/", "admin");
    router.push("/admin/login/");
    router.refresh();
  };

  // Apple-clean in both modes: soft light greys, or a deep graphite dark.
  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", sidebar: "bg-[#151517]/90 border-white/10",
        // Opaque while the rail is open: it floats over the table then, and
        // 90% let the rows underneath show through the panel.
        sidebarOpen: "bg-[#151517] border-white/10",
        card: "bg-[#151517] ring-white/[0.08]", soft: "text-[#8a8a8e]", mid: "text-[#c7c7cc]", strong: "text-white",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]", hover: "hover:bg-white/[0.03]",
        navIdle: "text-[#a1a1a6] hover:bg-white/[0.05]", navActive: "bg-white/[0.1] text-white",
        input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]", chip: "bg-white/[0.08] text-[#a1a1a6]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]", thumb: "bg-white/[0.05]",
        qty: "bg-brand/25 text-[#7fd8ea]", overlay: "bg-black/70", modal: "bg-[#151517] text-[#f2f2f4] ring-white/[0.1]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", sidebar: "bg-white/80 border-black/[0.06]",
        sidebarOpen: "bg-white border-black/[0.06]",
        card: "bg-white ring-black/[0.04]", soft: "text-[#86868b]", mid: "text-[#48484a]", strong: "text-[#1d1d1f]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]", hover: "hover:bg-black/[0.015]",
        navIdle: "text-[#515154] hover:bg-black/[0.03]", navActive: "bg-[#ececed] text-[#1d1d1f]",
        input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]", chip: "bg-black/[0.06] text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]", thumb: "bg-[#f5f5f7]",
        qty: "bg-brand/10 text-brand-dark", overlay: "bg-slate-900/50", modal: "bg-white text-[#1d1d1f] ring-black/[0.06]",
      };

  const inquiries = useMemo(
    () => items.filter((i) =>
      (statusFilter === "all" || asStatus(i.status) === statusFilter) &&
      // Narrowed to one stage of the customer-facing lifecycle, when a chip in
      // the signed-in strip has been clicked. Anonymous rows are excluded
      // outright: they have no account, so they are in no stage at all.
      (customerStageFilter === null ||
        (Boolean(i.userId) && asCustomerStatus(i.customerStatus) === customerStageFilter)) &&
      matchesCountry(i.country, countryFilter) &&
      matchesAssignee(i.assignedToId, assigneeFilter) &&
      (!q || `${i.customerName} ${i.productName} ${i.country} ${i.email ?? ""} ${i.phone}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [items, q, statusFilter, customerStageFilter, countryFilter, assigneeFilter]
  );
  /**
   * Narrowed by country, like contactStatusCounts is by company: these numbers
   * sit next to the status rows inside the Filter panel, and if they counted
   * the whole table while the list showed one country they would describe a
   * list nobody is looking at.
   */
  const countryScopedItems = useMemo(
    () => items.filter((i) => matchesCountry(i.country, countryFilter)),
    [items, countryFilter],
  );

  /**
   * Row counts per country on the OTHER list, keyed lowercase.
   *
   * Built from the server's groupBy rather than the loaded arrays so the
   * cross-reference badge counts the whole table — the same reason those
   * queries exist. Lowercase keys because the two tables are populated by
   * different forms and " india" must find "India".
   */
  const contactCountByCountry = useMemo(
    () => new Map(data.contactCountries.map((c) => [c.country.trim().toLowerCase(), c.count])),
    [data.contactCountries],
  );
  const inquiryCountByCountry = useMemo(
    () => new Map(data.inquiryCountries.map((c) => [c.country.trim().toLowerCase(), c.count])),
    [data.inquiryCountries],
  );
  /**
   * The names in the filter panel, each with how many rows it holds.
   *
   * Counts come from the server's groupBy — the whole table, not the
   * take-capped arrays — for the same reason the country counts do. An
   * employee deactivated while still holding leads is not in this list, since
   * the picker only offers people who can work them; their rows still read
   * "Assigned" on the row itself.
   */
  const buildAssigneeOptions = (counts: AssigneeCount[]) => {
    const byId = new Map(counts.map((c) => [c.employeeId, c.count]));
    return {
      unassigned: byId.get(null) ?? 0,
      rows: data.employees.map((e) => ({ ...e, count: byId.get(e.id) ?? 0 })),
    };
  };
  const inquiryAssigneeOptions = useMemo(
    () => buildAssigneeOptions(data.inquiryAssignees),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.inquiryAssignees, data.employees],
  );
  const contactAssigneeOptions = useMemo(
    () => buildAssigneeOptions(data.contactAssignees),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.contactAssignees, data.employees],
  );

  const statusCounts = useMemo(() => {
    const c = { all: countryScopedItems.length, new: 0, handled: 0, spam: 0 };
    countryScopedItems.forEach((i) => { c[asStatus(i.status)]++; });
    return c;
  }, [countryScopedItems]);

  /**
   * The lifecycle backlog: how many signed-in customers are currently being
   * told each thing.
   *
   * Counts only inquiries with an account attached, because those are the only
   * ones with somewhere to display a status. Folding the anonymous majority in
   * would produce a "Pending" number dominated by people who will never see it,
   * which is the opposite of the question being asked — "who is waiting on us
   * and can tell?"
   */
  /**
   * What the PDF prints: the ticked rows if any are ticked, otherwise whatever
   * the list is currently showing — the same rule Export already follows, so
   * the two buttons never disagree about what "this" means.
   */
  const printRows = useMemo(
    () => (selected.size > 0 ? inquiries.filter((i) => selected.has(i.id)) : inquiries),
    [inquiries, selected]
  );

  /** Says on the printed sheet which slice of the data it actually is. */
  const printFilterLabel = useMemo(() => {
    if (selected.size > 0) return `${selected.size} selected`;
    const parts: string[] = [];
    parts.push(statusFilter === "all" ? "All inquiries" : `Status: ${statusFilter}`);
    if (customerStageFilter) parts.push(`signed-in · ${CUSTOMER_STATUS_META[customerStageFilter].label}`);
    // The printed sheet has to say it is one country's rows, or it reads as
    // the whole book with most of it missing.
    if (countryFilter) parts.push(`country: ${countryFilter}`);
    if (q.trim()) parts.push(`search: “${q.trim()}”`);
    return parts.join("  ·  ");
  }, [statusFilter, customerStageFilter, countryFilter, q, selected]);

  // Counts the country-scoped rows, so the "N of M can see a status" strip
  // describes the list on screen rather than the whole table.
  const customerStatusCounts = useMemo(() => {
    const c = { linked: 0, PENDING: 0, CHECKED: 0, IN_PROGRESS: 0, CUSTOM: 0, total: countryScopedItems.length };
    countryScopedItems.forEach((i) => {
      if (!i.userId) return;
      c.linked++;
      c[asCustomerStatus(i.customerStatus)]++;
    });
    return c;
  }, [countryScopedItems]);
  const trashList = useMemo(
    () => deletedItems.filter((i) =>
      matchesCountry(i.country, countryFilter) &&
      matchesAssignee(i.assignedToId, assigneeFilter) &&
      (!q || `${i.customerName} ${i.productName} ${i.country} ${i.email ?? ""} ${i.phone}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [deletedItems, q, countryFilter, assigneeFilter]
  );
  // Ids visible in the current view, for the select-all control.
  const visibleIds = (view === "trash" ? trashList : inquiries).map((i) => i.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(visibleIds));

  // Derived contact lists — active list respects the status filter + search;
  // trash list is the soft-deleted messages.
  const contactMatch = (c: ContactMessage, term: string) =>
    !term || `${c.fullName} ${c.companyName || ""} ${c.country} ${c.phone} ${c.email} ${c.message}`.toLowerCase().includes(term.toLowerCase());
  
  const contactWithCompany = useMemo(
    () => contactItems.filter((c) => c.companyName?.trim()).length,
    [contactItems],
  );

  const contactActive = useMemo(
    () => contactItems.filter((c) =>
      (contactStatusFilter === "all" || asStatus(c.status) === contactStatusFilter) &&
      matchesCompany(c.companyName, contactCompanyFilter) &&
      matchesCountry(c.country, contactCountryFilter) &&
      matchesAssignee(c.assignedToId, contactAssigneeFilter) &&
      contactMatch(c, contactQ)
    ),
    [contactItems, contactQ, contactStatusFilter, contactCompanyFilter, contactCountryFilter, contactAssigneeFilter]
  );
  const contactTrash = useMemo(
    () => contactDeleted.filter((c) =>
      matchesCompany(c.companyName, contactCompanyFilter) &&
      matchesCountry(c.country, contactCountryFilter) &&
      matchesAssignee(c.assignedToId, contactAssigneeFilter) &&
      contactMatch(c, contactQ)
    ),
    [contactDeleted, contactQ, contactCompanyFilter, contactCountryFilter, contactAssigneeFilter]
  );
  const contactStatusCounts = useMemo(() => {
    const scoped = contactItems.filter(
      (c) => matchesCompany(c.companyName, contactCompanyFilter) && matchesCountry(c.country, contactCountryFilter),
    );
    const c = { all: scoped.length, new: 0, handled: 0, spam: 0 };
    scoped.forEach((cItem) => { c[asStatus(cItem.status)]++; });
    return c;
  }, [contactItems, contactCompanyFilter, contactCountryFilter]);
  const contactList = contactTab === "trash" ? contactTrash : contactActive;
  const contactVisibleIds = contactList.map((c) => c.id);
  const contactAllSelected = contactVisibleIds.length > 0 && contactVisibleIds.every((id) => contactSelected.has(id));
  const toggleContactSelectAll = () =>
    setContactSelected(contactAllSelected ? new Set() : new Set(contactVisibleIds));
  const newContactCount = contactStatusCounts.new;


  // Deduplicated customers (by phone) from the currently-filtered inquiries —
  // powers the "Group by customer" view. Note this groups the loaded page; the
  // master/grouped Excel exports run server-side over the whole database.
  const customerGroups = useMemo<CustomerGroup[]>(() => groupCustomers(inquiries), [inquiries]);
  // How many customers the ticked inquiries belong to — what the selection bar
  // says while the list is grouped, and what "Assign N selected" is acting on.
  const selectedCustomerCount = useMemo(
    () => (selected.size === 0 ? 0 : customerGroups.filter((g) => g.inquiryIds.some((id) => selected.has(id))).length),
    [customerGroups, selected]
  );
  // Every customer (unfiltered) — powers the "All" view checklist + selected export.
  const allCustomerGroups = useMemo<CustomerGroup[]>(() => groupCustomers(items), [items]);

  // Export contacts to .xlsx (respects current tab, search, and any selection).
  const exportContactsExcel = async () => {
    const XLSX = await import("xlsx");
    const base = contactList;
    const src = contactSelected.size > 0 ? base.filter((c) => contactSelected.has(c.id)) : base;
    const headers = ["Date", "Full Name", "Company Name", "Email", "Country", "Phone", "Message", "Status"];
    const rows: (string | number)[][] = src.map((c) => [
      fmtDate(c.createdAt), c.fullName, c.companyName || "", c.email, c.country, c.phone, c.message, asStatus(c.status),
    ]);
    const file = contactTab === "trash" ? "contact-messages-deleted" : "contact-messages";
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((h) => ({ wch: h === "Message" ? 50 : h === "Email" ? 26 : Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, file.slice(0, 31));
    XLSX.writeFile(wb, `${file}-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportContactsPDF = () => {
    const base = contactList;
    const src = contactSelected.size > 0 ? base.filter((c) => contactSelected.has(c.id)) : base;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Contact Messages</title>
          <style>
            body { font-family: sans-serif; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f4f4f5; }
            h2 { margin: 0 0 10px 0; font-size: 18px; }
          </style>
        </head>
        <body>
          <h2>Contact Messages</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              ${src.map(c => `
                <tr>
                  <td>${fmtDate(c.createdAt)}</td>
                  <td>${c.fullName}</td>
                  <td>${c.companyName || ""}</td>
                  <td>${c.email}</td>
                  <td>${c.phone}</td>
                  <td>${c.message}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = () => { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Split a stored phone ("+91 7810012345" or bare digits) into a separate
  // dialing code and the local number by parsing a leading "+NN".
  const splitPhone = (raw: string): { code: string; number: string } => {
    const s = (raw || "").trim();
    const m = s.match(/^(\+\d{1,4})[\s-]*(.*)$/);
    if (m) return { code: m[1], number: m[2].trim() };
    return { code: "", number: s };
  };

  // Export inquiries to a real .xlsx. Phone/country-code cells are forced to
  // TEXT so Excel never turns a number like 9163000000 into "9.16E+11".
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    // If the user has ticked specific rows, export only those; otherwise export
    // the whole visible list. (selected is cleared on view/filter/search change,
    // so its ids always belong to the current list.)
    const base = view === "trash" ? trashList : inquiries;
    const src = selected.size > 0 ? base.filter((i) => selected.has(i.id)) : base;
    const headers = ["Date", "Customer", "Company", "Email", "Country", "Country Code", "Phone", "Product", "Quantity", "Message"];
    const rows: (string | number)[][] = src.map((i) => {
      const { code, number } = splitPhone(i.phone);
      return [fmtDate(i.createdAt), i.customerName, i.companyName || "", i.email || "", i.country, code, number, i.productName, i.quantity, i.message || ""];
    });
    const textCols = [5, 6]; // 0-based: Country Code, Phone
    const file = view === "trash" ? "recently-deleted" : "inquiries";

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Force the phone / country-code columns to text format (@) cell-by-cell.
    for (let r = 1; r <= rows.length; r++) {
      for (const c of textCols) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell) { cell.t = "s"; cell.z = "@"; cell.v = String(cell.v ?? ""); }
      }
    }
    // Sensible column widths so nothing is cut off.
    ws["!cols"] = headers.map((h) => ({ wch: h === "Message" || h === "Product" ? 40 : h === "Email" ? 26 : Math.max(12, h.length + 2) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, file.slice(0, 31));
    XLSX.writeFile(wb, `${file}-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // What the hamburger badges. With the nav collapsed behind a button, an
  // unread inquiry would otherwise be invisible until the menu was opened —
  // the count has to survive on the button itself.
  const newTotal = statusCounts.new + newContactCount;

  const nav: { key: View; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "all", label: "All", icon: LayoutList },
    { key: "inquiries", label: "Inquiries", icon: Inbox, count: statusCounts.new },
    { key: "contacts", label: "Contact Us", icon: MessageSquare, count: newContactCount },
    { key: "trash", label: "Recently Deleted", icon: Trash2, count: deletedItems.length },
  ];

  // `hint` spells out a figure that would otherwise look wrong next to the
  // public site. Categories shows the browsable count, with the empty CJ tree
  // nodes noted rather than silently folded into the headline number.
  const emptyCategories = data.stats.categoriesTotal - data.stats.categories;
  const statCards: { label: string; value: number; hint?: string; icon: LucideIcon; tint: string; bg: string }[] = [
    { label: "Products", value: data.stats.products, icon: Package, tint: "text-sky-500", bg: dark ? "bg-sky-500/15" : "bg-sky-50" },
    {
      label: "Categories",
      value: data.stats.categories,
      hint: emptyCategories > 0 ? `${fmtNum(data.stats.categoriesTotal)} in tree · ${fmtNum(emptyCategories)} empty` : undefined,
      icon: Layers, tint: "text-violet-500", bg: dark ? "bg-violet-500/15" : "bg-violet-50",
    },
    { label: "Inquiries", value: data.stats.inquiries, icon: Inbox, tint: "text-amber-500", bg: dark ? "bg-amber-500/15" : "bg-amber-50" },
    { label: "Messages", value: data.stats.contacts, icon: MessageSquare, tint: "text-emerald-500", bg: dark ? "bg-emerald-500/15" : "bg-emerald-50" },
    { label: "Suppliers", value: data.stats.suppliers, hint: "From the WeChat book", icon: Users, tint: "text-teal-500", bg: dark ? "bg-teal-500/15" : "bg-teal-50" },
    { label: "Videos", value: data.stats.videos, icon: PlayCircle, tint: "text-fuchsia-500", bg: dark ? "bg-fuchsia-500/15" : "bg-fuchsia-50" },
  ];

  /* Sidebar geometry, in one place because every row has to agree on it.
     The rail is 60px wide: 8px of nav padding + 6px of row padding + a 32px
     icon column puts every icon's centre on 30px, the rail's midline. The
     same numbers hold when the panel opens, so opening it moves no icon by a
     pixel — the labels simply arrive beside them. */
  const sideRow = "flex w-full items-center rounded-xl px-1.5 py-2.5 text-[13px] font-medium transition-colors";
  const sideIconCol = "relative flex h-[22px] w-8 shrink-0 items-center justify-center";
  const sideLabel = `overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${sideOpen ? "ml-2.5 max-w-[190px] opacity-100" : "ml-0 max-w-0 opacity-0"}`;
  /* A count in two forms: the pill beside the label when the panel is open,
     and a dot on the icon when it is closed. The office reads those numbers
     at a glance — how many new inquiries, how many unread messages — so they
     survive the collapse instead of leaving with the text. */
  const sideDot = `absolute -right-1.5 -top-1 min-w-[15px] rounded-full bg-brand-dark px-1 text-center text-[9px] font-bold leading-[15px] text-white transition-opacity duration-200 motion-reduce:transition-none ${sideOpen ? "opacity-0" : "opacity-100"}`;
  const sidePill = `shrink-0 overflow-hidden whitespace-nowrap rounded-full text-[11px] font-semibold leading-5 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${t.chip} ${sideOpen ? "ml-1 max-w-[72px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"}`;
  /* The same collapse as sidePill, in the colour of something that needs a
     person: the queue's given-up-on count, which is not a workload figure
     but a backlog nobody else is going to notice. */
  const sideAlert = `shrink-0 overflow-hidden whitespace-nowrap rounded-full bg-amber-500/15 text-[10.5px] font-bold leading-5 text-amber-700 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${sideOpen ? "ml-1 max-w-[96px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"}`;
  /* A group's heading. It collapses in HEIGHT rather than width, because a
     zero-width label still owns a line box and every group would cost the
     collapsed rail 14px of nothing. The hairline above each group stays, so
     the grouping is still legible at 60px with the words gone. */
  const sideGroupLabel = `overflow-hidden whitespace-nowrap px-1.5 text-[10px] font-bold uppercase tracking-[0.09em] transition-[max-height,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${t.soft} ${sideOpen ? "mb-0.5 max-h-5 opacity-100" : "mb-0 max-h-0 opacity-0"}`;

  /* The figure beside a row, where it has one. Keyed off rail-sections so the
     other rail can never be given a different set. */
  const railCount: Partial<Record<RailItem["key"], number>> = {
    inquiries: statusCounts.new,
    contacts: newContactCount,
    trash: deletedItems.length,
    suppliers: data.stats.suppliers,
    videos: data.stats.videos,
    queue: data.stats.queue,
  };

  /* One row of the rail. A function rather than a component so React sees the
     same element type between renders and nothing remounts on hover.

     Four of these are views on this page and the rest are other pages, so a
     row is a button or a link depending on which — everything else about it,
     including where the count sits, is the same either way. */
  const railRow = (item: RailItem) => {
    const active = item.view ? view === item.view : false;
    const count = railCount[item.key];
    /* Collapsed to 60px, one number has to stand for the whole queue — and a
       customer the rotation gave up on is exactly the one nobody else will
       notice, so it counts here. */
    const dot = item.key === "queue" ? data.stats.queue + data.stats.queueInvalid : count;
    const body = (
      <>
        <span className={sideIconCol}>
          <item.icon size={17} className={active ? "text-brand" : t.soft} />
          {dot !== undefined && dot > 0 && <span className={sideDot}>{fmtBadge(dot)}</span>}
        </span>
        <span className={`flex-1 ${sideLabel}`}>{item.label}</span>
        {count !== undefined && <span className={sidePill}>{fmtNum(count)}</span>}
        {/* Beside the rotating figure rather than added to it: the two numbers
            mean different things, and only one of them is somebody's job to fix
            today. The word rides along because two bare numbers side by side
            say nothing about which is which. */}
        {item.key === "queue" && data.stats.queueInvalid > 0 && (
          <span className={sideAlert}>{fmtNum(data.stats.queueInvalid)} invalid</span>
        )}
      </>
    );
    const title =
      item.key === "queue"
        ? data.stats.queueInvalid > 0
          ? `Queue — ${fmtNum(data.stats.queue)} going round, ${fmtNum(data.stats.queueInvalid)} given up on and waiting for you`
          : `Queue — ${fmtNum(data.stats.queue)} going round`
        : item.label;

    // The rail's tooltip. Collapsed, the icon is all there is.
    return item.view ? (
      <button
        key={item.key}
        onClick={() => { setView(item.view as View); setQ(""); }}
        title={title}
        className={`${sideRow} ${active ? t.navActive : t.navIdle}`}
      >
        {body}
      </button>
    ) : (
      <Link key={item.key} href={item.href} title={title} className={`${sideRow} ${t.navIdle}`}>
        {body}
      </Link>
    );
  };

  return (
    <div style={sfFont} className={`min-h-screen w-full antialiased transition-colors duration-200 ${t.page}`}>
      {/* The printable sheet. Hidden on screen, and the only thing on the page
          when printing — see InquirySheet for why this beats generating a PDF
          in JavaScript. */}
      <InquirySheet rows={printRows} filterLabel={printFilterLabel} />

      <div className="flex print:hidden">
        {/* Sidebar — an icon rail that opens on hover.
            The console is a working screen: wide tables of inquiries, and a
            printable sheet. 240px of permanent navigation was a fifth of a
            laptop's width spent on a menu that is read once a session, so it
            now rides collapsed to a 60px rail of icons and opens to its full
            width when the pointer (or the keyboard focus) is in it.

            It overlays the content rather than pushing it: the outer div
            reserves the rail's 60px and never changes, so nothing reflows on
            hover — a table that re-wrapped its columns every time the mouse
            crossed the left edge would be worse than the space it saved.

            Everything the sidebar did, it still does. Only two things are
            new: the labels have a width and an opacity, and the counts have a
            second, smaller form for when there is no room for the pill. */}
        <div className="hidden w-[60px] shrink-0 lg:block">
          <aside
            onMouseEnter={() => setSideOpen(true)}
            onMouseLeave={() => setSideOpen(false)}
            onFocusCapture={() => setSideOpen(true)}
            // Only when focus actually leaves the sidebar — moving between two
            // buttons inside it fires a blur too, and closing on that would
            // shut the panel under a keyboard user mid-Tab.
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSideOpen(false);
            }}
            className={`sticky top-0 z-40 flex h-screen flex-col overflow-hidden border-r backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none ${sideOpen ? `w-[272px] shadow-2xl ${t.sidebarOpen}` : `w-[60px] ${t.sidebar}`}`}
          >
            <div className="flex items-center px-3.5 py-5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.thumb}`}>
                <Image src="/logo.png" alt="Affhan" width={22} height={22} className="object-contain" />
              </span>
              <div className={`leading-tight ${sideLabel}`}>
                <p className="text-sm font-semibold tracking-tight">Affhan</p>
                <p className={`text-[11px] ${t.soft}`}>Admin</p>
              </div>
            </div>
            {/* Thirteen destinations in one flat column read as a list of
                everything rather than a place to go. They are grouped now, by
                the question each one answers, with a hairline between groups
                so the grouping survives the collapse to 60px — where the
                labels cannot follow, but the gaps between icon clusters can.

                It scrolls rather than clipping: the rail is h-screen with
                overflow-hidden, and the groups cost enough height that a short
                laptop screen would otherwise lose whatever sat at the bottom. */}
            <nav
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 ${
                // The scrollbar shows only once there is room for it. In the
                // 60px rail it would take a tenth of the width; open, it is the
                // only thing that says the list continues past the fold, which
                // on a short laptop screen it does. When it shows it is the
                // console's own (see .console-scroll) — the platform's was a
                // pale grey column with arrow buttons, lit up against a black
                // panel in dark mode.
                sideOpen ? `console-scroll ${dark ? "console-scroll-dark" : ""}` : "scrollbar-hide"
              }`}
            >
              {RAIL_GROUPS.map((group, i) => (
                <div
                  key={group.label ?? "top"}
                  className={i === 0 ? "space-y-1" : `mt-1.5 space-y-1 border-t pt-1.5 ${t.border}`}
                >
                  {group.label && <p className={sideGroupLabel}>{group.label}</p>}
                  {group.items.map(railRow)}
                </div>
              ))}
              <div className="pb-2" />
            </nav>
            {/* One row, not five. What you can do with the account is behind
                it — see AccountMenu — which is 160px of rail handed back to
                the navigation that has to scroll. */}
            <div className={`border-t p-2 ${t.border}`}>
              <AccountMenu
                t={t}
                name={data.adminName}
                image={data.adminImage}
                dark={dark}
                label={sideLabel}
                onEmail={() => setShowEmail(true)}
                onPassword={() => setShowPwd(true)}
                onToggleDark={() => setDark((d) => !d)}
                onSignOut={logout}
              />
            </div>
          </aside>
        </div>

        {/* Main */}
        <main className="min-w-0 flex-1 px-5 pb-16 pt-6 sm:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {view === "all" ? "All" : view === "inquiries" ? "Inquiries" : view === "contacts" ? "Contact Us" : "Recently Deleted"}
              </h1>
              <p className={`mt-0.5 text-[13px] ${t.soft}`}>Welcome back, {data.adminName.split(" ")[0]}.</p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              {/* One button instead of seven wrapping pills. The pills were
                  the whole navigation laid flat, which on a phone pushed the
                  first stat card most of the way down the screen. */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="admin-mobile-nav"
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold shadow-sm ring-1 transition-colors lg:hidden ${t.pill}`}
              >
                <Menu size={16} />
                Menu
                {newTotal > 0 && (
                  <span className="ml-0.5 rounded-full bg-brand-dark px-1.5 py-0.5 text-[10px] font-bold text-white">{fmtNum(newTotal)}</span>
                )}
              </button>
              {/* Dark toggle lives in the sidebar on desktop — only expose it in
                  the top bar on mobile (where there is no sidebar). */}
              <button onClick={() => setDark((d) => !d)} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold shadow-sm ring-1 transition-colors lg:hidden ${t.pill}`}>
                {dark ? <Sun size={15} /> : <Moon size={15} />}<span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span>
              </button>
              <span className={`hidden text-[12px] md:inline ${t.soft}`} aria-live="polite">
                {refreshing ? "Updating…" : `Updated ${timeAgo(new Date(updatedAt))}`}
              </span>
              <button onClick={refresh} disabled={refreshing} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold shadow-sm ring-1 transition-colors ${t.pill}`}>
                <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> <span className="hidden sm:inline">Refresh</span>
              </button>
              <button onClick={logout} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3.5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 lg:hidden">
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* Stat cards — the dashboard only.
              They used to be drawn above the view switch, so every screen
              opened with the same seven totals. On Inquiries or Contact Us
              that is a wall of numbers about something else standing between
              you and the list you came for. "All" is where the state of the
              business belongs; the other views get straight to their work. */}
          {view === "all" && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
            {statCards.map((s) => (
              <button
                key={s.label}
                onClick={() => { if (s.label === "Inquiries") setView("inquiries"); else if (s.label === "Messages") setView("contacts"); else if (s.label === "Suppliers") router.push("/admin/suppliers/"); else if (s.label === "Videos") router.push("/admin/videos/"); }}
                className={`rounded-2xl p-5 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${t.card}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-[18px] w-[18px] ${s.tint}`} />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{fmtNum(s.value)}</p>
                <p className={`text-xs font-medium ${t.soft}`}>{s.label}</p>
                {s.hint && <p className={`mt-0.5 text-[11px] ${t.soft}`}>{s.hint}</p>}
              </button>
            ))}
          </div>
          )}

          {view === "all" ? (
            /* One landing screen instead of two.
             *
             * "Overview" used to be a separate menu item holding nothing but
             * the two panels below — the stat cards were drawn for every
             * view, so the only thing that distinguished it was recent
             * activity. Splitting "what just came in" from "the customers who
             * sent it" across two tabs meant checking both to know where the
             * day stood. Recent activity leads, because it is the thing that
             * changes hourly; the export tools follow, because they are what
             * you come here to DO once you have read it. */
            <>
              <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Panel t={t} title="Recent inquiries" onView={() => setView("inquiries")}>
                {items.slice(0, 8).map((i) => (
                  <button key={i.id} onClick={() => setActiveInquiry(i)} className="flex w-full items-center gap-3 py-3 text-left">
                    <Thumb t={t} src={i.productImage} alt={i.productName} />
                    <div className="min-w-0 flex-1">
                      <p className={`line-clamp-1 text-[13px] font-semibold hover:text-brand-dark ${asStatus(i.status) !== "new" ? "line-through opacity-60" : ""}`}>{i.productName}</p>
                      <p className={`text-[12px] font-medium ${t.mid}`}>{i.customerName} · {i.country}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[asStatus(i.status)].chip}`}>{STATUS_META[asStatus(i.status)].label}</span>
                  </button>
                ))}
                {!items.length && <Empty t={t} label="No inquiries yet." />}
              </Panel>
              <Panel t={t} title="Recent messages" onView={() => setView("contacts")}>
                {contactItems.slice(0, 8).map((c) => (
                  <button key={c.id} onClick={() => setActiveContact(c)} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`line-clamp-1 text-[13px] font-semibold hover:text-brand-dark ${asStatus(c.status) !== "new" ? "opacity-60" : ""}`}>{c.fullName} <span className="font-normal text-slate-500 ml-1">{c.companyName ? `(${c.companyName})` : ""}</span></p>
                      <p className={`line-clamp-1 text-[12px] font-medium ${t.mid}`}>{c.country} · {c.phone} · {c.message}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[asStatus(c.status)].chip}`}>{STATUS_META[asStatus(c.status)].label}</span>
                  </button>
                ))}
                {!contactItems.length && <Empty t={t} label="No messages yet." />}
              </Panel>
              </div>

              <AllSection
                t={t}
                stats={{ inquiries: data.stats.inquiries, contacts: data.stats.contacts, customers: allCustomerGroups.length }}
                groups={allCustomerGroups}
                onGoInquiries={() => setView("inquiries")}
                onGoContacts={() => setView("contacts")}
                // Looked up live rather than passed down, so the drawer shows
                // the current row and not a copy frozen when the group was built.
                onOpenInquiry={(id) => {
                  const found = items.find((x) => x.id === id);
                  if (found) setActiveInquiry(found);
                }}
              />
            </>
          ) : view === "contacts" ? (
            <ContactsSection
              t={t}
              tab={contactTab}
              setTab={setContactTab}
              q={contactQ}
              setQ={setContactQ}
              statusFilter={contactStatusFilter}
              setStatusFilter={setContactStatusFilter}
              companyFilter={contactCompanyFilter}
              setCompanyFilter={setContactCompanyFilter}
              withCompanyCount={contactWithCompany}
              countryFilter={contactCountryFilter}
              setCountryFilter={setContactCountryFilter}
              countryOptions={data.contactCountries}
              crossCount={contactCountryFilter ? (inquiryCountByCountry.get(contactCountryFilter.trim().toLowerCase()) ?? 0) : 0}
              onCrossJump={() => { setCountryFilter(contactCountryFilter); setView("inquiries"); }}
              employees={data.employees}
              assigneeFilter={contactAssigneeFilter}
              setAssigneeFilter={setContactAssigneeFilter}
              assigneeOptions={contactAssigneeOptions}
              onAssign={(id, employeeId) => void assignContacts([id], employeeId)}
              onAssignSelected={(employeeId) => void assignContacts([...contactSelected], employeeId)}
              statusCounts={contactStatusCounts}
              list={contactList}
              selected={contactSelected}
              toggleSelect={(id) => {
                const ns = new Set(contactSelected);
                if (ns.has(id)) ns.delete(id);
                else ns.add(id);
                setContactSelected(ns);
              }}
              allSelected={contactAllSelected}
              toggleSelectAll={toggleContactSelectAll}
              busy={contactBusy}
              onOpen={setActiveContact}
              onExportExcel={exportContactsExcel}
              onExportPDF={exportContactsPDF}
              onSetStatus={setContactStatus}
              onDelete={deleteContact}
              onRestore={restoreContact}
              onPurge={purgeContact}
              onStatusSelected={(s) => contactBulkAction([...contactSelected], "status", s)}
              onDeleteSelected={() => {
                const ids = [...contactSelected];
                setConfirm({
                  title: `Delete ${ids.length} ${ids.length === 1 ? "message" : "messages"}?`,
                  message: "They'll be moved to Recently Deleted, where you can restore them any time.",
                  confirmLabel: `Delete ${ids.length}`,
                  danger: true,
                  onConfirm: () => contactBulkAction(ids, "delete"),
                });
              }}
              onRestoreSelected={() => contactBulkAction([...contactSelected], "restore")}
              onPurgeSelected={() => {
                const ids = [...contactSelected];
                setConfirm({
                  title: `Permanently delete ${ids.length}?`,
                  message: "This cannot be undone. These messages will be erased forever.",
                  confirmLabel: "Delete forever",
                  danger: true,
                  onConfirm: () => contactBulkAction(ids, "purge"),
                });
              }}
            />
          ) : (
            <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${t.card}`}>
              <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center ${t.border}`}>
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className={`absolute left-3 top-2.5 h-4 w-4 ${t.soft}`} />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search ${view === "trash" ? "deleted" : view}…`}
                    className={`h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`}
                  />
                </div>
                {/* Every "what should this list show?" choice lives inside one
                    control — see FilterMenu. The grouping toggle is passed in
                    as the View section because it is only meaningful here. */}
                {view === "inquiries" && (
                  <FilterMenu
                    t={t}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    statusCounts={statusCounts}
                    countryFilter={countryFilter}
                    setCountryFilter={setCountryFilter}
                    countryOptions={data.inquiryCountries}
                    assigneeFilter={assigneeFilter}
                    setAssigneeFilter={setAssigneeFilter}
                    assigneeOptions={inquiryAssigneeOptions}
                    extraActive={groupByCustomer}
                    summarySuffix={groupByCustomer ? " · grouped" : ""}
                    onClear={() => { setStatusFilter("all"); setCountryFilter(null); setAssigneeFilter(null); setGroupByCustomer(false); }}
                    viewSection={
                      <button
                        role="menuitemcheckbox"
                        aria-checked={groupByCustomer}
                        onClick={() => setGroupByCustomer((g) => !g)}
                        title="Collapse duplicate customers by phone number"
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${groupByCustomer ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                      >
                        <Users size={14} className="shrink-0" />
                        <span className="flex-1">Group by customer</span>
                        {groupByCustomer && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    }
                  />
                )}
                {/* Assignment on its own button, outside the Filter — see
                    AssignMenu. It assigns whatever is ticked, grouped or not:
                    ticking a customer ticks every product they asked about. */}
                {view === "inquiries" && (
                  <AssignMenu
                    t={t}
                    employees={data.employees}
                    selectedCount={selected.size}
                    onAssignSelected={(employeeId) => void assignInquiries([...selected], employeeId)}
                    busy={bulkBusy}
                  />
                )}
                <div className={`flex flex-wrap items-center gap-2 ${view === "inquiries" ? "" : "sm:ml-auto"}`}>
                  {view !== "trash" && (
                    <button onClick={exportExcel} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export the visible list"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-black">
                      <Download size={15} /> Export{selected.size > 0 ? ` (${selected.size})` : ""}
                    </button>
                  )}
                  {/* Prints the sheet at the top of this component. The browser's
                      own print dialog offers "Save as PDF", which is where the
                      file comes from — no PDF library, and the product photos
                      come out at print resolution because the browser already
                      has them. */}
                  {view === "inquiries" && (
                    <button
                      onClick={() => window.print()}
                      title="Print or save the visible list as a PDF, with product photos"
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
                    >
                      <FileText size={15} /> PDF{selected.size > 0 ? ` (${selected.size})` : ""}
                    </button>
                  )}
                  {/* Server-side grouped export: one row per unique customer,
                      over the WHOLE database (not just the loaded page). */}
                  {view === "inquiries" && (
                    <a href="/api/admin/export/all/?only=customers" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700">
                      <FileSpreadsheet size={15} /> Grouped .xlsx
                    </a>
                  )}
                </div>
              </div>

              {/* Lifecycle backlog, for the inquiries that have a customer
                  account behind them. Read-only on purpose: moving someone
                  along is a per-customer decision, made in their drawer. */}
              {/* Its own strip rather than a corner of the signed-in row,
                  which only renders when a signed-in customer exists — a
                  country can have plenty of anonymous inquiries and none of
                  those, and the cross-reference is just as useful there. */}
              {(view === "inquiries" || view === "trash") && countryFilter && (
                <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-2.5 ${t.border}`}>
                  <span className={`text-[12px] font-medium ${t.mid}`}>
                    Showing <span className="font-bold">{countryFilter}</span> only
                  </span>
                  <button
                    onClick={() => setCountryFilter(null)}
                    className={`rounded-lg px-2 py-1 text-[12px] font-semibold text-red-500 transition-colors ${t.hover}`}
                  >
                    Clear country
                  </button>
                  <span className="ml-auto">
                    <CrossListBadge
                      t={t}
                      country={countryFilter}
                      count={contactCountByCountry.get(countryFilter.trim().toLowerCase()) ?? 0}
                      targetLabel="Contact Us"
                      onJump={() => { setContactCountryFilter(countryFilter); setView("contacts"); }}
                    />
                  </span>
                </div>
              )}

              {view === "inquiries" && customerStatusCounts.linked > 0 && (
                /* Four counts on a flat line all weighed the same, so nothing
                   led and the strip read as a caption. Each stage is now a
                   chip carrying its own colour, the number is the largest
                   thing in it, and a zero is dimmed so a busy stage is what
                   the eye lands on. */
                <div className={`flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-4 py-3 ${t.border}`}>
                  <span className={`mr-1 text-[11px] font-bold uppercase tracking-wider ${t.mid}`}>
                    Signed-in customers
                  </span>
                  {CUSTOMER_STATUSES.map((s) => {
                    const n = customerStatusCounts[s];
                    const on = customerStageFilter === s;
                    return (
                      // A count nobody could click was a dead end: it said two
                      // customers were waiting and gave no way to see which.
                      // Clicking narrows the list to exactly those rows; the
                      // same chip again clears it.
                      <button
                        key={s}
                        onClick={() => setCustomerStageFilter(on ? null : s)}
                        disabled={n === 0}
                        title={n === 0 ? `No signed-in customer is at ${CUSTOMER_STATUS_META[s].label}` : `Show the ${n} at ${CUSTOMER_STATUS_META[s].label} — ${CUSTOMER_STATUS_META[s].hint}`}
                        className={`inline-flex items-center gap-2 rounded-full py-1 pl-2.5 pr-3 text-[12.5px] ring-1 transition-all ${
                          n === 0
                            ? `${t.pill} cursor-not-allowed opacity-50`
                            : on
                              ? `${CUSTOMER_STATUS_META[s].chip} ring-2 ring-brand cursor-pointer`
                              : `${CUSTOMER_STATUS_META[s].chip} ring-transparent hover:brightness-95 cursor-pointer`
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${n > 0 ? CUSTOMER_STATUS_META[s].dot : "bg-current opacity-40"}`} />
                        <span className="text-[14px] font-bold tabular-nums leading-none">{n}</span>
                        <span className="font-semibold">{CUSTOMER_STATUS_META[s].label}</span>
                        {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}

                  {customerStageFilter ? (
                    <button
                      onClick={() => setCustomerStageFilter(null)}
                      className={`ml-auto text-[12px] font-semibold text-red-500 transition-colors ${t.hover} rounded-lg px-2 py-1 cursor-pointer`}
                    >
                      Show everyone again
                    </button>
                  ) : (
                    <span className={`ml-auto text-[12px] font-medium ${t.mid}`}>
                      {/* `total` is the country-scoped row count, not
                          items.length — while the list is narrowed to one
                          country this must not quote the whole table. */}
                      <span className="font-bold">{customerStatusCounts.linked}</span> of {customerStatusCounts.total} can see a status
                    </span>
                  )}
                </div>
              )}

              {/* What the grouping actually collapsed, before the list of it. */}
              {view === "inquiries" && groupByCustomer && (
                <CustomerGroupSummary
                  t={t}
                  groups={customerGroups}
                  onlyUnassigned={assigneeFilter === UNASSIGNED}
                  onToggleUnassigned={() => setAssigneeFilter(assigneeFilter === UNASSIGNED ? null : UNASSIGNED)}
                />
              )}

              {/* Selection + bulk-action bar. Inquiries: set status / delete.
                  Recently Deleted: restore / delete forever. */}
              {(view === "inquiries" || view === "trash") && visibleIds.length > 0 && (
                <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
                  <button onClick={toggleSelectAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand-dark" : `${t.soft} hover:text-brand-deep`}`}>
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    {allSelected ? "Clear selection" : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <>
                      {/* Grouped, a tick is a customer, so the count says how
                          many rows that actually is — "1 selected" under a
                          customer with four products would be a lie. */}
                      <span className={`text-[13px] font-semibold ${t.strong}`}>
                        {view === "inquiries" && groupByCustomer
                          ? `${selected.size} ${selected.size === 1 ? "product" : "products"} · ${selectedCustomerCount} ${selectedCustomerCount === 1 ? "customer" : "customers"}`
                          : `${selected.size} selected`}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {view === "inquiries" ? (
                          <>
                            {(["new", "handled", "spam"] as Status[]).map((s) => (
                              <button key={s} onClick={() => statusSelected(s)} disabled={bulkBusy}
                                className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-60 ${STATUS_META[s].chip}`}>
                                Mark {STATUS_META[s].label}
                              </button>
                            ))}
                            <button onClick={deleteSelected} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60">
                              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={restoreSelected} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60">
                              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore selected
                            </button>
                            <button onClick={purgeSelected} disabled={bulkBusy} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60">
                              <Trash2 className="h-3.5 w-3.5" /> Delete forever
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {view === "inquiries" && groupByCustomer ? (
                <>
                  {customerGroups.length ? (
                    <ul className={`divide-y ${t.divide}`}>
                      {customerGroups.map((g) => (
                        <CustomerGroupRow
                          key={g.key}
                          g={g}
                          code={data.customerCodes[g.key]}
                          t={t}
                          employees={data.employees}
                          busy={bulkBusy}
                          selected={g.inquiryIds.length > 0 && g.inquiryIds.every((id) => selected.has(id))}
                          onToggleSelect={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              const all = g.inquiryIds.every((id) => next.has(id));
                              for (const id of g.inquiryIds) {
                                if (all) next.delete(id);
                                else next.add(id);
                              }
                              return next;
                            })
                          }
                          onAssign={(employeeId) => void assignInquiries(g.inquiryIds, employeeId)}
                          // Opens the drawer the ungrouped list uses. Looked up
                          // by id rather than passed down, so the row the drawer
                          // shows is the live one, not a copy frozen at group time.
                          onOpenInquiry={(id) => {
                            const found = items.find((x) => x.id === id);
                            if (found) setActiveInquiry(found);
                          }}
                        />
                      ))}
                    </ul>
                  ) : <Empty t={t} label="No customers found." pad />}
                </>
              ) : view === "inquiries" ? (
                inquiries.length ? (
                  <ul className={`divide-y ${t.divide}`}>
                    {inquiries.map((i) => {
                      const st = asStatus(i.status);
                      const sel = selected.has(i.id);
                      return (
                      <li key={i.id} className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center ${t.hover} ${sel ? "bg-brand/[0.05]" : st === "spam" ? "bg-red-500/[0.04]" : ""}`}>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <button onClick={() => toggleSelect(i.id)} aria-label="Select inquiry" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                            {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                          <button onClick={() => setActiveInquiry(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <Thumb t={t} src={i.productImage} alt={i.productName} big />
                            <div className="min-w-0 flex-1">
                              <p className={`line-clamp-2 text-[14px] font-semibold leading-snug hover:text-brand-dark sm:text-[13.5px] ${st !== "new" ? `line-through ${t.soft}` : t.strong}`}>{i.productName}</p>
                              {/* 12px at `mid`, with the icons left soft. The
                                  icon is decoration and can stay quiet; the
                                  name, number and address are what the row is
                                  scanned for, so they carry the contrast. */}
                              <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${t.mid}`}>
                                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Users className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-semibold">{i.customerName}</span></span>
                                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><MapPin className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{i.country}</span></span>
                                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Phone className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium tabular-nums">{i.phone}</span></span>
                                {i.email && <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Mail className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{i.email}</span></span>}
                              </div>
                            </div>
                          </button>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[92px] sm:pl-0">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>Qty {i.quantity}</span>
                          <OutcomeChip value={i.lastStatus} />
                          <AssigneePicker
                            t={t}
                            employees={data.employees}
                            value={i.assignedToId}
                            onChange={(employeeId) => void assignInquiries([i.id], employeeId)}
                            busy={bulkBusy}
                          />
                          <StatusControl t={t} value={st} onChange={(s) => setStatus(i.id, s)} />
                          <button onClick={() => deleteInquiry(i.id)} aria-label="Delete inquiry" title="Delete inquiry" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                ) : <Empty t={t} label="No inquiries found." pad />
              ) : (
                /* Recently Deleted — deleted inquiries. */
                trashList.length > 0 ? (
                  <ul className={`divide-y ${t.divide}`}>
                    {trashList.map((i) => {
                      const sel = selected.has(i.id);
                      return (
                      <li key={i.id} className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center ${t.hover} ${sel ? "bg-brand/[0.05]" : ""}`}>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <button onClick={() => toggleSelect(i.id)} aria-label="Select inquiry" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                            {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                          <button onClick={() => setActiveInquiry(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <Thumb t={t} src={i.productImage} alt={i.productName} big />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-[13px] font-semibold leading-snug opacity-70 hover:text-brand-dark">{i.productName}</p>
                              <div className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] ${t.soft}`}>
                                <span className="inline-flex min-w-0 max-w-full items-center gap-1"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{i.customerName}</span></span>
                                <span className="inline-flex min-w-0 max-w-full items-center gap-1"><Phone className="h-3 w-3 shrink-0" /><span className="truncate tabular-nums">{i.phone}</span></span>
                              </div>
                            </div>
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 pl-[92px] sm:pl-0">
                          <button onClick={() => restoreOne(i.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white">
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          <button onClick={() => purgeOne(i.id)} aria-label="Delete forever" title="Delete forever" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                ) : <Empty t={t} label="Nothing in Recently Deleted. Deleted inquiries land here and can be restored any time." pad />
              )}
            </div>
          )}
        </main>
      </div>

      {activeInquiry && (
        <InquiryModal
          t={t}
          inquiry={activeInquiry}
          onClose={() => setActiveInquiry(null)}
          onZoom={(src) => setZoomImg(src)}
          onDelete={() => deleteInquiry(activeInquiry.id)}
          onSetStatus={(s) => setStatus(activeInquiry.id, s)}
          onSetCustomerStatus={(s, note) => void setCustomerStatus(activeInquiry.id, s, note)}
        />
      )}

      {activeContact && (
        <ContactModal
          t={t}
          contact={activeContact}
          deleted={contactTab === "trash"}
          onClose={() => setActiveContact(null)}
          onDelete={() => deleteContact(activeContact.id)}
          onRestore={() => restoreContact(activeContact.id)}
          onSetStatus={(s) => setContactStatus(activeContact.id, s)}
        />
      )}

      {/* Full-screen product image zoom */}
      {/* Mobile navigation drawer.
          z-[115] sits under the dialogs (z-120+) so opening an inquiry from the
          drawer never leaves the drawer on top of it. */}
      {menuOpen && (
        <div className="fixed inset-0 z-[115] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className={`absolute inset-0 h-full w-full cursor-default ${t.overlay}`}
          />
          <div
            id="admin-mobile-nav"
            // t.card, not t.sidebar: the sidebar token is bg-white/80, which is
            // translucent by design because it sits over the page with a
            // backdrop-blur behind it. A drawer has the scrolled content moving
            // underneath it and needs to be opaque. Pairing the two tokens also
            // put two background utilities on one element, where which one wins
            // depends on CSS source order rather than anything readable here.
            className={`admin-drawer absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r shadow-2xl ${t.card} ${t.strong}`}
          >
            <div className={`flex items-center gap-2.5 border-b px-4 py-4 ${t.border}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.thumb}`}>
                <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold tracking-tight">{data.adminName}</p>
                <p className={`text-[11px] ${t.soft}`}>Administrator</p>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft}`}
              >
                <X size={17} />
              </button>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
              {nav.map((n) => (
                <button
                  key={n.key}
                  onClick={() => { setView(n.key); setQ(""); }}
                  aria-current={view === n.key ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors ${view === n.key ? t.navActive : t.navIdle}`}
                >
                  <n.icon size={18} className={view === n.key ? "text-brand" : t.soft} />
                  <span className="flex-1 text-left">{n.label}</span>
                  {n.count !== undefined && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtNum(n.count)}</span>
                  )}
                </button>
              ))}
              <Link
                href="/admin/suppliers/"
                onClick={() => setMenuOpen(false)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors ${t.navIdle}`}
              >
                <Users size={18} className={t.soft} />
                <span className="flex-1 text-left">Suppliers</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtNum(data.stats.suppliers)}</span>
              </Link>
            </nav>

            {/* Account actions, matching the desktop sidebar foot. */}
            <div className={`space-y-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${t.border}`}>
              <button onClick={() => { setMenuOpen(false); setShowEmail(true); }} className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
                <Mail size={15} /> Change email
              </button>
              <button onClick={() => { setMenuOpen(false); setShowPwd(true); }} className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
                <KeyRound size={15} /> Change password
              </button>
              <div className="flex gap-2">
                <button onClick={() => setDark((d) => !d)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
                  {dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? "Light" : "Dark"}
                </button>
                <button onClick={logout} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600">
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {zoomImg && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoomImg(null)}>
          <button onClick={() => setZoomImg(null)} aria-label="Close" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <div className="relative h-[85vh] w-[92vw] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image src={zoomImg} alt="Product" fill sizes="90vw" className="object-contain" />
          </div>
        </div>
      )}

      {/* In-app confirm dialog — replaces the browser's window.confirm so
          destructive actions get a clean, on-brand prompt. */}
      {confirm && (
        <ConfirmDialog
          t={t}
          state={confirm}
          busy={bulkBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const fn = confirm.onConfirm; setConfirm(null); fn(); }}
        />
      )}

      {showPwd && <PasswordDialog t={t} onClose={() => setShowPwd(false)} />}
      {showEmail && <EmailDialog t={t} currentEmail={data.adminEmail} onClose={() => setShowEmail(false)} />}
    </div>
  );
}

// Change-email modal. Requires the current password to confirm identity; on
// success the server re-issues the session, so we reload to pick up the new
// email everywhere.
function EmailDialog({ currentEmail, onClose, t }: { currentEmail: string; onClose: () => void; t: Theme }) {
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (email.trim().toLowerCase() === currentEmail.trim().toLowerCase()) { setError("That is already your email."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: email, currentPassword: password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload.error || "Something went wrong."); setBusy(false); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl ring-1 ${t.modal}`}>
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand-dark"><Mail className="h-4.5 w-4.5" /></span>
            <h3 className="text-lg font-semibold">Change email</h3>
          </div>
          <button onClick={onClose} className={`rounded-lg p-1 transition-opacity ${t.soft} hover:opacity-70`}><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckSquare className="h-6 w-6" /></span>
            <p className="text-sm font-medium">Email changed successfully.</p>
            <p className={`text-xs ${t.soft}`}>Use your new email to sign in next time.</p>
            <button onClick={() => window.location.reload()} className="mt-2 rounded-xl bg-brand-dark px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-6 pt-5">
              <div>
                <label className={`mb-1 block text-xs font-medium ${t.soft}`}>New email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand ${t.input}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-xs font-medium ${t.soft}`}>Current password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand ${t.input}`}
                />
              </div>
              {error && <p className="text-xs font-medium text-red-500">{error}</p>}
            </div>
            <div className="mt-5 flex gap-2 p-4">
              <button onClick={onClose} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ring-1 transition-colors ${t.pill}`}>Cancel</button>
              <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-dark py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Change-password modal. Self-contained: manages its own form + request to
// /api/admin/password, which verifies the current password (bcrypt) and stores
// the new hash in the DB.
function PasswordDialog({ onClose, t }: { onClose: () => void; t: Theme }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (!current || !next) { setError("Please fill in all fields."); return; }
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirmPwd) { setError("New passwords do not match."); return; }
    if (current === next) { setError("New password must be different from the current one."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload.error || "Something went wrong."); setBusy(false); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const fields: { label: string; val: string; set: (v: string) => void }[] = [
    { label: "Current password", val: current, set: setCurrent },
    { label: "New password", val: next, set: setNext },
    { label: "Confirm new password", val: confirmPwd, set: setConfirmPwd },
  ];

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl ring-1 ${t.modal}`}>
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand-dark"><KeyRound className="h-4.5 w-4.5" /></span>
            <h3 className="text-lg font-semibold">Change password</h3>
          </div>
          <button onClick={onClose} className={`rounded-lg p-1 transition-opacity ${t.soft} hover:opacity-70`}><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckSquare className="h-6 w-6" /></span>
            <p className="text-sm font-medium">Password changed successfully.</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-brand-dark px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-6 pt-5">
              {fields.map((f) => (
                <div key={f.label}>
                  <label className={`mb-1 block text-xs font-medium ${t.soft}`}>{f.label}</label>
                  <input
                    type="password"
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                    className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand ${t.input}`}
                  />
                </div>
              ))}
              {error && <p className="text-xs font-medium text-red-500">{error}</p>}
            </div>
            <div className="mt-5 flex gap-2 p-4">
              <button onClick={onClose} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ring-1 transition-colors ${t.pill}`}>Cancel</button>
              <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-dark py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Update
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Clean, on-brand confirmation modal. Used for every destructive admin action.
function ConfirmDialog({ state, onConfirm, onCancel, busy, t }: { state: NonNullable<ConfirmState>; onConfirm: () => void; onCancel: () => void; busy: boolean; t: Theme }) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" onClick={onCancel}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl ring-1 ${t.modal}`}>
        <div className="flex flex-col items-center gap-3 px-6 pt-7 text-center">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${state.danger ? "bg-red-500/10 text-red-500" : "bg-brand/10 text-brand"}`}>
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h3 className="text-lg font-semibold">{state.title}</h3>
          <p className={`text-sm ${t.soft}`}>{state.message}</p>
        </div>
        <div className="mt-6 flex gap-2 p-4">
          <button onClick={onCancel} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ring-1 transition-colors ${t.pill}`}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${state.danger ? "bg-red-500 hover:bg-red-600" : "bg-brand-dark hover:bg-brand-deep"}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Opens the ordered product's image + full details inside the admin, so staff
// never have to leave the console to see what a customer requested.
function InquiryModal({ inquiry, onClose, onZoom, onDelete, onSetStatus, onSetCustomerStatus, t }: { inquiry: Inquiry; onClose: () => void; onZoom: (src: string) => void; onDelete: () => void; onSetStatus: (s: Status) => void; onSetCustomerStatus: (s: CustomerStatus, note: string) => void; t: Theme }) {
  const img = inquiry.productImage ? (getCdnUrl(inquiry.productImage, 256) as string) : null;
  const zoomImg = inquiry.productImage ? (getCdnUrl(inquiry.productImage, 1600) as string) : null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 sm:max-h-[88dvh] ${t.modal}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
          <p className="text-sm font-semibold">Ordered product</p>
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand-dark`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* min-h-0 is doing the real work here. A flex child's min-height
            defaults to its content, so this grid refused to shrink inside the
            max-h-[88vh] shell and the shell's overflow-hidden cropped it
            instead of letting it scroll. On desktop the two columns were short
            enough to hide the fault; stacked into one column on a phone the
            content is twice as tall, and the modal lost everything past the
            first few rows — which is what made the product name and customer
            details look like they were sitting on top of the photograph.
            overscroll-contain stops the page behind scrolling once this hits
            its end. */}
        {/* items-start, and a narrower first column.
            Two equal columns stretched the image's cell to the full height of
            the details beside it, which are twice as tall — that is where the
            dead white space under the photograph came from. The image column
            now sizes to its own content and the actions sit beneath it, so the
            two sides finish at roughly the same place. */}
        {/* One column, not two.
            Splitting this into image-plus-actions beside details-plus-controls
            meant one side always ran out before the other, and whichever lost
            left a slab of white behind it. Narrowing the image only moved the
            gap. So the layout stops competing: a product band across the top,
            the customer's facts in a two-up grid under it, then the controls
            full width, then the actions pinned to the bottom of the panel. */}
        <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-5">
          {/* Product band. The photograph is a square thumbnail beside the
              name and quantity rather than a tall column of its own — at that
              size it still identifies the item, and it no longer sets a height
              the rest of the panel has to live with. Click to enlarge. */}
          <div className="flex items-start gap-4">
            {img ? (
              <button
                onClick={() => onZoom(zoomImg ?? img)}
                title="Click to enlarge"
                className={`group relative block h-28 w-28 shrink-0 overflow-hidden rounded-2xl sm:h-32 sm:w-32 ${t.thumb}`}
              >
                <Image
                  src={img}
                  alt={inquiry.productName}
                  fill
                  sizes="128px"
                  className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-105"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-3 w-3" /> Enlarge
                </span>
              </button>
            ) : (
              <div className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl text-center text-[11px] sm:h-32 sm:w-32 ${t.thumb} ${t.soft}`}>No image</div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className={`text-lg font-semibold leading-snug ${asStatus(inquiry.status) !== "new" ? `line-through ${t.soft}` : t.strong}`}>{inquiry.productName}</h3>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${t.qty}`}>Quantity: {inquiry.quantity}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_META[asStatus(inquiry.status)].chip}`}>{STATUS_META[asStatus(inquiry.status)].label}</span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            {/* The colour lives on each value now, not on the whole list.
                Setting t.soft here greyed the customer's name, phone and email
                — the facts the drawer exists to state — to the same weight as
                their own labels, so the panel read as placeholder text. */}
            {/* Two up on desktop. Six stacked rows made the panel taller than
                it needed to be, which is what left room for a gap beside it in
                the first place. */}
            <dl className="mt-5 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              <Row t={t} icon={Users} label="Customer" value={inquiry.customerName} />
              {inquiry.companyName && <Row t={t} icon={Package} label="Company" value={inquiry.companyName} />}
              <Row t={t} icon={MapPin} label="Country" value={inquiry.country} />
              <Row t={t} icon={Phone} label="Phone" value={inquiry.phone} />
              {inquiry.email && <Row t={t} icon={Mail} label="Email" value={inquiry.email} />}
              <Row t={t} icon={Inbox} label="Received" value={fmtDateTime(inquiry.createdAt)} />
            </dl>
            {inquiry.message && (
              <div className={`mt-4 rounded-xl p-3 ${t.thumb}`}>
                <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Message</p>
                {/* What the customer actually asked for. It was inheriting the
                    muted colour from the block around it. */}
                <p className={`text-sm font-medium leading-relaxed ${t.strong}`}>{inquiry.message}</p>
              </div>
            )}
            {/* Triage the customer: New / Handled / Spam (fake). */}
            <div className="mt-5">
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Mark this customer</p>
              <StatusControl t={t} value={asStatus(inquiry.status)} onChange={onSetStatus} big />
            </div>

            {/* What the customer is told. Only shown when there is a customer
                to tell — an anonymous inquiry has no account page to read it
                on, so offering the control would promise something that cannot
                happen. */}
            <CustomerStatusControl t={t} inquiry={inquiry} onChange={onSetCustomerStatus} />

            {/* Reaching the customer is what this drawer is for, so the actions
                close it out on their own rule — full width, nothing beside them
                to leave a gap. */}
            <div className={`mt-5 flex flex-wrap items-center gap-2 border-t pt-4 ${t.border}`}>
              <a href={`tel:${inquiry.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"><PhoneCall className="h-3.5 w-3.5" /> Call</a>
              <a href={waLink(inquiry.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
              <button onClick={onDelete} className="ml-auto inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The stage the customer sees on their own account page, and the note that
 * goes with it.
 *
 * Anonymous inquiries get an explanation instead of a control. Most inquiries
 * are anonymous — "Inquire Now" does not ask anyone to sign in — and an
 * enabled selector on a row with nobody attached would look like it had
 * notified someone.
 *
 * The note is applied on an explicit press rather than on every keystroke: it
 * is customer-visible copy, and saving half-typed sentences as they are typed
 * would show them half-typed.
 */
function CustomerStatusControl({
  inquiry, onChange, t,
}: { inquiry: Inquiry; onChange: (s: CustomerStatus, note: string) => void; t: Theme }) {
  const current = asCustomerStatus(inquiry.customerStatus);
  const [choice, setChoice] = useState<CustomerStatus>(current);
  const [note, setNote] = useState(inquiry.statusNote ?? "");

  // Re-seed when the drawer is pointed at a different inquiry, so the last
  // one's half-written note does not follow it.
  useEffect(() => {
    setChoice(asCustomerStatus(inquiry.customerStatus));
    setNote(inquiry.statusNote ?? "");
  }, [inquiry.id, inquiry.customerStatus, inquiry.statusNote]);

  if (!inquiry.userId) {
    return (
      <div className={`mt-5 rounded-xl p-3 text-xs ${t.thumb} ${t.soft}`}>
        <p className="font-semibold uppercase tracking-wide text-[11px]">Customer status</p>
        <p className="mt-1 leading-relaxed">
          Submitted without signing in, so there is no account page to show a status on.
          Reach them on the phone or WhatsApp above.
        </p>
      </div>
    );
  }

  const dirty = choice !== current || note.trim() !== (inquiry.statusNote ?? "");

  return (
    <div className="mt-5">
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>
        What the customer sees
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CUSTOMER_STATUSES.map((s) => {
          const meta = CUSTOMER_STATUS_META[s];
          const on = choice === s;
          return (
            <button
              key={s}
              onClick={() => setChoice(s)}
              title={meta.hint}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                on ? meta.chip : `${t.thumb} ${t.soft} hover:opacity-80`
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${on ? meta.dot : "bg-current opacity-40"}`} />
              {meta.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder={
          choice === "CUSTOM"
            ? "Required — this text is shown to the customer instead of a stage."
            : "Optional note, shown to the customer under the status."
        }
        className={`mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none ${t.thumb} ${t.border} border`}
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => onChange(choice, note)}
          disabled={!dirty}
          className="rounded-full bg-brand-dark px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Update customer
        </button>
        {inquiry.statusUpdatedAt && (
          <span className={`text-[11px] ${t.soft}`}>
            Last changed {fmtDateTime(inquiry.statusUpdatedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The inquiry list as a printable sheet — "Export PDF".
 *
 * Printed rather than generated. A PDF built in JavaScript would mean a new
 * dependency in the bundle and, worse, every product photograph fetched and
 * base64'd into the document from an S3 bucket that would have to start
 * sending CORS headers to allow it. The browser already has these images
 * decoded on screen, already paginates, already draws text at print
 * resolution, and already offers "Save as PDF" in its print dialog. So this
 * is a real sheet in the page, invisible until the moment of printing.
 *
 * Same tab deliberately: it prints what this console is showing, and a second
 * tab would have to be handed that state somehow.
 *
 * It prints whatever the console is currently showing — filter, search and
 * all — because "export what I am looking at" is the only rule that does not
 * surprise anyone. The heading says which that was.
 */
function InquirySheet({ rows, filterLabel }: { rows: Inquiry[]; filterLabel: string }) {
  return (
    <div className="hidden print:block">
      {/* Colour-exact, so the status chips do not print as empty outlines, and
          a row is never split across a page break. */}
      <style>{`
        @page { size: A4 landscape; margin: 12mm 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .affhan-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .affhan-sheet tr { break-inside: avoid; page-break-inside: avoid; }
          .affhan-sheet thead { display: table-header-group; }
        }
      `}</style>

      <div className="affhan-sheet text-[#1d1d1f]">
        <div className="mb-3 flex items-end justify-between border-b-2 border-[#1d1d1f] pb-2">
          <div>
            <h1 className="text-[18px] font-bold tracking-tight">Affhan International — Inquiries</h1>
            <p className="mt-0.5 text-[10px] text-[#6e6e73]">
              {filterLabel} · {rows.length} {rows.length === 1 ? "inquiry" : "inquiries"}
            </p>
          </div>
          <p className="text-[10px] text-[#6e6e73]">
            Exported {new Date().toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
              hour: "numeric", minute: "2-digit", hour12: true,
            })}
          </p>
        </div>

        {/* A real table, so the columns line up down the whole document and
            the header repeats on every page. */}
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-[#1d1d1f]/30 text-left">
              <th className="w-[26px] py-1.5 pr-1 font-bold">#</th>
              <th className="w-[46px] py-1.5 pr-2 font-bold">Photo</th>
              <th className="py-1.5 pr-3 font-bold">Product requested</th>
              <th className="w-[15%] py-1.5 pr-3 font-bold">Customer</th>
              <th className="w-[17%] py-1.5 pr-3 font-bold">Email</th>
              <th className="w-[12%] py-1.5 pr-3 font-bold">Mobile</th>
              <th className="w-[9%] py-1.5 pr-3 font-bold">Country</th>
              <th className="w-[38px] py-1.5 pr-2 text-right font-bold">Qty</th>
              <th className="w-[13%] py-1.5 font-bold">Requested at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, idx) => {
              const src = i.productImage ? getCdnUrl(i.productImage, 96) : null;
              return (
                <tr key={i.id} className="border-b border-black/[0.08] align-top">
                  <td className="py-1.5 pr-1 tabular-nums text-[#6e6e73]">{idx + 1}</td>
                  <td className="py-1.5 pr-2">
                    <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded border border-black/10 bg-[#f5f5f7]">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="h-full w-full object-contain" />
                      ) : null}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 font-semibold leading-snug">{i.productName}</td>
                  <td className="py-1.5 pr-3 leading-snug">
                    {i.customerName}
                    {i.companyName ? <span className="block text-[9px] text-[#6e6e73]">{i.companyName}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 break-all leading-snug">{i.email || "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums leading-snug">{i.phone}</td>
                  <td className="py-1.5 pr-3 leading-snug">{i.country}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{i.quantity}</td>
                  <td className="py-1.5 tabular-nums leading-snug">{fmtDateTime(i.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* The customer's own message, only for the rows that have one. Kept
            off the table so a long paragraph cannot stretch a column and throw
            every other row out of alignment. */}
        {rows.some((i) => i.message) && (
          <div className="mt-4 break-inside-avoid">
            <h2 className="mb-1 border-b border-[#1d1d1f]/30 pb-1 text-[11px] font-bold">Customer notes</h2>
            <ul className="text-[9.5px] leading-relaxed">
              {rows.map((i, idx) =>
                i.message ? (
                  <li key={i.id} className="break-inside-avoid border-b border-black/[0.06] py-1">
                    <span className="font-semibold">{idx + 1}. {i.customerName}</span>
                    <span className="text-[#6e6e73]"> — {i.productName}</span>
                    <span className="block">{i.message}</span>
                  </li>
                ) : null
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** The newest outcome, beside the triage control rather than replacing it. */
/**
 * The newest outcome, on the row itself.
 *
 * In progress prints the exact moment it was picked up rather than "2h": the
 * question an administrator is asking of this chip is "who is on this, and
 * since when" — a clock time answers it, a rounded duration does not. Every
 * other outcome keeps the relative time, which is what you want of something
 * that has already finished. The workspace shows the same fact with no time at
 * all; see showsTimeToStaff in lib/leadStatus.ts.
 */
function OutcomeChip({ value }: { value: LeadOutcome | null }) {
  if (!value) return null;
  const who = value.by.split(" ")[0];
  const working = isInProgress(value.status);
  return (
    <span
      title={`${leadStatusLabel(value.status)} — ${value.by}, ${formatDateTime(value.at)}${value.note ? `\n\n${value.note}` : ""}`}
      className={`inline-flex max-w-[15rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${leadStatusChip(value.status)}`}
    >
      <span className="truncate">{leadStatusLabel(value.status)}</span>
      <span className={`truncate font-semibold opacity-75`}>{who}</span>
      <span className="shrink-0 font-medium opacity-60 tabular-nums">
        {working ? `since ${formatSince(value.at)}` : timeAgo(value.at)}
      </span>
    </span>
  );
}

/** One value in a filter row that is short enough to lay out flat. */
function FilterPill({
  t, on, dot, count, onClick, children,
}: {
  t: Theme; on: boolean; dot?: string; count?: number; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors ${
        on ? "bg-brand-dark text-white ring-transparent" : t.pill
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white/70" : dot}`} />}
      <span>{children}</span>
      {count !== undefined && (
        <span className={`tabular-nums ${on ? "text-white/70" : t.soft}`}>{count}</span>
      )}
    </button>
  );
}

/**
 * Assignment, as a button of its own on the toolbar: one job, one list.
 *
 * It held two for a while. "Assigned to" had been a section inside Filter,
 * which hid handing work over behind a second click, so both were brought out
 * here together — and with five people on the team the panel then showed the
 * same five names twice, once to assign to and once to filter by, the second
 * list reading as a broken duplicate of the first.
 *
 * They are two different questions. Who should take this (an action, on the
 * rows you have ticked) belongs on a button you can reach at once; whose leads
 * am I looking at (a filter, like status and country) belongs in Filter, which
 * is where it is now. With nothing ticked this says how to use it rather than
 * disappearing, so the button never looks broken.
 *
 * The panel is portalled and clamped to the viewport, as FilterMenu's is, for
 * the same reason: the toolbar sits in an overflow-hidden card.
 */
function AssignMenu({
  t, employees, selectedCount, onAssignSelected, busy = false,
}: {
  t: Theme;
  employees: EmployeeOption[];
  selectedCount: number;
  onAssignSelected: (employeeId: string | null) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const M = 8;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(300, vw - M * 2);
      const left = Math.max(M, Math.min(b.right - width, vw - width - M));
      const below = vh - b.bottom - M * 2;
      const above = b.top - M * 2;
      const flip = below < 260 && above > below;
      setPos(flip
        ? { left, width, bottom: vh - b.top + M, maxHeight: above }
        : { left, width, top: b.bottom + M, maxHeight: below });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const term = query.trim().toLowerCase();
  const people = term
    ? employees.filter((e) => `${e.name} ${e.region ?? ""}`.toLowerCase().includes(term))
    : employees;
  const row = (on: boolean) =>
    `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
      on ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`
    }`;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ring-1 transition-colors disabled:opacity-60 ${
          selectedCount > 0 ? "bg-brand-dark text-white ring-transparent" : t.pill
        }`}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <UserCog size={15} />}
        {selectedCount > 0 ? `Assign ${selectedCount} selected` : "Assign"}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width,
            maxHeight: pos.maxHeight, overflowY: "auto",
          }}
          className={`z-[200] overflow-hidden rounded-2xl p-1.5 shadow-xl ring-1 ${t.modal}`}
        >
          <p className={`px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
            {selectedCount > 0 ? `Assign ${selectedCount} selected to` : "Assign to"}
          </p>
          {selectedCount === 0 ? (
            <p className={`px-2.5 pb-2 text-[12.5px] leading-snug ${t.soft}`}>
              Tick leads in the list, then pick who takes them here. Each row also has its own picker.
            </p>
          ) : (
            <>
              {employees.length > 6 && (
                <div className="px-1 pb-1">
                  <div className="relative">
                    <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.soft}`} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search staff…"
                      aria-label="Search staff"
                      autoFocus
                      className={`w-full rounded-xl py-1.5 pl-8 pr-2.5 text-[13px] font-medium outline-none ring-1 ring-transparent focus:ring-brand/40 ${t.input}`}
                    />
                  </div>
                </div>
              )}
              {people.map((e) => (
                <button key={e.id} role="menuitem" onClick={() => { onAssignSelected(e.id); setOpen(false); }} className={row(false)}>
                  <Avatar name={e.name} image={e.image} size={20} />
                  <span className="flex-1 truncate">
                    {e.name}
                    {e.region && <span className={`font-normal ${t.soft}`}> — {e.region}</span>}
                  </span>
                </button>
              ))}
              {people.length === 0 && (
                <p className={`px-2.5 py-2 text-[12.5px] ${t.soft}`}>{employees.length ? "Nobody matches." : "No active staff yet."}</p>
              )}
              <button role="menuitem" onClick={() => { onAssignSelected(null); setOpen(false); }} className={`${row(false)} text-red-600`}>
                <X className="h-4 w-4 shrink-0" />
                <span className="flex-1">Unassign</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * A filter whose options are too many to lay out flat: the row shows what is
 * currently chosen, and opens the list in place when you want to change it.
 */
function FilterRow({
  t, label, value, active, open, onToggle,
}: {
  t: Theme; label: string; value: string; active: boolean; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${t.hover}`}
    >
      <span className={`flex-1 ${t.mid}`}>{label}</span>
      <span className={`max-w-[8.5rem] truncate text-[12.5px] ${active ? "text-brand-dark" : t.soft}`}>{value}</span>
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${t.soft} transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/**
 * One control holding every "what should this list show?" choice.
 *
 * Inquiries and Contact Us each had the same four status pills laid
 * across their toolbar, competing with Export for attention and pushing the
 * search box around at narrow widths. They are one question, so they get one
 * button, which states its own answer: the count for whatever is selected,
 * brand-coloured once anything is applied.
 *
 * Owns its own open state — three instances exist and none of them needs to
 * know about the others.
 */
function FilterMenu({
  t, statusFilter, setStatusFilter, statusCounts,
  companyFilter, setCompanyFilter, withCompanyCount = 0,
  countryFilter = null, setCountryFilter, countryOptions = [],
  assigneeFilter = null, setAssigneeFilter, assigneeOptions,
  viewSection, extraActive = false, summarySuffix = "", onClear,
}: {
  t: Theme;
  statusFilter: "all" | Status;
  setStatusFilter: (v: "all" | Status) => void;
  statusCounts: { all: number; new: number; handled: number; spam: number };
  companyFilter?: CompanyFilter;
  setCompanyFilter?: (v: CompanyFilter) => void;
  /** How many rows named a company. Omitted or 0 hides the section. */
  withCompanyCount?: number;
  /** Selected country name, or null for all. */
  countryFilter?: string | null;
  setCountryFilter?: (v: string | null) => void;
  /** Distinct countries with row counts. Empty hides the section. */
  countryOptions?: CountryOption[];
  /**
   * Whose leads to show: null is everyone, UNASSIGNED is nobody yet, otherwise
   * an employee id. Narrowing the list by who holds it is a filter like any
   * other and belongs here with them — handing work OVER is the Assign
   * button's job, and the two were one panel for a while, which read as the
   * same five names listed twice.
   */
  assigneeFilter?: string | null;
  setAssigneeFilter?: (v: string | null) => void;
  /** Staff with their lead counts, and how many nobody holds. */
  assigneeOptions?: { unassigned: number; rows: (EmployeeOption & { count: number })[] };
  /** Optional rows under a "View" heading — grouping, on the inquiries list. */
  viewSection?: React.ReactNode;
  /** Whether anything in `viewSection` is currently on. */
  extraActive?: boolean;
  summarySuffix?: string;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const active = statusFilter !== "all" || (companyFilter && companyFilter !== "all") || Boolean(countryFilter) || Boolean(assigneeFilter) || extraActive;

  // The country search box. Local to the panel and cleared when it closes, so
  // reopening always shows the whole list rather than yesterday's query.
  const [countryQuery, setCountryQuery] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  /**
   * Which of the two long filters is open, if either.
   *
   * One at a time, deliberately: both open at once is how the panel ended up
   * taller than the screen, with a scroll area nested inside another one.
   */
  const [section, setSection] = useState<null | "assignee" | "country">(null);
  useEffect(() => { if (!open) { setCountryQuery(""); setStaffQuery(""); setSection(null); } }, [open]);
  const shownCountries = useMemo(() => {
    const term = countryQuery.trim().toLowerCase();
    if (!term) return countryOptions;
    return countryOptions.filter((c) => c.country.toLowerCase().includes(term));
  }, [countryOptions, countryQuery]);

  const shownStaff = useMemo(() => {
    const rows = assigneeOptions?.rows ?? [];
    const term = staffQuery.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((e) => `${e.name} ${e.region ?? ""}`.toLowerCase().includes(term));
  }, [assigneeOptions, staffQuery]);

  const assigneeName =
    assigneeFilter === UNASSIGNED
      ? "Unassigned"
      : assigneeFilter
        ? assigneeOptions?.rows.find((e) => e.id === assigneeFilter)?.name ?? "Someone"
        : null;

  // The panel is rendered into document.body rather than beside the button.
  //
  // Both places this menu is used sit inside a card carrying
  // `overflow-hidden rounded-2xl` (for the table's corners), and that clips an
  // absolutely-positioned child — the panel was being cut off at the card's
  // right edge. Escaping to a portal removes the clip; position: fixed then
  // lets the panel be clamped against the viewport instead, so it also stops
  // running off-screen on a narrow window, and flips above the button when
  // there is more room up there.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open) { setPos(null); return; }

    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const M = 8;                                        // breathing room at every edge
      const vw = document.documentElement.clientWidth;    // excludes the scrollbar
      const vh = window.innerHeight;

      const width = Math.min(304, vw - M * 2);            // room for a row of pills, or the window if it is narrower
      // Right-align to the button, then pull back inside the viewport.
      const left = Math.max(M, Math.min(b.right - width, vw - width - M));

      const below = vh - b.bottom - M * 2;
      const above = b.top - M * 2;
      // Only flip up when below is genuinely cramped and up is roomier.
      const flip = below < 240 && above > below;

      setPos(flip
        ? { left, width, bottom: vh - b.top + M, maxHeight: above }
        : { left, width, top: b.bottom + M, maxHeight: below });
    };

    place();
    // `true` so scrolls inside the card's own scroll containers are caught too.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The panel is portalled out of `ref`, so it needs checking separately or
      // every click inside the menu would close it before the item fired.
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // What is left for an open list once the pills, the rows and the padding
  // have taken their share — so a short window shrinks the list rather than
  // giving the panel a second scrollbar.
  const listMax = Math.max(132, Math.min(232, (pos?.maxHeight ?? 320) - 330));

  return (
    <div className="relative sm:ml-auto" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${active ? "bg-brand-dark text-white ring-transparent" : t.pill}`}
      >
        <SlidersHorizontal size={15} />
        Filter
        {/* The selected country rides on the trigger so the list is never
            narrowed by something you have to open a panel to discover. */}
        {countryFilter && (
          <span className="inline-flex max-w-[7.5rem] items-center gap-1.5">
            {countryFlagUrl(countryFilter) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={countryFlagUrl(countryFilter) as string} alt="" aria-hidden="true" width={16} height={12} className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10" />
            )}
            <span className="truncate">{countryFilter}</span>
          </span>
        )}
        {/* And who the list is narrowed to, for the same reason: it used to be
            announced by the Assign button, which is no longer where it lives. */}
        {assigneeName && <span className="max-w-[7.5rem] truncate">{assigneeName}</span>}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white/25" : t.chip}`}>
          {statusFilter === "all" ? statusCounts.all : statusCounts[statusFilter]}
          {summarySuffix}
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: pos.width,
            maxHeight: pos.maxHeight,
            // Beats the Tailwind overflow-hidden below, which is only wanted on
            // the x axis so the rounded corners still clip the rows.
            overflowY: "auto",
          }}
          className={`z-[200] overflow-hidden rounded-2xl p-1.5 shadow-xl ring-1 ${t.modal}`}
        >
          {/* Status and Company are four values and two. As stacked lists they
              cost six rows of height for information that fits on two lines. */}
          <div className="px-1 pb-1 pt-1">
            <p className={`px-1.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>Status</p>
            <div className="flex flex-wrap gap-1.5 px-0.5">
              {(["all", "new", "handled", "spam"] as const).map((sKey) => (
                <FilterPill
                  key={sKey}
                  t={t}
                  on={statusFilter === sKey}
                  dot={sKey === "all" ? "bg-slate-300" : STATUS_META[sKey as Status].dot}
                  count={sKey === "all" ? statusCounts.all : statusCounts[sKey as Status]}
                  onClick={() => { setStatusFilter(sKey); setOpen(false); }}
                >
                  {sKey === "all" ? "All" : STATUS_META[sKey as Status].label}
                </FilterPill>
              ))}
            </div>
          </div>

          {withCompanyCount > 0 && setCompanyFilter && (
            <div className="px-1 pb-1">
              <p className={`px-1.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>Company</p>
              <div className="flex flex-wrap gap-1.5 px-0.5">
                <FilterPill t={t} on={companyFilter === "all"} dot="bg-slate-300" onClick={() => { setCompanyFilter("all"); setOpen(false); }}>
                  Any
                </FilterPill>
                <FilterPill t={t} on={companyFilter === "with"} dot="bg-violet-500" count={withCompanyCount} onClick={() => { setCompanyFilter("with"); setOpen(false); }}>
                  Has a company
                </FilterPill>
              </div>
            </div>
          )}

          {/* The two that grow. Each opens in place, and opening one closes the
              other, so the panel's height stays put however many people are on
              the team or countries have written in. */}
          {(assigneeOptions && setAssigneeFilter) || (countryOptions.length > 0 && setCountryFilter) ? (
            <div className={`my-1 border-t ${t.border}`} />
          ) : null}

          {assigneeOptions && setAssigneeFilter && (
            <>
              <FilterRow
                t={t}
                label="Assigned to"
                value={
                  assigneeFilter === UNASSIGNED
                    ? `Unassigned · ${assigneeOptions.unassigned}`
                    : assigneeName ?? "Anyone"
                }
                active={Boolean(assigneeFilter)}
                open={section === "assignee"}
                onToggle={() => setSection((cur) => (cur === "assignee" ? null : "assignee"))}
              />
              {section === "assignee" && (
                <div className="pb-1">
                  {assigneeOptions.rows.length > 6 && (
                    <div className="px-1 pb-1">
                      <div className="relative">
                        <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.soft}`} />
                        <input
                          value={staffQuery}
                          onChange={(e) => setStaffQuery(e.target.value)}
                          placeholder="Search staff…"
                          aria-label="Search staff"
                          autoFocus
                          className={`w-full rounded-xl py-1.5 pl-8 pr-2.5 text-[13px] font-medium outline-none ring-1 ring-transparent focus:ring-brand/40 ${t.input}`}
                        />
                      </div>
                    </div>
                  )}
                  <div className="overflow-y-auto" style={{ maxHeight: listMax }}>
                    <button
                      role="menuitemradio"
                      aria-checked={!assigneeFilter}
                      onClick={() => { setAssigneeFilter(null); setOpen(false); }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${!assigneeFilter ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${!assigneeFilter ? "bg-brand" : "bg-slate-300"}`} />
                      <span className="flex-1">Anyone</span>
                      {!assigneeFilter && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {/* The Monday-morning question: what has nobody picked up. */}
                    <button
                      role="menuitemradio"
                      aria-checked={assigneeFilter === UNASSIGNED}
                      onClick={() => { setAssigneeFilter(assigneeFilter === UNASSIGNED ? null : UNASSIGNED); setOpen(false); }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${assigneeFilter === UNASSIGNED ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${assigneeFilter === UNASSIGNED ? "bg-brand" : "bg-slate-300"}`} />
                      <span className="flex-1">Unassigned</span>
                      <span className={`text-[12px] font-bold tabular-nums ${assigneeFilter === UNASSIGNED ? "text-brand-dark" : t.soft}`}>{assigneeOptions.unassigned}</span>
                      {assigneeFilter === UNASSIGNED && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {shownStaff.map((e) => {
                      const on = assigneeFilter === e.id;
                      return (
                        <button
                          key={e.id}
                          role="menuitemradio"
                          aria-checked={on}
                          onClick={() => { setAssigneeFilter(on ? null : e.id); setOpen(false); }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${on ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                        >
                          <Avatar name={e.name} image={e.image} size={20} />
                          <span className="flex-1 truncate">
                            {e.name}
                            {e.region && <span className={`font-normal ${t.soft}`}> — {e.region}</span>}
                          </span>
                          <span className={`text-[12px] font-bold tabular-nums ${on ? "text-brand-dark" : t.soft}`}>{e.count}</span>
                          {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                    {shownStaff.length === 0 && (
                      <p className={`px-2.5 py-2 text-[12.5px] ${t.soft}`}>
                        {assigneeOptions.rows.length ? "Nobody matches." : "No active staff yet."}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {countryOptions.length > 0 && setCountryFilter && (
            <>
              <FilterRow
                t={t}
                label="Country"
                value={countryFilter ?? "Everywhere"}
                active={Boolean(countryFilter)}
                open={section === "country"}
                onToggle={() => setSection((cur) => (cur === "country" ? null : "country"))}
              />
              {section === "country" && (
                <div className="pb-1">
                  <div className="px-1 pb-1">
                    <div className="relative">
                      <Search className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.soft}`} />
                      <input
                        value={countryQuery}
                        onChange={(e) => setCountryQuery(e.target.value)}
                        placeholder="Search countries…"
                        aria-label="Search countries"
                        autoFocus
                        className={`w-full rounded-xl py-1.5 pl-8 pr-2.5 text-[13px] font-medium outline-none ring-1 ring-transparent focus:ring-brand/40 ${t.input}`}
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: listMax }}>
                    <button
                      role="menuitemradio"
                      aria-checked={!countryFilter}
                      onClick={() => { setCountryFilter(null); setOpen(false); }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${!countryFilter ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${!countryFilter ? "bg-brand" : "bg-slate-300"}`} />
                      <span className="flex-1">All countries</span>
                      {!countryFilter && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {shownCountries.map(({ country, count }) => {
                      const on = countryFilter === country;
                      const flag = countryFlagUrl(country);
                      return (
                        <button
                          key={country}
                          role="menuitemradio"
                          aria-checked={on}
                          onClick={() => { setCountryFilter(on ? null : country); setOpen(false); }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${on ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
                        >
                          {/* Real SVG rather than a flag emoji: Windows ships no
                              flag glyphs and would print "IN" here. */}
                          {flag ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={flag} alt="" aria-hidden="true" width={18} height={13} className="h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10" />
                          ) : (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-brand" : "bg-slate-300"}`} />
                          )}
                          <span className="flex-1 truncate">{country}</span>
                          <span className={`text-[12px] font-bold tabular-nums ${on ? "text-brand-dark" : t.soft}`}>{count}</span>
                          {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                    {shownCountries.length === 0 && (
                      <p className={`px-2.5 py-2 text-[12.5px] ${t.soft}`}>Nothing matches that.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {viewSection && (
            <>
              <div className={`my-1 border-t ${t.border}`} />
              {viewSection}
            </>
          )}

          {active && onClear && (
            <>
              <div className={`my-1.5 border-t ${t.border}`} />
              <button
                onClick={() => { onClear(); setOpen(false); }}
                className={`w-full rounded-xl px-2.5 py-2 text-left text-[12.5px] font-semibold text-red-500 transition-colors ${t.hover}`}
              >
                Clear filters
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// Contact Us management: list of contact-form submissions with the same
// search / triage / soft-delete UX as inquiries, minus the product bits.
function ContactsSection({
  t, tab, setTab, q, setQ, statusFilter, setStatusFilter, statusCounts, list,
  companyFilter, setCompanyFilter, withCompanyCount,
  countryFilter, setCountryFilter, countryOptions, crossCount, onCrossJump,
  employees, assigneeFilter, setAssigneeFilter, assigneeOptions, onAssign, onAssignSelected,
  selected, toggleSelect, allSelected, toggleSelectAll, busy, onOpen, onExportExcel, onExportPDF,
  onSetStatus, onDelete, onRestore, onPurge, onStatusSelected, onDeleteSelected,
  onRestoreSelected, onPurgeSelected,
}: {
  t: Theme; tab: "active" | "trash"; setTab: (v: "active" | "trash") => void;
  q: string; setQ: (v: string) => void;
  statusFilter: "all" | Status; setStatusFilter: (v: "all" | Status) => void;
  companyFilter: CompanyFilter; setCompanyFilter: (v: CompanyFilter) => void;
  withCompanyCount: number;
  countryFilter: string | null; setCountryFilter: (v: string | null) => void;
  countryOptions: CountryOption[];
  /** Inquiries carrying the selected country — powers the cross-reference. */
  crossCount: number; onCrossJump: () => void;
  /** Active staff a message can be handed to, and the filter over them. */
  employees: EmployeeOption[];
  assigneeFilter: string | null; setAssigneeFilter: (v: string | null) => void;
  assigneeOptions: { unassigned: number; rows: (EmployeeOption & { count: number })[] };
  onAssign: (id: string, employeeId: string | null) => void;
  onAssignSelected: (employeeId: string | null) => void;
  statusCounts: { all: number; new: number; handled: number; spam: number };
  list: ContactMessage[]; selected: Set<string>; toggleSelect: (id: string) => void;
  allSelected: boolean; toggleSelectAll: () => void; busy: boolean;
  onOpen: (c: ContactMessage) => void; onExportExcel: () => void; onExportPDF: () => void;
  onSetStatus: (id: string, s: Status) => void; onDelete: (id: string) => void;
  onRestore: (id: string) => void; onPurge: (id: string) => void;
  onStatusSelected: (s: Status) => void; onDeleteSelected: () => void;
  onRestoreSelected: () => void; onPurgeSelected: () => void;
}) {
  const showBulk = list.length > 0;
  return (
    <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${t.card}`}>
      <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center ${t.border}`}>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className={`absolute left-3 top-2.5 h-4 w-4 ${t.soft}`} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab === "trash" ? "deleted messages" : "messages"}…`}
            className={`h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`}
          />
        </div>
        {/* Active / Recently Deleted toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["active", "trash"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ring-1 ${tab === tabKey ? "bg-[#1d1d1f] text-white ring-transparent" : t.pill}`}
            >
              {tabKey === "active" ? "Inbox" : "Recently Deleted"}
            </button>
          ))}
        </div>
        {/* Status filter — active inbox only. */}
        {tab === "active" && (
          <FilterMenu
            t={t}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            companyFilter={companyFilter}
            setCompanyFilter={setCompanyFilter}
            withCompanyCount={withCompanyCount}
            countryFilter={countryFilter}
            setCountryFilter={setCountryFilter}
            countryOptions={countryOptions}
            assigneeFilter={assigneeFilter}
            setAssigneeFilter={setAssigneeFilter}
            assigneeOptions={assigneeOptions}
            onClear={() => { setStatusFilter("all"); setCompanyFilter("all"); setCountryFilter(null); setAssigneeFilter(null); }}
          />
        )}
        {tab === "active" && (
          <AssignMenu
            t={t}
            employees={employees}
            selectedCount={selected.size}
            onAssignSelected={onAssignSelected}
            busy={busy}
          />
        )}
        <div className={`flex items-center gap-2 ${tab === "active" ? "" : "sm:ml-auto"}`}>
          <button onClick={onExportExcel} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export all to Excel"} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-black`}>
            <Download size={14} /> Excel
          </button>
          <button onClick={onExportPDF} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export all to PDF"} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-black`}>
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Mirrors the strip on the inquiries list: what the list is narrowed
          to, a way out, and the count on the other list. */}
      {countryFilter && (
        <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-2.5 ${t.border}`}>
          <span className={`text-[12px] font-medium ${t.mid}`}>
            Showing <span className="font-bold">{countryFilter}</span> only
          </span>
          <button
            onClick={() => setCountryFilter(null)}
            className={`rounded-lg px-2 py-1 text-[12px] font-semibold text-red-500 transition-colors ${t.hover}`}
          >
            Clear country
          </button>
          <span className="ml-auto">
            <CrossListBadge t={t} country={countryFilter} count={crossCount} targetLabel="Inquiries" onJump={onCrossJump} />
          </span>
        </div>
      )}

      {/* Selection + bulk-action bar. */}
      {showBulk && (
        <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
          <button onClick={toggleSelectAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand-dark" : `${t.soft} hover:text-brand-deep`}`}>
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? "Clear selection" : "Select all"}
          </button>
          {selected.size > 0 && (
            <>
              <span className={`text-[13px] font-semibold ${t.strong}`}>{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {tab === "active" ? (
                  <>
                    {(["new", "handled", "spam"] as Status[]).map((s) => (
                      <button key={s} onClick={() => onStatusSelected(s)} disabled={busy}
                        className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-60 ${STATUS_META[s].chip}`}>
                        Mark {STATUS_META[s].label}
                      </button>
                    ))}
                    <button onClick={onDeleteSelected} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={onRestoreSelected} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore selected
                    </button>
                    <button onClick={onPurgeSelected} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60">
                      <Trash2 className="h-3.5 w-3.5" /> Delete forever
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {list.length ? (
        <ul className={`divide-y ${t.divide}`}>
          {list.map((c) => {
            const st = asStatus(c.status);
            const sel = selected.has(c.id);
            return (
              <li key={c.id} className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center ${t.hover} ${sel ? "bg-brand/[0.05]" : st === "spam" && tab === "active" ? "bg-red-500/[0.04]" : ""}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <button onClick={() => toggleSelect(c.id)} aria-label="Select message" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                    {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </button>
                  <button onClick={() => onOpen(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
                      <MessageSquare className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Struck through once it is off "new", exactly as the
                          inquiry list does. Scanning an inbox of twenty, the
                          only question is "which of these have I dealt with" —
                          a small green chip on the far right answers it far
                          more slowly than the line through the name does. */}
                      <p className={`line-clamp-1 text-[13.5px] font-semibold leading-snug hover:text-brand-dark ${
                        st !== "new" ? `line-through ${t.soft}` : t.strong
                      } ${tab === "trash" ? "opacity-70" : ""}`}>
                        {contactName(c)}{c.companyName ? <span className={`font-normal ${t.soft}`}> · {c.companyName}</span> : null}
                      </p>
                      <p className={`mt-0.5 line-clamp-1 text-[12.5px] ${st !== "new" ? `line-through ${t.soft}` : t.mid}`}>{c.message}</p>
                      <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${t.mid}`}>
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Mail className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{c.email}</span></span>
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Phone className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium tabular-nums">{c.phone}</span></span>
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><MapPin className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{c.country}</span></span>
                        <span className="inline-flex items-center gap-1.5"><Calendar className={`h-3 w-3 ${t.soft}`} /><span className="font-medium">{fmtDate(c.createdAt)}</span></span>
                      </div>
                    </div>
                  </button>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[52px] sm:pl-0">
                  {tab === "active" ? (
                    <>
                      <OutcomeChip value={c.lastStatus} />
                      <AssigneePicker
                        t={t}
                        employees={employees}
                        value={c.assignedToId}
                        onChange={(employeeId) => onAssign(c.id, employeeId)}
                        busy={busy}
                      />
                      <StatusControl t={t} value={st} onChange={(s) => onSetStatus(c.id, s)} />
                      <button onClick={() => onDelete(c.id)} aria-label="Delete message" title="Delete message" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onRestore(c.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white">
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                      <button onClick={() => onPurge(c.id)} aria-label="Delete forever" title="Delete forever" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty t={t} label={tab === "trash" ? "Nothing in Recently Deleted. Deleted messages land here and can be restored any time." : "No messages found."} pad />
      )}
    </div>
  );
}

// Contact message detail modal — name, email, optional product, full message.
function ContactModal({ contact, deleted, onClose, onDelete, onRestore, onSetStatus, t }: { contact: ContactMessage; deleted: boolean; onClose: () => void; onDelete: () => void; onRestore: () => void; onSetStatus: (s: Status) => void; t: Theme }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 sm:max-h-[88dvh] ${t.modal}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
          <p className="text-sm font-semibold">Contact message</p>
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand-dark`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${t.thumb} ${t.soft}`}>
              <MessageSquare className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className={`text-lg font-semibold leading-snug ${t.strong}`}>{contactName(contact)}</h3>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[asStatus(contact.status)].chip}`}>{STATUS_META[asStatus(contact.status)].label}</span>
            </div>
          </div>

          {/* Two up, and the values outrank their labels — the same treatment
              the inquiry drawer got. Passing t.soft over the whole list greyed
              the email and phone to match their own captions. */}
          <dl className="mt-5 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Row t={t} icon={Mail} label="Email" value={contact.email} />
            {contact.companyName && <Row t={t} icon={Package} label="Company" value={contact.companyName} />}
            <Row t={t} icon={MapPin} label="Country" value={contact.country} />
            <Row t={t} icon={Phone} label="Phone" value={contact.phone} />
            <Row t={t} icon={Calendar} label="Received" value={fmtDateTime(contact.createdAt)} />
          </dl>

          <div className={`mt-4 rounded-xl p-3 ${t.thumb}`}>
            <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Message</p>
            <p className={`whitespace-pre-wrap text-sm font-medium leading-relaxed ${t.strong}`}>{contact.message}</p>
          </div>

          {!deleted && (
            <div className="mt-5">
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Mark this message</p>
              <StatusControl t={t} value={asStatus(contact.status)} onChange={onSetStatus} big />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"><Mail className="h-3.5 w-3.5" /> Reply by email</a>
            {deleted ? (
              <button onClick={onRestore} className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white">
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
            ) : (
              <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Segmented New / Handled / Spam control. `stopPropagation` so clicking a
// status inside a clickable row doesn't also open the detail modal.
function StatusControl({ value, onChange, t, big }: { value: Status; onChange: (s: Status) => void; t: Theme; big?: boolean }) {
  const pad = big ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-[11px]";
  return (
    <div className={`inline-flex rounded-full p-0.5 ${t.thumb}`} onClick={(e) => e.stopPropagation()}>
      {(["new", "handled", "spam"] as Status[]).map((s) => (
        <button
          key={s}
          onClick={(e) => { e.stopPropagation(); onChange(s); }}
          className={`rounded-full font-bold transition-colors ${pad} ${value === s ? STATUS_META[s].chip : `${t.soft} hover:opacity-80`}`}
        >
          {STATUS_META[s].label}
        </button>
      ))}
    </div>
  );
}

function Row({ icon: Icon, label, value, t }: { icon: LucideIcon; label: string; value: string; t?: Theme }) {
  return (
    // items-start, because a long value now wraps to a second line and the
    // icon and label belong beside its first, not floating at its middle.
    <div className="flex items-start gap-2">
      <Icon className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${t?.soft ?? ""}`} />
      <span className={`mt-px w-[70px] shrink-0 text-xs uppercase tracking-wide ${t ? t.soft : "opacity-70"}`}>{label}</span>
      {/* The value is the point of the row and outranks its label: semibold
          and full-contrast, against a muted icon and caption.

          break-words is load-bearing. min-w-0 lets the flex item shrink below
          its content, but an unbroken string like an email address still
          paints straight out of the box — which is exactly what it did once
          these rows were laid out two to a line: vasimbpharm@gmail.com ran
          over the top of the COUNTRY label next to it. */}
      <span className={`min-w-0 flex-1 break-words font-semibold leading-snug ${t?.strong ?? ""}`}>{value}</span>
    </div>
  );
}


function Thumb({ src, alt, big, t }: { src: string | null; alt: string; big?: boolean; t: Theme }) {
  const s = big ? "h-14 w-14" : "h-10 w-10";
  if (!src) return <div className={`${s} flex shrink-0 items-center justify-center rounded-xl text-[10px] ${t.thumb} ${t.soft}`}>No img</div>;
  return (
    <div className={`${s} relative shrink-0 overflow-hidden rounded-xl ${t.thumb}`}>
      <Image src={getCdnUrl(src, 128) as string} alt={alt} fill sizes="56px" className="object-cover" />
    </div>
  );
}

function Panel({ title, onView, children, t }: { title: string; onView: () => void; children: React.ReactNode; t: Theme }) {
  return (
    <div className={`rounded-2xl shadow-sm ring-1 ${t.card}`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <button onClick={onView} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:opacity-80">View all <ChevronRight size={14} /></button>
      </div>
      <div className={`divide-y px-5 ${t.divide}`}>{children}</div>
    </div>
  );
}

function Empty({ label, pad, t }: { label: string; pad?: boolean; t: Theme }) {
  return <div className={`text-center text-sm ${t.soft} ${pad ? "px-6 py-16" : "py-10"}`}>{label}</div>;
}

// One de-duplicated customer, with an expandable list of every product they
// inquired about. This is the on-screen version of the "Group by customer"
// view; the Excel version comes from /api/admin/export/all?only=customers.
/**
 * One de-duplicated customer, as a row that can be acted on.
 *
 * The grouping has always been able to SHOW that four inquiries are one
 * person; what it could not do was treat them as one. Everything on the right
 * of this row now does: assigning hands over every product they asked about in
 * a single action, the outcome chip is the newest one across those products,
 * and the tick box selects the lot. That is the difference between a reading
 * view and the way the office actually works — nobody gives Karan three of a
 * customer's four products.
 *
 * Where the products disagree — two assigned to Karan, one to nobody — the row
 * says "Mixed" rather than choosing a winner to display, and the lines inside
 * name who has each.
 */
function CustomerGroupRow({
  g, t, employees, selected, onToggleSelect, onAssign, onOpenInquiry, busy = false, code,
}: {
  g: CustomerGroup;
  t: Theme;
  /** Their AFFHAN number, when one has been issued. */
  code?: string;
  employees: EmployeeOption[];
  /** True when every one of this customer's inquiries is ticked. */
  selected: boolean;
  onToggleSelect: () => void;
  /** Hands over every inquiry behind this customer at once. */
  onAssign: (employeeId: string | null) => void;
  onOpenInquiry?: (inquiryId: string) => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mixed = g.assignees.length > 1;
  const only = mixed ? null : g.assignees[0] ?? null;
  const assignedCount = g.products.filter((p) => p.assignedToId).length;
  const nameOf = (id: string | null | undefined) =>
    id ? employees.find((e) => e.id === id)?.name ?? "(inactive)" : "Unassigned";

  return (
    <li className={`transition-colors ${t.hover} ${selected ? "bg-brand/[0.05]" : ""}`}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button onClick={onToggleSelect} aria-label={`Select ${g.customerName}`} aria-pressed={selected} className={`shrink-0 transition-colors ${selected ? "text-brand" : `${t.soft} hover:text-brand`}`}>
            {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
          </button>
          {/* The whole block opens the customer, but it is no longer one big
              button: the ID badge inside it is a button too, and a button
              inside a button is invalid HTML that React refuses to hydrate.
              The name carries the click and stretches its hit area over the
              block with ::after — the pattern the staff table already uses —
              and the badge sits above it. */}
          <div className="relative flex min-w-0 flex-1 items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
              <Users className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              {/* The customer's name is what you are scanning for, so it wraps to a
                  second line on a phone rather than being cut mid-word. The other
                  names they have written in are demoted to their own line: they
                  were what pushed the real name out of view. */}
              {/* The number sits with the name, not in a column of its own:
                  it is how you refer to this person, so it belongs where you
                  read who they are. */}
              <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold leading-snug sm:text-[13.5px] ${t.strong}`}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  className="line-clamp-2 break-words text-left after:absolute after:inset-0 after:content-[''] sm:line-clamp-1"
                >
                  {g.customerName}
                </button>
                {code && (
                  <span className="relative">
                    <CustomerCodeBadge code={code} chip={t.chip} />
                  </span>
                )}
              </p>
              {g.altNames.length > 0 && (
                <p className={`truncate text-[11.5px] font-normal leading-snug ${t.soft}`}>aka {g.altNames.join(", ")}</p>
              )}
              <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${t.mid}`}>
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Phone className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium tabular-nums">{g.phone}</span></span>
                {g.email && <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Mail className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{g.email}</span></span>}
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><MapPin className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{g.country}</span></span>
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Calendar className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">Last {fmtDate(g.lastInquiry)}</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[52px] sm:pl-0">
          <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${t.qty}`}>{g.inquiryCount} {g.inquiryCount === 1 ? "product" : "products"}</span>
          <OutcomeChip value={g.lastStatus} />
          <AssigneePicker
            t={t}
            employees={employees}
            value={only}
            mixed={mixed}
            label={mixed ? `Mixed · ${assignedCount}/${g.inquiryCount}` : undefined}
            title={
              mixed
                ? `Their products are with different people. Choosing somebody assigns all ${g.inquiryCount}.`
                : only
                  ? `All ${g.inquiryCount} assigned to ${nameOf(only)}`
                  : `Assign all ${g.inquiryCount} of their products at once`
            }
            onChange={onAssign}
            busy={busy}
          />
          <a href={waLink(g.phone)} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white sm:inline-flex">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide their products" : "Show their products"} aria-expanded={open} className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.hover} ${t.soft}`}>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className={`border-t px-4 pb-3 pt-3 ${t.border}`}>
          {/* Said once, at the top, because everything below belongs to the
              same person — the ungrouped list repeats it on every row. */}
          <dl className={`mb-3 grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3 ${t.mid}`}>
            {code && (
              <div className="flex min-w-0 items-start gap-2">
                <dt className={`w-[92px] shrink-0 text-[11px] uppercase tracking-wide ${t.soft}`}>Customer ID</dt>
                <dd className="min-w-0">
                  <CustomerCodeBadge code={code} chip={t.chip} size="md" />
                </dd>
              </div>
            )}
            <GroupFact t={t} label="Company" value={g.companyName || "—"} />
            <GroupFact t={t} label="Email" value={[g.email, ...g.altEmails].filter(Boolean).join(", ") || "—"} />
            <GroupFact t={t} label="Country" value={g.country || "—"} />
            <GroupFact t={t} label="First inquiry" value={fmtDate(g.firstInquiry)} />
            <GroupFact t={t} label="Latest" value={fmtDate(g.lastInquiry)} />
            <GroupFact t={t} label="Total quantity" value={g.totalQuantity.toLocaleString("en-GB")} />
          </dl>
          <ul>
            {g.products.map((p, idx) => {
              // A grouped line is an inquiry like any other, so it opens the same
              // drawer the ungrouped list does rather than being a dead label.
              // Only when the id survived the grouping — the export path has none.
              const openable = Boolean(p.inquiryId && onOpenInquiry);
              const Row = openable ? "button" : "div";
              return (
                <li key={p.inquiryId ?? idx} className={idx > 0 ? `border-t ${t.divide}` : ""}>
                  <Row
                    {...(openable
                      ? { onClick: () => onOpenInquiry!(p.inquiryId!), type: "button" as const }
                      : {})}
                    className={`flex w-full items-start gap-3 py-2.5 text-left text-sm ${
                      openable ? `rounded-lg transition-colors ${t.hover} cursor-pointer` : ""
                    }`}
                  >
                    <Thumb t={t} src={p.productImage ?? null} alt={p.productName} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium">{p.productName}</span>
                      {/* What they wrote with it: the one thing the grouped
                          view used to drop, and the thing that says what they
                          actually want. */}
                      {p.message && <span className={`mt-0.5 line-clamp-2 text-xs ${t.mid}`}>{p.message}</span>}
                      <span className={`mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs ${t.soft}`}>
                        <span>{fmtDate(p.createdAt)}</span>
                        {mixed && <span className="font-semibold">{nameOf(p.assignedToId)}</span>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <OutcomeChip value={p.lastStatus ?? null} />
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>Qty {p.quantity}</span>
                    </span>
                  </Row>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

/** One labelled fact in a grouped customer's header. */
function GroupFact({ t, label, value }: { t: Theme; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <dt className={`w-[92px] shrink-0 text-[11px] uppercase tracking-wide ${t.soft}`}>{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}

// The "All" landing view: master export + a manual CHECKLIST of every customer
// (deduped by phone, all products shown) that can be ticked and exported to a
// clean .xlsx — same header-band structure as the master workbook.
function AllSection({
  t, stats, groups, onGoInquiries, onGoContacts, onOpenInquiry,
}: {
  t: Theme;
  stats: { inquiries: number; contacts: number; customers: number };
  groups: CustomerGroup[];
  onGoInquiries: () => void; onGoContacts: () => void;
  /** Opens the drawer for one of a customer's products. */
  onOpenInquiry?: (inquiryId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) =>
      `${g.customerName} ${g.altNames.join(" ")} ${g.email ?? ""} ${g.phone} ${g.country} ${g.companyName ?? ""} ${g.products.map((p) => p.productName).join(" ")}`
        .toLowerCase().includes(term)
    );
  }, [groups, q]);

  const visibleKeys = filtered.map((g) => g.key);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const toggle = (key: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleKeys));
  const toggleExpand = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // Export the ticked customers (or everything visible if none ticked) to .xlsx,
  // reusing the exact shared builder so it matches the master workbook.
  const exportSelected = async () => {
    setBusy(true);
    try {
      const chosen = selected.size > 0 ? groups.filter((g) => selected.has(g.key)) : filtered;
      const XLSX = await import("xlsx");
      const { aoa, cols, textCols } = buildCustomerSheet(chosen);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let r = 1; r < aoa.length; r++) {
        for (const c of textCols) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (cell) { cell.t = "s"; cell.z = "@"; cell.v = String(cell.v ?? ""); }
        }
      }
      ws["!cols"] = cols;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      XLSX.writeFile(wb, `customers-${selected.size > 0 ? "selected" : "all"}-${new Date().toISOString().split("T")[0]}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  const selectedProductCount = groups
    .filter((g) => selected.size === 0 || selected.has(g.key))
    .reduce((n, g) => n + g.products.length, 0);

  const tiles = [
    { label: "Inquiries", value: stats.inquiries, hint: "Product quote requests", icon: Inbox, go: onGoInquiries },
    { label: "Contact Us", value: stats.contacts, hint: "Contact-form messages", icon: MessageSquare, go: onGoContacts },
    { label: "Customers", value: stats.customers, hint: "Unique, deduped by phone", icon: Users, go: onGoInquiries },
  ];

  return (
    <div className="space-y-5">
      {/* Master export card */}
      <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${t.card}`}>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Master Excel export</h2>
            <p className={`mt-0.5 text-sm ${t.soft}`}>
              One workbook, three sheets: <span className="font-semibold">Customers</span> (deduped by phone, every product each customer asked for), <span className="font-semibold">Inquiries</span> and <span className="font-semibold">Contact Us</span> — over the whole database.
            </p>
          </div>
          <a href="/api/admin/export/all/" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
            <Download size={16} /> Download master .xlsx
          </a>
        </div>
      </div>

      {/* Per-source tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <button key={tile.label} onClick={tile.go} className={`rounded-2xl p-5 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${t.card}`}>
            <div className="flex items-center justify-between">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}><tile.icon className="h-[18px] w-[18px]" /></span>
              <ChevronRight className={`h-4 w-4 ${t.soft}`} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{fmtNum(tile.value)}</p>
            <p className="text-sm font-medium">{tile.label}</p>
            <p className={`text-xs ${t.soft}`}>{tile.hint}</p>
          </button>
        ))}
      </div>

      {/* Customer checklist — tick customers, then export just those to .xlsx. */}
      <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${t.card}`}>
        <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center ${t.border}`}>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Customers — pick & export</h2>
            <p className={`text-xs ${t.soft}`}>{groups.length} customers · every product shown · tick the ones you want</p>
          </div>
          <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${t.soft}`} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, email, product…"
              className={`h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`}
            />
          </div>
          <button
            onClick={exportSelected}
            disabled={busy}
            title={selected.size > 0 ? `Export ${selected.size} selected customers` : "Export all shown customers"}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Export {selected.size > 0 ? `(${selected.size})` : "all"} .xlsx
          </button>
        </div>

        {/* Select-all bar */}
        <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
          <button onClick={toggleAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand-dark" : `${t.soft} hover:text-brand-deep`}`}>
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {allSelected ? "Clear selection" : "Select all"}
          </button>
          <span className={`text-[13px] ${t.soft}`}>
            {selected.size > 0 ? `${selected.size} selected · ${selectedProductCount} products` : `${selectedProductCount} products total`}
          </span>
        </div>

        {filtered.length ? (
          <ul className={`divide-y ${t.divide}`}>
            {filtered.map((g) => {
              const sel = selected.has(g.key);
              const open = expanded.has(g.key);
              return (
                <li key={g.key} className={`transition-colors ${sel ? "bg-brand/[0.05]" : t.hover}`}>
                  <div className="flex items-start gap-3 p-4">
                    <button onClick={() => toggle(g.key)} aria-label="Select customer" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                      {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                    <button onClick={() => toggleExpand(g.key)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
                        <Users className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`line-clamp-2 break-words text-[14px] font-semibold leading-snug sm:line-clamp-1 sm:text-[13.5px] ${t.strong}`}>
                          {g.customerName}
                        </p>
                        {g.altNames.length > 0 && (
                          <p className={`truncate text-[11.5px] font-normal leading-snug ${t.soft}`}>aka {g.altNames.join(", ")}</p>
                        )}
                        <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${t.mid}`}>
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Phone className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium tabular-nums">{g.phone}</span></span>
                          {g.email && <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Mail className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{g.email}</span></span>}
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><MapPin className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">{g.country}</span></span>
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${t.qty}`}>{g.inquiryCount} {g.inquiryCount === 1 ? "product" : "products"}</span>
                      <button onClick={() => toggleExpand(g.key)} aria-label="Show products">
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.soft}`} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <ul className={`border-t px-4 pb-3 pt-1 ${t.border}`}>
                      {g.products.map((p, idx) => {
                        // Same treatment the grouped inquiry list got: the
                        // picture identifies the item where a truncated CJ
                        // product name mostly does not, and the row opens the
                        // inquiry it came from rather than being a dead label.
                        const openable = Boolean(p.inquiryId && onOpenInquiry);
                        const Row = openable ? "button" : "div";
                        return (
                          <li key={p.inquiryId ?? idx} className={idx > 0 ? `border-t ${t.divide}` : ""}>
                            <Row
                              {...(openable
                                ? { onClick: () => onOpenInquiry!(p.inquiryId!), type: "button" as const }
                                : {})}
                              className={`flex w-full items-center gap-3 py-2 text-left text-sm ${
                                openable ? `rounded-lg transition-colors ${t.hover} cursor-pointer` : ""
                              }`}
                            >
                              <span className={`w-5 shrink-0 text-center text-[11px] font-bold tabular-nums ${t.soft}`}>{idx + 1}</span>
                              <Thumb t={t} src={p.productImage ?? null} alt={p.productName} />
                              <span className="min-w-0 flex-1">
                                <span className={`line-clamp-2 font-medium ${t.strong}`}>{p.productName}</span>
                                <span className={`text-xs ${t.soft}`}>{fmtDate(p.createdAt)}</span>
                              </span>
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>Qty {p.quantity}</span>
                            </Row>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty t={t} label="No customers match your search." pad />
        )}
      </div>
    </div>
  );
}


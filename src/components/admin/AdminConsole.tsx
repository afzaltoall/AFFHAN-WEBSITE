"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Inbox, Users, LogOut, RefreshCw, Download, Search, Phone, Mail,
  MapPin, MessageCircle, PhoneCall, Package, Layers, ChevronRight, Sun, Moon, X,
  Trash2, ZoomIn, Loader2, RotateCcw, AlertTriangle, Check, CheckSquare, Square, KeyRound,
  MessageSquare, Calendar, Briefcase, LayoutList, FileSpreadsheet, FileText, ChevronDown, Menu, PlayCircle, Smartphone, Globe, SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { groupCustomers, buildCustomerSheet, type CustomerGroup } from "@/lib/customerGroups";

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
}

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
 * actually happens here. The admin session ends when the page is reloaded or
 * the tab is closed, by design, but the console that is already on screen
 * carries on looking signed in; the next save then 401s and the admin is told
 * to retry something that cannot succeed until they log in again.
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
    window.alert("Your admin session has ended — signing in again will restore it.\n\n(The session closes when the page is reloaded or the tab is closed.)");
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
}
const contactName = (c: ContactMessage) => c.fullName.trim();

interface JobAlert {
  id: string; createdAt: string; email: string; status: string;
}

type Status = "new" | "handled" | "spam";
const STATUS_META: Record<Status, { label: string; dot: string; text: string; chip: string }> = {
  new: { label: "New", dot: "bg-sky-500", text: "text-sky-600", chip: "bg-sky-500/10 text-sky-600" },
  handled: { label: "Handled", dot: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-500/10 text-emerald-600" },
  spam: { label: "Spam", dot: "bg-red-500", text: "text-red-600", chip: "bg-red-500/10 text-red-600" },
};
const asStatus = (s: string): Status => (s === "handled" || s === "spam" ? s : "new");

// Light/dark class-name bundle threaded through every panel/dialog below —
// built once from the `dark` toggle (see the `t` definition further down).
interface Theme {
  page: string; sidebar: string; card: string; soft: string; strong: string;
  /**
   * Between `soft` and `strong`. Row metadata — a customer's name, phone,
   * email — is not a caption; it is the content people scan a list for. At
   * #86868b it washed out against white and every list read as greyed-out
   * placeholder text.
   */
  mid: string;
  border: string; divide: string; hover: string; navIdle: string; navActive: string;
  input: string; chip: string; pill: string; thumb: string; qty: string;
  overlay: string; modal: string;
}
interface Props {
  data: {
    adminName: string; adminEmail: string; adminImage: string | null;
    stats: { products: number; categories: number; categoriesTotal: number; inquiries: number; contacts: number; jobAlerts: number; suppliers: number; videos: number };
    inquiries: Inquiry[]; deletedInquiries: Inquiry[];
    contacts: ContactMessage[]; deletedContacts: ContactMessage[];
    jobAlerts: JobAlert[]; deletedJobAlerts: JobAlert[];
  };
}

const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
const sfFont = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' } as const;

type View = "all" | "inquiries" | "trash" | "contacts" | "careers";

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
  const [refreshing, setRefreshing] = useState(false);
  const [dark, setDark] = useState(false);
  const [activeInquiry, setActiveInquiry] = useState<Inquiry | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  // Local copy so the checklist toggle / delete reflect instantly, re-synced
  // whenever the server sends fresh data (refresh).
  const [items, setItems] = useState<Inquiry[]>(data.inquiries);
  const [deletedItems, setDeletedItems] = useState<Inquiry[]>(data.deletedInquiries);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  // The mobile navigation drawer. Below lg there is no sidebar, and the nav
  // used to be seven pills wrapping onto three rows above the content — a
  // third of a phone screen spent on navigation before anything was read.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setItems(data.inquiries), [data.inquiries]);
  useEffect(() => setDeletedItems(data.deletedInquiries), [data.deletedInquiries]);
  // Clear the multi-select whenever the user switches views/filters.
  useEffect(() => setSelected(new Set()), [view, statusFilter, customerStageFilter, q]);

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
  const [contactTab, setContactTab] = useState<"active" | "trash">("active");
  const [contactSelected, setContactSelected] = useState<Set<string>>(new Set());
  const [contactBusy, setContactBusy] = useState(false);
  const [activeContact, setActiveContact] = useState<ContactMessage | null>(null);
  useEffect(() => setContactItems(data.contacts), [data.contacts]);
  useEffect(() => setContactDeleted(data.deletedContacts), [data.deletedContacts]);
  useEffect(() => setContactSelected(new Set()), [contactTab, contactStatusFilter, contactQ, view]);

  // --- Careers (job-alert subscriptions) -------------------------------------
  const [careerItems, setCareerItems] = useState<JobAlert[]>(data.jobAlerts);
  const [careerDeleted, setCareerDeleted] = useState<JobAlert[]>(data.deletedJobAlerts);
  const [careerQ, setCareerQ] = useState("");
  const [careerStatusFilter, setCareerStatusFilter] = useState<"all" | Status>("all");
  const [careerTab, setCareerTab] = useState<"active" | "trash">("active");
  const [careerSelected, setCareerSelected] = useState<Set<string>>(new Set());
  const [careerBusy, setCareerBusy] = useState(false);
  useEffect(() => setCareerItems(data.jobAlerts), [data.jobAlerts]);
  useEffect(() => setCareerDeleted(data.deletedJobAlerts), [data.deletedJobAlerts]);
  useEffect(() => setCareerSelected(new Set()), [careerTab, careerStatusFilter, careerQ, view]);

  // Whether the Inquiries list is collapsed to one row per customer (deduped by
  // phone) instead of one row per product.
  const [groupByCustomer, setGroupByCustomer] = useState(false);

  const careerBulkAction = async (
    ids: string[],
    action: "delete" | "restore" | "purge" | "status",
    newStatus?: Status,
  ) => {
    if (ids.length === 0) return;
    const idset = new Set(ids);
    const prevA = careerItems, prevD = careerDeleted;
    if (action === "delete") {
      const moving = careerItems.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "deleted" }));
      setCareerItems(careerItems.filter((x) => !idset.has(x.id)));
      setCareerDeleted([...moving, ...careerDeleted]);
    } else if (action === "restore") {
      const moving = careerDeleted.filter((x) => idset.has(x.id)).map((x) => ({ ...x, status: "new" }));
      setCareerDeleted(careerDeleted.filter((x) => !idset.has(x.id)));
      setCareerItems([...moving, ...careerItems]);
    } else if (action === "purge") {
      setCareerDeleted(careerDeleted.filter((x) => !idset.has(x.id)));
    } else if (action === "status" && newStatus) {
      setCareerItems(careerItems.map((x) => (idset.has(x.id) ? { ...x, status: newStatus } : x)));
    }
    setCareerSelected(new Set());
    setCareerBusy(true);
    try {
      await adminWrite(`/api/admin/careers/`, { ids, action, status: newStatus });
    } catch (e) {
      setCareerItems(prevA); setCareerDeleted(prevD);
      window.alert(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setCareerBusy(false);
    }
  };

  const toggleCareerSelect = (id: string) =>
    setCareerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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

  const toggleContactSelect = (id: string) =>
    setContactSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  const refresh = () => { setRefreshing(true); router.refresh(); setTimeout(() => setRefreshing(false), 700); };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login/");
    router.refresh();
  };

  // Apple-clean in both modes: soft light greys, or a deep graphite dark.
  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", sidebar: "bg-[#151517]/90 border-white/10",
        card: "bg-[#151517] ring-white/[0.08]", soft: "text-[#8a8a8e]", mid: "text-[#c7c7cc]", strong: "text-white",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]", hover: "hover:bg-white/[0.03]",
        navIdle: "text-[#a1a1a6] hover:bg-white/[0.05]", navActive: "bg-white/[0.1] text-white",
        input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]", chip: "bg-white/[0.08] text-[#a1a1a6]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]", thumb: "bg-white/[0.05]",
        qty: "bg-brand/25 text-[#7fd8ea]", overlay: "bg-black/70", modal: "bg-[#151517] text-[#f2f2f4] ring-white/[0.1]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", sidebar: "bg-white/80 border-black/[0.06]",
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
      (!q || `${i.customerName} ${i.productName} ${i.country} ${i.email ?? ""} ${i.phone}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [items, q, statusFilter, customerStageFilter]
  );
  const statusCounts = useMemo(() => {
    const c = { all: items.length, new: 0, handled: 0, spam: 0 };
    items.forEach((i) => { c[asStatus(i.status)]++; });
    return c;
  }, [items]);

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
    if (q.trim()) parts.push(`search: “${q.trim()}”`);
    return parts.join("  ·  ");
  }, [statusFilter, customerStageFilter, q, selected]);

  const customerStatusCounts = useMemo(() => {
    const c = { linked: 0, PENDING: 0, CHECKED: 0, IN_PROGRESS: 0, CUSTOM: 0 };
    items.forEach((i) => {
      if (!i.userId) return;
      c.linked++;
      c[asCustomerStatus(i.customerStatus)]++;
    });
    return c;
  }, [items]);
  const trashList = useMemo(
    () => deletedItems.filter((i) =>
      !q || `${i.customerName} ${i.productName} ${i.country} ${i.email ?? ""} ${i.phone}`.toLowerCase().includes(q.toLowerCase())
    ),
    [deletedItems, q]
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
  const contactActive = useMemo(
    () => contactItems.filter((c) =>
      (contactStatusFilter === "all" || asStatus(c.status) === contactStatusFilter) && contactMatch(c, contactQ)
    ),
    [contactItems, contactQ, contactStatusFilter]
  );
  const contactTrash = useMemo(
    () => contactDeleted.filter((c) => contactMatch(c, contactQ)),
    [contactDeleted, contactQ]
  );
  const contactStatusCounts = useMemo(() => {
    const c = { all: contactItems.length, new: 0, handled: 0, spam: 0 };
    contactItems.forEach((m) => { c[asStatus(m.status)]++; });
    return c;
  }, [contactItems]);
  const contactList = contactTab === "trash" ? contactTrash : contactActive;
  const contactVisibleIds = contactList.map((c) => c.id);
  const contactAllSelected = contactVisibleIds.length > 0 && contactVisibleIds.every((id) => contactSelected.has(id));
  const toggleContactSelectAll = () =>
    setContactSelected(contactAllSelected ? new Set() : new Set(contactVisibleIds));
  const newContactCount = contactStatusCounts.new;

  // --- Derived careers lists -------------------------------------------------
  const careerMatch = (j: JobAlert, term: string) => !term || j.email.toLowerCase().includes(term.toLowerCase());
  const careerActive = useMemo(
    () => careerItems.filter((j) =>
      (careerStatusFilter === "all" || asStatus(j.status) === careerStatusFilter) && careerMatch(j, careerQ)
    ),
    [careerItems, careerQ, careerStatusFilter]
  );
  const careerTrash = useMemo(() => careerDeleted.filter((j) => careerMatch(j, careerQ)), [careerDeleted, careerQ]);
  const careerStatusCounts = useMemo(() => {
    const c = { all: careerItems.length, new: 0, handled: 0, spam: 0 };
    careerItems.forEach((j) => { c[asStatus(j.status)]++; });
    return c;
  }, [careerItems]);
  const careerList = careerTab === "trash" ? careerTrash : careerActive;
  const careerVisibleIds = careerList.map((j) => j.id);
  const careerAllSelected = careerVisibleIds.length > 0 && careerVisibleIds.every((id) => careerSelected.has(id));
  const toggleCareerSelectAll = () =>
    setCareerSelected(careerAllSelected ? new Set() : new Set(careerVisibleIds));

  // Deduplicated customers (by phone) from the currently-filtered inquiries —
  // powers the "Group by customer" view. Note this groups the loaded page; the
  // master/grouped Excel exports run server-side over the whole database.
  const customerGroups = useMemo<CustomerGroup[]>(() => groupCustomers(inquiries), [inquiries]);
  // Every customer (unfiltered) — powers the "All" view checklist + selected export.
  const allCustomerGroups = useMemo<CustomerGroup[]>(() => groupCustomers(items), [items]);

  // Export careers list to .xlsx (respects current tab, search, selection).
  const exportCareers = async () => {
    const XLSX = await import("xlsx");
    const base = careerList;
    const src = careerSelected.size > 0 ? base.filter((j) => careerSelected.has(j.id)) : base;
    const headers = ["Date", "Email", "Status"];
    const rows: (string | number)[][] = src.map((j) => [fmtDate(j.createdAt), j.email, asStatus(j.status)]);
    const file = careerTab === "trash" ? "job-alerts-deleted" : "job-alerts";
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, file.slice(0, 31));
    XLSX.writeFile(wb, `${file}-${new Date().toISOString().split("T")[0]}.xlsx`);
  };
  const newCareerCount = careerStatusCounts.new;

  // Export contacts to .xlsx (respects current tab, search, and any selection).
  const exportContacts = async () => {
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
  const newTotal = statusCounts.new + newContactCount + newCareerCount;

  const nav: { key: View; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "all", label: "All", icon: LayoutList },
    { key: "inquiries", label: "Inquiries", icon: Inbox, count: statusCounts.new },
    { key: "contacts", label: "Contact Us", icon: MessageSquare, count: newContactCount },
    { key: "careers", label: "Careers", icon: Briefcase, count: newCareerCount },
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
    { label: "Careers", value: data.stats.jobAlerts, icon: Briefcase, tint: "text-rose-500", bg: dark ? "bg-rose-500/15" : "bg-rose-50" },
    { label: "Suppliers", value: data.stats.suppliers, hint: "From the WeChat book", icon: Users, tint: "text-teal-500", bg: dark ? "bg-teal-500/15" : "bg-teal-50" },
    { label: "Videos", value: data.stats.videos, icon: PlayCircle, tint: "text-fuchsia-500", bg: dark ? "bg-fuchsia-500/15" : "bg-fuchsia-50" },
  ];

  return (
    <div style={sfFont} className={`min-h-screen w-full antialiased transition-colors duration-200 ${t.page}`}>
      {/* The printable sheet. Hidden on screen, and the only thing on the page
          when printing — see InquirySheet for why this beats generating a PDF
          in JavaScript. */}
      <InquirySheet rows={printRows} filterLabel={printFilterLabel} />

      <div className="flex print:hidden">
        {/* Sidebar */}
        <aside className={`sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r backdrop-blur-xl lg:flex ${t.sidebar}`}>
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.thumb}`}>
              <Image src="/logo.png" alt="Affhan" width={22} height={22} className="object-contain" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Affhan</p>
              <p className={`text-[11px] ${t.soft}`}>Admin</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => { setView(n.key); setQ(""); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${view === n.key ? t.navActive : t.navIdle}`}
              >
                <n.icon size={17} className={view === n.key ? "text-brand" : t.soft} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtNum(n.count)}</span>}
              </button>
            ))}
            {/* A link rather than a view: the supplier book is its own route, so
                it survives a reload and can be opened in its own tab, which is
                how it actually gets used — open beside a chat window. */}
            <Link
              href="/admin/suppliers/"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${t.navIdle}`}
            >
              <Users size={17} className={t.soft} />
              <span className="flex-1 text-left">Suppliers</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtNum(data.stats.suppliers)}</span>
            </Link>
            <Link
              href="/admin/videos/"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${t.navIdle}`}
            >
              <PlayCircle size={17} className={t.soft} />
              <span className="flex-1 text-left">Videos</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtNum(data.stats.videos)}</span>
            </Link>
            {/* Two lists, because the office asks two different questions:
                who signs in on the site, and who signs in on the app. One
                table underneath — somebody who uses both appears on both,
                which is the honest answer rather than a duplicate. */}
            <Link
              href="/admin/users/website/"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${t.navIdle}`}
            >
              <Globe size={17} className={t.soft} />
              <span className="flex-1 text-left">Website Users</span>
            </Link>
            <Link
              href="/admin/users/app/"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${t.navIdle}`}
            >
              <Smartphone size={17} className={t.soft} />
              <span className="flex-1 text-left">App Users</span>
            </Link>
            <Link
              href="/admin/mobile-inquiries/"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${t.navIdle}`}
            >
              <MessageSquare size={17} className={t.soft} />
              <span className="flex-1 text-left">App Inquiries</span>
            </Link>
          </nav>
          <div className={`border-t p-3 ${t.border}`}>
            <div className="flex items-center gap-2.5 px-2 py-2">
              {data.adminImage ? (
                <Avatar name={data.adminName} image={data.adminImage} size={32} />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10">
                  <Image src="/logo.png" alt="Affhan" width={26} height={26} className="object-contain" />
                </span>
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-semibold">{data.adminName}</p>
                <p className={`text-[11px] ${t.soft}`}>Administrator</p>
              </div>
            </div>
            <button onClick={() => setShowEmail(true)} className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
              <Mail size={15} /> Change email
            </button>
            <button onClick={() => setShowPwd(true)} className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
              <KeyRound size={15} /> Change password
            </button>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setDark((d) => !d)} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}>
                {dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? "Light" : "Dark"}
              </button>
              <button onClick={logout} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-5 pb-16 pt-6 sm:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {view === "all" ? "All" : view === "inquiries" ? "Inquiries" : view === "contacts" ? "Contact Us" : view === "careers" ? "Careers" : "Recently Deleted"}
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
                  <span className="ml-0.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{fmtNum(newTotal)}</span>
                )}
              </button>
              {/* Dark toggle lives in the sidebar on desktop — only expose it in
                  the top bar on mobile (where there is no sidebar). */}
              <button onClick={() => setDark((d) => !d)} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold shadow-sm ring-1 transition-colors lg:hidden ${t.pill}`}>
                {dark ? <Sun size={15} /> : <Moon size={15} />}<span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span>
              </button>
              <button onClick={refresh} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-semibold shadow-sm ring-1 transition-colors ${t.pill}`}>
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
                onClick={() => { if (s.label === "Inquiries") setView("inquiries"); else if (s.label === "Messages") setView("contacts"); else if (s.label === "Careers") setView("careers"); else if (s.label === "Suppliers") router.push("/admin/suppliers/"); else if (s.label === "Videos") router.push("/admin/videos/"); }}
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
                      <p className={`line-clamp-1 text-[13px] font-semibold hover:text-brand ${asStatus(i.status) !== "new" ? "line-through opacity-60" : ""}`}>{i.productName}</p>
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
                      <p className={`line-clamp-1 text-[13px] font-semibold hover:text-brand ${asStatus(c.status) !== "new" ? "opacity-60" : ""}`}>{c.fullName} <span className="font-normal text-slate-500 ml-1">{c.companyName ? `(${c.companyName})` : ""}</span></p>
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
                stats={{ inquiries: data.stats.inquiries, contacts: data.stats.contacts, jobAlerts: data.stats.jobAlerts, customers: allCustomerGroups.length }}
                groups={allCustomerGroups}
                onGoInquiries={() => setView("inquiries")}
                onGoContacts={() => setView("contacts")}
                onGoCareers={() => setView("careers")}
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
              statusCounts={contactStatusCounts}
              list={contactList}
              selected={contactSelected}
              toggleSelect={toggleContactSelect}
              allSelected={contactAllSelected}
              toggleSelectAll={toggleContactSelectAll}
              busy={contactBusy}
              onOpen={setActiveContact}
              onExport={exportContacts}
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
          ) : view === "careers" ? (
            <CareersSection
              t={t}
              tab={careerTab}
              setTab={setCareerTab}
              q={careerQ}
              setQ={setCareerQ}
              statusFilter={careerStatusFilter}
              setStatusFilter={setCareerStatusFilter}
              statusCounts={careerStatusCounts}
              list={careerList}
              selected={careerSelected}
              toggleSelect={toggleCareerSelect}
              allSelected={careerAllSelected}
              toggleSelectAll={toggleCareerSelectAll}
              busy={careerBusy}
              onExport={exportCareers}
              onSetStatus={(id, s) => careerBulkAction([id], "status", s)}
              onDelete={(id) => setConfirm({
                title: "Move to Recently Deleted?",
                message: "This subscriber will be moved to Recently Deleted. You can restore them any time.",
                confirmLabel: "Delete",
                danger: true,
                onConfirm: () => careerBulkAction([id], "delete"),
              })}
              onRestore={(id) => careerBulkAction([id], "restore")}
              onPurge={(id) => setConfirm({
                title: "Permanently delete?",
                message: "This cannot be undone. It will be erased forever.",
                confirmLabel: "Delete forever",
                danger: true,
                onConfirm: () => careerBulkAction([id], "purge"),
              })}
              onStatusSelected={(s) => careerBulkAction([...careerSelected], "status", s)}
              onDeleteSelected={() => {
                const ids = [...careerSelected];
                setConfirm({
                  title: `Delete ${ids.length} ${ids.length === 1 ? "subscriber" : "subscribers"}?`,
                  message: "They'll be moved to Recently Deleted, where you can restore them any time.",
                  confirmLabel: `Delete ${ids.length}`,
                  danger: true,
                  onConfirm: () => careerBulkAction(ids, "delete"),
                });
              }}
              onRestoreSelected={() => careerBulkAction([...careerSelected], "restore")}
              onPurgeSelected={() => {
                const ids = [...careerSelected];
                setConfirm({
                  title: `Permanently delete ${ids.length}?`,
                  message: "This cannot be undone. These subscribers will be erased forever.",
                  confirmLabel: "Delete forever",
                  danger: true,
                  onConfirm: () => careerBulkAction(ids, "purge"),
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
                    extraActive={groupByCustomer}
                    summarySuffix={groupByCustomer ? " · grouped" : ""}
                    onClear={() => { setStatusFilter("all"); setGroupByCustomer(false); }}
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
                      <span className="font-bold">{customerStatusCounts.linked}</span> of {items.length} can see a status
                    </span>
                  )}
                </div>
              )}

              {/* Selection + bulk-action bar. Inquiries: set status / delete.
                  Recently Deleted: restore / delete forever. */}
              {(view === "inquiries" || view === "trash") && visibleIds.length > 0 && !(view === "inquiries" && groupByCustomer) && (
                <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
                  <button onClick={toggleSelectAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    {allSelected ? "Clear selection" : "Select all"}
                  </button>
                  {selected.size > 0 && (
                    <>
                      <span className={`text-[13px] font-semibold ${t.strong}`}>{selected.size} selected</span>
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
                  <div className={`flex items-center gap-2 border-b px-4 py-2.5 text-xs ${t.soft} ${t.border}`}>
                    <Users className="h-3.5 w-3.5" />
                    {customerGroups.length} unique {customerGroups.length === 1 ? "customer" : "customers"} · deduped by phone from the loaded inquiries. Use “Grouped .xlsx” for the full database.
                  </div>
                  {customerGroups.length ? (
                    <ul className={`divide-y ${t.divide}`}>
                      {customerGroups.map((g) => (
                        <CustomerGroupRow
                          key={g.key}
                          g={g}
                          t={t}
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
                              <p className={`line-clamp-2 text-[14px] font-semibold leading-snug hover:text-brand sm:text-[13.5px] ${st !== "new" ? `line-through ${t.soft}` : t.strong}`}>{i.productName}</p>
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
                              <p className="line-clamp-2 text-[13px] font-semibold leading-snug opacity-70 hover:text-brand">{i.productName}</p>
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
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand"><Mail className="h-4.5 w-4.5" /></span>
            <h3 className="text-lg font-semibold">Change email</h3>
          </div>
          <button onClick={onClose} className={`rounded-lg p-1 transition-opacity ${t.soft} hover:opacity-70`}><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckSquare className="h-6 w-6" /></span>
            <p className="text-sm font-medium">Email changed successfully.</p>
            <p className={`text-xs ${t.soft}`}>Use your new email to sign in next time.</p>
            <button onClick={() => window.location.reload()} className="mt-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark">Done</button>
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
              <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
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
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand"><KeyRound className="h-4.5 w-4.5" /></span>
            <h3 className="text-lg font-semibold">Change password</h3>
          </div>
          <button onClick={onClose} className={`rounded-lg p-1 transition-opacity ${t.soft} hover:opacity-70`}><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckSquare className="h-6 w-6" /></span>
            <p className="text-sm font-medium">Password changed successfully.</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark">Done</button>
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
              <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
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
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${state.danger ? "bg-red-500 hover:bg-red-600" : "bg-brand hover:bg-brand-dark"}`}
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
  const img = inquiry.productImage ? (getCdnUrl(inquiry.productImage) as string) : null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 sm:max-h-[88dvh] ${t.modal}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
          <p className="text-sm font-semibold">Ordered product</p>
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand`}>
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
                onClick={() => onZoom(img)}
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
              <a href={`tel:${inquiry.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"><PhoneCall className="h-3.5 w-3.5" /> Call</a>
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
          className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
 * Same tab deliberately: AdminAutoLogout ends the session when it unmounts,
 * so opening this in a second tab and closing it would sign the admin out.
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
              const src = i.productImage ? getCdnUrl(i.productImage) : null;
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

/**
 * One control holding every "what should this list show?" choice.
 *
 * Inquiries, Contact Us and Careers each had the same four status pills laid
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
  viewSection, extraActive = false, summarySuffix = "", onClear,
}: {
  t: Theme;
  statusFilter: "all" | Status;
  setStatusFilter: (v: "all" | Status) => void;
  statusCounts: { all: number; new: number; handled: number; spam: number };
  /** Optional rows under a "View" heading — grouping, on the inquiries list. */
  viewSection?: React.ReactNode;
  /** Whether anything in `viewSection` is currently on. */
  extraActive?: boolean;
  summarySuffix?: string;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = statusFilter !== "all" || extraActive;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative sm:ml-auto" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${active ? "bg-brand text-white ring-transparent" : t.pill}`}
      >
        <SlidersHorizontal size={15} />
        Filter
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white/25" : t.chip}`}>
          {statusFilter === "all" ? statusCounts.all : statusCounts[statusFilter]}
          {summarySuffix}
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className={`absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl p-1.5 shadow-xl ring-1 ${t.modal}`}>
          <p className={`px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>Status</p>
          {(["all", "new", "handled", "spam"] as const).map((s) => {
            const on = statusFilter === s;
            const n = s === "all" ? statusCounts.all : statusCounts[s as Status];
            return (
              <button
                key={s}
                role="menuitemradio"
                aria-checked={on}
                onClick={() => { setStatusFilter(s); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold capitalize transition-colors ${on ? "bg-brand/10 text-brand-dark" : `${t.hover} ${t.mid}`}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-brand" : s === "all" ? "bg-slate-300" : STATUS_META[s as Status].dot}`} />
                <span className="flex-1">{s}</span>
                <span className={`text-[12px] font-bold tabular-nums ${on ? "text-brand-dark" : t.soft}`}>{n}</span>
                {on && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}

          {viewSection && (
            <>
              <div className={`my-1.5 border-t ${t.border}`} />
              <p className={`px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>View</p>
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
        </div>
      )}
    </div>
  );
}

// Contact Us management: list of contact-form submissions with the same
// search / triage / soft-delete UX as inquiries, minus the product bits.
function ContactsSection({
  t, tab, setTab, q, setQ, statusFilter, setStatusFilter, statusCounts, list,
  selected, toggleSelect, allSelected, toggleSelectAll, busy, onOpen, onExport,
  onSetStatus, onDelete, onRestore, onPurge, onStatusSelected, onDeleteSelected,
  onRestoreSelected, onPurgeSelected,
}: {
  t: Theme; tab: "active" | "trash"; setTab: (v: "active" | "trash") => void;
  q: string; setQ: (v: string) => void;
  statusFilter: "all" | Status; setStatusFilter: (v: "all" | Status) => void;
  statusCounts: { all: number; new: number; handled: number; spam: number };
  list: ContactMessage[]; selected: Set<string>; toggleSelect: (id: string) => void;
  allSelected: boolean; toggleSelectAll: () => void; busy: boolean;
  onOpen: (c: ContactMessage) => void; onExport: () => void;
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
            onClear={() => setStatusFilter("all")}
          />
        )}
        <button onClick={onExport} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export all"} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-black ${tab === "active" ? "" : "sm:ml-auto"}`}>
          <Download size={15} /> Export{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {/* Selection + bulk-action bar. */}
      {showBulk && (
        <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
          <button onClick={toggleSelectAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand" : `${t.soft} hover:text-brand`}`}>
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
                      <p className={`line-clamp-1 text-[13.5px] font-semibold leading-snug hover:text-brand ${
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
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand`}>
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
            <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"><Mail className="h-3.5 w-3.5" /> Reply by email</a>
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

function Avatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <span className="flex items-center justify-center rounded-full bg-brand font-semibold uppercase text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name[0]}</span>;
}

function Thumb({ src, alt, big, t }: { src: string | null; alt: string; big?: boolean; t: Theme }) {
  const s = big ? "h-14 w-14" : "h-10 w-10";
  if (!src) return <div className={`${s} flex shrink-0 items-center justify-center rounded-xl text-[10px] ${t.thumb} ${t.soft}`}>No img</div>;
  return (
    <div className={`${s} relative shrink-0 overflow-hidden rounded-xl ${t.thumb}`}>
      <Image src={getCdnUrl(src) as string} alt={alt} fill sizes="56px" className="object-cover" />
    </div>
  );
}

function Panel({ title, onView, children, t }: { title: string; onView: () => void; children: React.ReactNode; t: Theme }) {
  return (
    <div className={`rounded-2xl shadow-sm ring-1 ${t.card}`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <button onClick={onView} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:opacity-80">View all <ChevronRight size={14} /></button>
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
function CustomerGroupRow({
  g, t, onOpenInquiry,
}: { g: CustomerGroup; t: Theme; onOpenInquiry?: (inquiryId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`transition-colors ${t.hover}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 p-4 text-left">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
          <Users className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          {/* The customer's name is what you are scanning for, so it wraps to a
              second line on a phone rather than being cut mid-word. The other
              names they have written in are demoted to their own line: they
              were what pushed the real name out of view. */}
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
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5"><Calendar className={`h-3 w-3 shrink-0 ${t.soft}`} /><span className="truncate font-medium">Last {fmtDate(g.lastInquiry)}</span></span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <a onClick={(e) => e.stopPropagation()} href={waLink(g.phone)} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white sm:inline-flex">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${t.qty}`}>{g.inquiryCount} {g.inquiryCount === 1 ? "product" : "products"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.soft}`} />
        </div>
      </button>
      {open && (
        <ul className={`border-t px-4 pb-3 pt-1 ${t.border}`}>
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
                  className={`flex w-full items-center gap-3 py-2 text-left text-sm ${
                    openable ? `rounded-lg transition-colors ${t.hover} cursor-pointer` : ""
                  }`}
                >
                  <Thumb t={t} src={p.productImage ?? null} alt={p.productName} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium">{p.productName}</span>
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
}

// The "All" landing view: master export + a manual CHECKLIST of every customer
// (deduped by phone, all products shown) that can be ticked and exported to a
// clean .xlsx — same header-band structure as the master workbook.
function AllSection({
  t, stats, groups, onGoInquiries, onGoContacts, onGoCareers, onOpenInquiry,
}: {
  t: Theme;
  stats: { inquiries: number; contacts: number; jobAlerts: number; customers: number };
  groups: CustomerGroup[];
  onGoInquiries: () => void; onGoContacts: () => void; onGoCareers: () => void;
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
    { label: "Careers", value: stats.jobAlerts, hint: "Job-alert subscribers", icon: Briefcase, go: onGoCareers },
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
              One workbook, four sheets: <span className="font-semibold">Customers</span> (deduped by phone, every product each customer asked for), <span className="font-semibold">Inquiries</span>, <span className="font-semibold">Contact Us</span>, and <span className="font-semibold">Careers</span> — over the whole database.
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
          <button onClick={toggleAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand" : `${t.soft} hover:text-brand`}`}>
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

// Careers management: job-alert email subscribers from the Careers page. Same
// search / triage / soft-delete UX as Contact Us, just a single email field.
function CareersSection({
  t, tab, setTab, q, setQ, statusFilter, setStatusFilter, statusCounts, list,
  selected, toggleSelect, allSelected, toggleSelectAll, busy, onExport,
  onSetStatus, onDelete, onRestore, onPurge, onStatusSelected, onDeleteSelected,
  onRestoreSelected, onPurgeSelected,
}: {
  t: Theme; tab: "active" | "trash"; setTab: (v: "active" | "trash") => void;
  q: string; setQ: (v: string) => void;
  statusFilter: "all" | Status; setStatusFilter: (v: "all" | Status) => void;
  statusCounts: { all: number; new: number; handled: number; spam: number };
  list: JobAlert[]; selected: Set<string>; toggleSelect: (id: string) => void;
  allSelected: boolean; toggleSelectAll: () => void; busy: boolean;
  onExport: () => void;
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
            placeholder={`Search ${tab === "trash" ? "deleted emails" : "emails"}…`}
            className={`h-10 w-full rounded-xl pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/30 ${t.input}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["active", "trash"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ring-1 ${tab === tabKey ? "bg-[#1d1d1f] text-white ring-transparent" : t.pill}`}
            >
              {tabKey === "active" ? "Subscribers" : "Recently Deleted"}
            </button>
          ))}
        </div>
        {tab === "active" && (
          <FilterMenu
            t={t}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            onClear={() => setStatusFilter("all")}
          />
        )}
        <button onClick={onExport} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export all"} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-black ${tab === "active" ? "" : "sm:ml-auto"}`}>
          <Download size={15} /> Export{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {showBulk && (
        <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${t.border}`}>
          <button onClick={toggleSelectAll} className={`inline-flex items-center gap-2 text-[13px] font-semibold transition-colors ${allSelected ? "text-brand" : `${t.soft} hover:text-brand`}`}>
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
          {list.map((j) => {
            const st = asStatus(j.status);
            const sel = selected.has(j.id);
            return (
              <li key={j.id} className={`flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center ${t.hover} ${sel ? "bg-brand/[0.05]" : st === "spam" && tab === "active" ? "bg-red-500/[0.04]" : ""}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <button onClick={() => toggleSelect(j.id)} aria-label="Select subscriber" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                    {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </button>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
                    <Briefcase className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Same "dealt with" line as the other two inboxes. */}
                    <p className={`line-clamp-1 text-[13.5px] font-semibold leading-snug ${
                      st !== "new" ? `line-through ${t.soft}` : t.strong
                    } ${tab === "trash" ? "opacity-70" : ""}`}>{j.email}</p>
                    <div className={`mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] ${t.mid}`}>
                      <span className="inline-flex items-center gap-1.5"><Calendar className={`h-3 w-3 ${t.soft}`} /><span className="font-medium">{fmtDate(j.createdAt)}</span></span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2.5 pl-[52px] sm:pl-0">
                  <a href={`mailto:${j.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand hover:text-white">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                  {tab === "active" ? (
                    <>
                      <StatusControl t={t} value={st} onChange={(s) => onSetStatus(j.id, s)} />
                      <button onClick={() => onDelete(j.id)} aria-label="Delete subscriber" title="Delete subscriber" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onRestore(j.id)} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white">
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </button>
                      <button onClick={() => onPurge(j.id)} aria-label="Delete forever" title="Delete forever" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500">
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
        <Empty t={t} label={tab === "trash" ? "Nothing in Recently Deleted. Deleted subscribers land here and can be restored any time." : "No subscribers yet. Emails from the Careers page “job alerts” box appear here."} pad />
      )}
    </div>
  );
}

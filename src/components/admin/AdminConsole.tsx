"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  LayoutGrid, Inbox, Users, LogOut, RefreshCw, Download, Search, Phone, Mail,
  MapPin, MessageCircle, PhoneCall, Package, Layers, ChevronRight, Sun, Moon, X,
  Trash2, ZoomIn, Loader2, RotateCcw, AlertTriangle, CheckSquare, Square, KeyRound,
  MessageSquare, Calendar, Briefcase, LayoutList, FileSpreadsheet, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { groupCustomers, buildCustomerSheet, type CustomerGroup } from "@/lib/customerGroups";

interface Inquiry {
  id: string; createdAt: string; customerName: string; companyName: string | null;
  email: string | null; country: string; phone: string; productName: string; quantity: number;
  message: string | null; productId: number | null; productImage: string | null; status: string;
}

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
  border: string; divide: string; hover: string; navIdle: string; navActive: string;
  input: string; chip: string; pill: string; thumb: string; qty: string;
  overlay: string; modal: string;
}
interface Props {
  data: {
    adminName: string; adminEmail: string; adminImage: string | null;
    stats: { products: number; categories: number; inquiries: number; contacts: number; jobAlerts: number };
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

type View = "all" | "overview" | "inquiries" | "trash" | "contacts" | "careers";

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

export function AdminConsole({ data }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
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
  useEffect(() => setItems(data.inquiries), [data.inquiries]);
  useEffect(() => setDeletedItems(data.deletedInquiries), [data.deletedInquiries]);
  // Clear the multi-select whenever the user switches views/filters.
  useEffect(() => setSelected(new Set()), [view, statusFilter, q]);

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
      const res = await fetch(`/api/admin/careers/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCareerItems(prevA); setCareerDeleted(prevD);
      window.alert("Action failed. Please try again.");
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
      const res = await fetch(`/api/admin/contact/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setContactItems(prevA); setContactDeleted(prevD);
      window.alert("Action failed. Please try again.");
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
      const res = await fetch(`/api/admin/inquiry/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, status: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prevA); setDeletedItems(prevD);
      window.alert("Action failed. Please try again.");
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
    router.push("/admin/login");
    router.refresh();
  };

  // Apple-clean in both modes: soft light greys, or a deep graphite dark.
  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", sidebar: "bg-[#151517]/90 border-white/10",
        card: "bg-[#151517] ring-white/[0.08]", soft: "text-[#8a8a8e]", strong: "text-white",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]", hover: "hover:bg-white/[0.03]",
        navIdle: "text-[#a1a1a6] hover:bg-white/[0.05]", navActive: "bg-white/[0.1] text-white",
        input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]", chip: "bg-white/[0.08] text-[#a1a1a6]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]", thumb: "bg-white/[0.05]",
        qty: "bg-brand/25 text-[#7fd8ea]", overlay: "bg-black/70", modal: "bg-[#151517] text-[#f2f2f4] ring-white/[0.1]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", sidebar: "bg-white/80 border-black/[0.06]",
        card: "bg-white ring-black/[0.04]", soft: "text-[#86868b]", strong: "text-[#1d1d1f]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]", hover: "hover:bg-black/[0.015]",
        navIdle: "text-[#515154] hover:bg-black/[0.03]", navActive: "bg-[#ececed] text-[#1d1d1f]",
        input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]", chip: "bg-black/[0.06] text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]", thumb: "bg-[#f5f5f7]",
        qty: "bg-brand/10 text-brand-dark", overlay: "bg-slate-900/50", modal: "bg-white text-[#1d1d1f] ring-black/[0.06]",
      };

  const inquiries = useMemo(
    () => items.filter((i) =>
      (statusFilter === "all" || asStatus(i.status) === statusFilter) &&
      (!q || `${i.customerName} ${i.productName} ${i.country} ${i.email ?? ""} ${i.phone}`.toLowerCase().includes(q.toLowerCase()))
    ),
    [items, q, statusFilter]
  );
  const statusCounts = useMemo(() => {
    const c = { all: items.length, new: 0, handled: 0, spam: 0 };
    items.forEach((i) => { c[asStatus(i.status)]++; });
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

  const nav: { key: View; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "all", label: "All", icon: LayoutList },
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "inquiries", label: "Inquiries", icon: Inbox, count: statusCounts.new },
    { key: "contacts", label: "Contact Us", icon: MessageSquare, count: newContactCount },
    { key: "careers", label: "Careers", icon: Briefcase, count: newCareerCount },
    { key: "trash", label: "Recently Deleted", icon: Trash2, count: deletedItems.length },
  ];

  const statCards = [
    { label: "Products", value: data.stats.products, icon: Package, tint: "text-sky-500", bg: dark ? "bg-sky-500/15" : "bg-sky-50" },
    { label: "Categories", value: data.stats.categories, icon: Layers, tint: "text-violet-500", bg: dark ? "bg-violet-500/15" : "bg-violet-50" },
    { label: "Inquiries", value: data.stats.inquiries, icon: Inbox, tint: "text-amber-500", bg: dark ? "bg-amber-500/15" : "bg-amber-50" },
    { label: "Messages", value: data.stats.contacts, icon: MessageSquare, tint: "text-emerald-500", bg: dark ? "bg-emerald-500/15" : "bg-emerald-50" },
    { label: "Careers", value: data.stats.jobAlerts, icon: Briefcase, tint: "text-rose-500", bg: dark ? "bg-rose-500/15" : "bg-rose-50" },
  ];

  return (
    <div style={sfFont} className={`min-h-screen w-full pt-16 antialiased transition-colors duration-200 ${t.page}`}>
      <div className="flex">
        {/* Sidebar */}
        <aside className={`sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r backdrop-blur-xl lg:flex ${t.sidebar}`}>
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
                {view === "all" ? "All" : view === "inquiries" ? "Inquiries" : view === "contacts" ? "Contact Us" : view === "careers" ? "Careers" : view === "trash" ? "Recently Deleted" : "Overview"}
              </h1>
              <p className={`mt-0.5 text-[13px] ${t.soft}`}>Welcome back, {data.adminName.split(" ")[0]}.</p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
              <div className="flex flex-wrap gap-1.5 lg:hidden">
                {nav.map((n) => (
                  <button key={n.key} onClick={() => { setView(n.key); setQ(""); }} className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 ${view === n.key ? "bg-[#1d1d1f] text-white ring-transparent" : t.pill}`}>{n.label}</button>
                ))}
              </div>
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

          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
            {statCards.map((s) => (
              <button
                key={s.label}
                onClick={() => { if (s.label === "Inquiries") setView("inquiries"); else if (s.label === "Messages") setView("contacts"); else if (s.label === "Careers") setView("careers"); }}
                className={`rounded-2xl p-5 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${t.card}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-[18px] w-[18px] ${s.tint}`} />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{fmtNum(s.value)}</p>
                <p className={`text-xs font-medium ${t.soft}`}>{s.label}</p>
              </button>
            ))}
          </div>

          {view === "all" ? (
            <AllSection
              t={t}
              stats={{ inquiries: data.stats.inquiries, contacts: data.stats.contacts, jobAlerts: data.stats.jobAlerts, customers: allCustomerGroups.length }}
              groups={allCustomerGroups}
              onGoInquiries={() => setView("inquiries")}
              onGoContacts={() => setView("contacts")}
              onGoCareers={() => setView("careers")}
            />
          ) : view === "overview" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel t={t} title="Recent inquiries" onView={() => setView("inquiries")}>
                {items.slice(0, 8).map((i) => (
                  <button key={i.id} onClick={() => setActiveInquiry(i)} className="flex w-full items-center gap-3 py-3 text-left">
                    <Thumb t={t} src={i.productImage} alt={i.productName} />
                    <div className="min-w-0 flex-1">
                      <p className={`line-clamp-1 text-[13px] font-semibold hover:text-brand ${asStatus(i.status) !== "new" ? "line-through opacity-60" : ""}`}>{i.productName}</p>
                      <p className={`text-xs ${t.soft}`}>{i.customerName} · {i.country}</p>
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
                      <p className={`line-clamp-1 text-xs ${t.soft}`}>{c.country} · {c.phone} · {c.message}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[asStatus(c.status)].chip}`}>{STATUS_META[asStatus(c.status)].label}</span>
                  </button>
                ))}
                {!contactItems.length && <Empty t={t} label="No messages yet." />}
              </Panel>
            </div>
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
                {/* Status filter — inquiries only. */}
                {view === "inquiries" && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                    {(["all", "new", "handled", "spam"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ring-1 ${statusFilter === s ? (s === "all" ? "bg-[#1d1d1f] text-white ring-transparent" : `${STATUS_META[s as Status].chip} ring-transparent`) : t.pill}`}
                      >
                        {s} {s === "all" ? statusCounts.all : statusCounts[s as Status]}
                      </button>
                    ))}
                  </div>
                )}
                <div className={`flex flex-wrap items-center gap-2 ${view === "inquiries" ? "" : "sm:ml-auto"}`}>
                  {/* Collapse duplicate customers (deduped by phone) into one
                      row each, listing every product they asked about. */}
                  {view === "inquiries" && (
                    <button
                      onClick={() => setGroupByCustomer((g) => !g)}
                      title="Collapse duplicate customers by phone number"
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${groupByCustomer ? "bg-brand text-white ring-transparent" : t.pill}`}
                    >
                      <Users size={15} /> Group by customer
                    </button>
                  )}
                  {view !== "trash" && (
                    <button onClick={exportExcel} title={selected.size > 0 ? `Export ${selected.size} selected` : "Export the visible list"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-black">
                      <Download size={15} /> Export{selected.size > 0 ? ` (${selected.size})` : ""}
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
                      {customerGroups.map((g) => <CustomerGroupRow key={g.key} g={g} t={t} />)}
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
                              <p className={`line-clamp-2 text-[13px] font-semibold leading-snug hover:text-brand ${st !== "new" ? "line-through opacity-70" : ""}`}>{i.productName}</p>
                              <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
                                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {i.customerName}</span>
                                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {i.country}</span>
                                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {i.phone}</span>
                                {i.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {i.email}</span>}
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
                              <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
                                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {i.customerName}</span>
                                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {i.phone}</span>
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
function InquiryModal({ inquiry, onClose, onZoom, onDelete, onSetStatus, t }: { inquiry: Inquiry; onClose: () => void; onZoom: (src: string) => void; onDelete: () => void; onSetStatus: (s: Status) => void; t: Theme }) {
  const img = inquiry.productImage ? (getCdnUrl(inquiry.productImage) as string) : null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`absolute inset-0 ${t.overlay}`} />
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 ${t.modal}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
          <p className="text-sm font-semibold">Ordered product</p>
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5 sm:grid-cols-2">
          {/* Click the image to view it close-up. */}
          {img ? (
            <button onClick={() => onZoom(img)} className={`group relative aspect-square w-full overflow-hidden rounded-2xl ${t.thumb}`} title="Click to enlarge">
              <Image src={img} alt={inquiry.productName} fill sizes="(max-width:640px) 90vw, 380px" className="object-contain transition-transform duration-300 group-hover:scale-105" />
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-3.5 w-3.5" /> Enlarge
              </span>
            </button>
          ) : (
            <div className={`flex aspect-square w-full items-center justify-center rounded-2xl text-sm ${t.thumb} ${t.soft}`}>No image available</div>
          )}
          <div className="min-w-0">
            {/* Full product name — no truncation. */}
            <h3 className={`text-lg font-semibold leading-snug ${asStatus(inquiry.status) !== "new" ? "line-through opacity-70" : ""}`}>{inquiry.productName}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${t.qty}`}>Quantity: {inquiry.quantity}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_META[asStatus(inquiry.status)].chip}`}>{STATUS_META[asStatus(inquiry.status)].label}</span>
            </div>
            <dl className={`mt-4 space-y-2.5 text-sm ${t.soft}`}>
              <Row icon={Users} label="Customer" value={inquiry.customerName} />
              {inquiry.companyName && <Row icon={Package} label="Company" value={inquiry.companyName} />}
              <Row icon={MapPin} label="Country" value={inquiry.country} />
              <Row icon={Phone} label="Phone" value={inquiry.phone} />
              {inquiry.email && <Row icon={Mail} label="Email" value={inquiry.email} />}
              <Row icon={Inbox} label="Received" value={fmtDateTime(inquiry.createdAt)} />
            </dl>
            {inquiry.message && (
              <div className={`mt-4 rounded-xl p-3 text-sm ${t.thumb}`}>
                <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Message</p>
                <p>{inquiry.message}</p>
              </div>
            )}
            {/* Triage the customer: New / Handled / Spam (fake). */}
            <div className="mt-5">
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Mark this customer</p>
              <StatusControl t={t} value={asStatus(inquiry.status)} onChange={onSetStatus} big />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`tel:${inquiry.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"><PhoneCall className="h-3.5 w-3.5" /> Call</a>
              <a href={waLink(inquiry.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
              <button onClick={onDelete} className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
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
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {(["all", "new", "handled", "spam"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ring-1 ${statusFilter === s ? (s === "all" ? "bg-[#1d1d1f] text-white ring-transparent" : `${STATUS_META[s as Status].chip} ring-transparent`) : t.pill}`}
              >
                {s} {s === "all" ? statusCounts.all : statusCounts[s as Status]}
              </button>
            ))}
          </div>
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
                      <p className={`line-clamp-1 text-[13px] font-semibold leading-snug hover:text-brand ${tab === "trash" ? "opacity-70" : ""}`}>
                        {contactName(c)}{c.companyName ? <span className={`font-normal ${t.soft}`}> · {c.companyName}</span> : null}
                      </p>
                      <p className={`mt-0.5 line-clamp-1 text-xs ${t.soft}`}>{c.message}</p>
                      <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
                        <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.country}</span>
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(c.createdAt)}</span>
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
      <div onClick={(e) => e.stopPropagation()} className={`relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 ${t.modal}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${t.border}`}>
          <p className="text-sm font-semibold">Contact message</p>
          <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft} hover:text-brand`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${t.thumb} ${t.soft}`}>
              <MessageSquare className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-snug">{contactName(contact)}</h3>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[asStatus(contact.status)].chip}`}>{STATUS_META[asStatus(contact.status)].label}</span>
            </div>
          </div>

          <dl className={`mt-4 space-y-2.5 text-sm ${t.soft}`}>
            <Row icon={Mail} label="Email" value={contact.email} />
            {contact.companyName && <Row icon={Package} label="Company" value={contact.companyName} />}
            <Row icon={MapPin} label="Country" value={contact.country} />
            <Row icon={Phone} label="Phone" value={contact.phone} />
            <Row icon={Calendar} label="Received" value={fmtDateTime(contact.createdAt)} />
          </dl>

          <div className={`mt-4 rounded-xl p-3 text-sm ${t.thumb}`}>
            <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${t.soft}`}>Message</p>
            <p className="whitespace-pre-wrap">{contact.message}</p>
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

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide opacity-70">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value}</span>
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
function CustomerGroupRow({ g, t }: { g: CustomerGroup; t: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`transition-colors ${t.hover}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
          <Users className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-semibold leading-snug">
            {g.customerName}
            {g.altNames.length > 0 && <span className={`font-normal ${t.soft}`}> · aka {g.altNames.join(", ")}</span>}
          </p>
          <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {g.phone}</span>
            {g.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {g.email}</span>}
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {g.country}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Last {fmtDate(g.lastInquiry)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <a onClick={(e) => e.stopPropagation()} href={waLink(g.phone)} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white sm:inline-flex">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>{g.inquiryCount} {g.inquiryCount === 1 ? "product" : "products"}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.soft}`} />
        </div>
      </button>
      {open && (
        <ul className={`border-t px-4 pb-3 pt-1 ${t.border}`}>
          {g.products.map((p, idx) => (
            <li key={idx} className={`flex items-center justify-between gap-3 py-2 text-sm ${idx > 0 ? `border-t ${t.divide}` : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium">{p.productName}</span>
                <span className={`text-xs ${t.soft}`}>{fmtDate(p.createdAt)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>Qty {p.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// The "All" landing view: master export + a manual CHECKLIST of every customer
// (deduped by phone, all products shown) that can be ticked and exported to a
// clean .xlsx — same header-band structure as the master workbook.
function AllSection({
  t, stats, groups, onGoInquiries, onGoContacts, onGoCareers,
}: {
  t: Theme;
  stats: { inquiries: number; contacts: number; jobAlerts: number; customers: number };
  groups: CustomerGroup[];
  onGoInquiries: () => void; onGoContacts: () => void; onGoCareers: () => void;
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
                  <div className="flex items-center gap-3 p-4">
                    <button onClick={() => toggle(g.key)} aria-label="Select customer" className={`shrink-0 transition-colors ${sel ? "text-brand" : `${t.soft} hover:text-brand`}`}>
                      {sel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                    <button onClick={() => toggleExpand(g.key)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.thumb} ${t.soft}`}>
                        <Users className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-[13px] font-semibold leading-snug">
                          {g.customerName}
                          {g.altNames.length > 0 && <span className={`font-normal ${t.soft}`}> · aka {g.altNames.join(", ")}</span>}
                        </p>
                        <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
                          <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {g.phone}</span>
                          {g.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {g.email}</span>}
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {g.country}</span>
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>{g.inquiryCount} {g.inquiryCount === 1 ? "product" : "products"}</span>
                      <button onClick={() => toggleExpand(g.key)} aria-label="Show products">
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${t.soft}`} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <ul className={`border-t px-4 pb-3 pt-1 ${t.border}`}>
                      {g.products.map((p, idx) => (
                        <li key={idx} className={`flex items-center justify-between gap-3 py-2 text-sm ${idx > 0 ? `border-t ${t.divide}` : ""}`}>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-medium">{idx + 1}. {p.productName}</span>
                            <span className={`text-xs ${t.soft}`}>{fmtDate(p.createdAt)}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${t.qty}`}>Qty {p.quantity}</span>
                        </li>
                      ))}
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
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {(["all", "new", "handled", "spam"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ring-1 ${statusFilter === s ? (s === "all" ? "bg-[#1d1d1f] text-white ring-transparent" : `${STATUS_META[s as Status].chip} ring-transparent`) : t.pill}`}
              >
                {s} {s === "all" ? statusCounts.all : statusCounts[s as Status]}
              </button>
            ))}
          </div>
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
                    <p className={`line-clamp-1 text-[13px] font-semibold leading-snug ${tab === "trash" ? "opacity-70" : ""}`}>{j.email}</p>
                    <div className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${t.soft}`}>
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(j.createdAt)}</span>
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

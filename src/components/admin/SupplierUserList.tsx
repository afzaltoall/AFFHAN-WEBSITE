"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, Loader2, Lock, RefreshCw, Search } from "lucide-react";

/**
 * Supplier Users: the console's Users section lists supplier accounts beside the customers' (the owner,
 * 2026-10-23), in Website Users' own design (CustomerList): who they are, how they sign in, whether they can
 * right now, and when they last did. A row opens the supplier's own page, where their applications are and where
 * they can be unlocked, signed out everywhere, blocked or deleted.
 *
 * Read from /api/admin/supplier-accounts, twenty a page, as the customer lists read theirs.
 */

export interface SupplierUserRow {
  id: string;
  name: string;
  email: string;
  mobile: string;
  companyName: string | null;
  status: "ACTIVE" | "BLOCKED";
  lastLoginAt: string | null;
  createdAt: string;
  applications: number;
  waiting: number;
  /** The address was proved with a code at sign-up (accounts made before 2026-10-23 were not asked). */
  emailChecked: boolean;
  /** Wrong passwords the lockout still remembers (the last day). */
  failedSignIns: number;
  /** Locked out by wrong passwords until then; null when they can sign in. */
  lockedUntil: string | null;
}

type Filter = "all" | "active" | "blocked" | "locked" | "none";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
  { key: "locked", label: "Locked out" },
  { key: "none", label: "No applications yet" },
];

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

/** "23 Oct, 3:20 pm", as the customer lists write a last sign-in. */
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

export function SupplierUserList() {
  const [users, setUsers] = useState<SupplierUserRow[]>([]);
  const [counts, setCounts] = useState<Record<Filter, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // An expired admin session must read as "sign in again", not as "there are no suppliers".
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "20", search, filter });
      const res = await fetch(`/api/admin/supplier-accounts/?${qs}`);
      if (res.ok) {
        const json = await res.json();
        setError(null);
        setUsers(json.data);
        setCounts(json.counts);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      } else {
        setUsers([]);
        setTotal(0);
        setError(res.status === 401 ? "Your admin session has ended. Sign in again to see this." : "Could not load the supplier accounts.");
      }
    } catch {
      setUsers([]);
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Supplier Users</h1>
            <p className="text-[13px] text-[#86868b]">
              {error ? error : `${total} ${total === 1 ? "account" : "accounts"} · signed up on the supplier portal`}
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              aria-pressed={filter === f.key}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                filter === f.key ? "bg-[#1d1d1f] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
              }`}
            >
              {f.label}
              {counts && <span className={`tabular-nums ${filter === f.key ? "opacity-70" : "text-[#86868b]"}`}>{counts[f.key]}</span>}
            </button>
          ))}
        </div>

        <div className="mb-6 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/[0.04]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" size={16} aria-hidden="true" />
            <input
              type="text"
              aria-label="Search supplier accounts"
              placeholder="Search by name, company, email or mobile..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl bg-[#f5f5f7] py-2.5 pl-9 pr-4 text-[13px] outline-none ring-1 ring-transparent transition-all focus:bg-white focus:ring-black/[0.08]"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-[13px]">
              <thead className="bg-[#f5f5f7] text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                <tr>
                  <th className="px-5 py-3">Supplier</th>
                  <th className="px-5 py-3">Mobile</th>
                  <th className="px-5 py-3">Signs in with</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Applications</th>
                  <th className="px-5 py-3">Last active</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-[#86868b]" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#86868b]">
                      {error ?? "No supplier accounts found."}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-black/[0.015]">
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/suppliers/${u.id}/`} className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#86868b] ring-1 ring-black/10">
                            {(u.companyName ?? u.name).charAt(0).toUpperCase()}
                          </span>
                          <span>
                            <span className="block font-semibold hover:underline">{u.companyName ?? u.name}</span>
                            <span className="block text-xs text-[#86868b]">
                              {u.companyName ? `${u.name} · ` : ""}
                              {u.email}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium">{u.mobile}</td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-md bg-black/[0.04] px-2 py-1 text-[11px] font-bold text-[#1d1d1f]">Password</span>
                          {u.emailChecked && (
                            <span title="Proved with a code at sign-up" className="text-[11px] font-semibold text-emerald-700">
                              email checked ✓
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {u.status === "BLOCKED" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                            <Ban size={11} aria-hidden="true" /> Blocked
                          </span>
                        ) : u.lockedUntil ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                            <Lock size={11} aria-hidden="true" /> Locked out until {time(u.lockedUntil)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 size={11} aria-hidden="true" /> Active
                          </span>
                        )}
                        {u.failedSignIns > 0 && !u.lockedUntil && u.status !== "BLOCKED" && (
                          <span className="ml-1.5 text-[11px] text-[#86868b]">
                            {u.failedSignIns} wrong {u.failedSignIns === 1 ? "password" : "passwords"} today
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium text-[#86868b]">
                        {u.applications}
                        {u.waiting > 0 && <span className="ml-1.5 text-[11px] font-semibold text-[#0058b0]">{u.waiting} waiting</span>}
                      </td>
                      <td className="px-5 py-3 text-[#86868b]">{u.lastLoginAt ? when(u.lastLoginAt) : "Never"}</td>
                      <td className="px-5 py-3 text-[#86868b]">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-3">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-[13px] text-[#86868b]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 px-1 text-[12px] leading-relaxed text-[#86868b]">
          Supplier accounts are their own table, apart from customers&apos;: one email can be a customer and a supplier,
          with a separate sign-in for each. New Suppliers lists what each supplier applied for.
        </p>
      </div>
    </div>
  );
}

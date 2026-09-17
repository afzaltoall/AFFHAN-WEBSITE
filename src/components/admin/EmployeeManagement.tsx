"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Loader2, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { EmployeeForm, type EmployeeRow } from "@/components/admin/EmployeeForm";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

/**
 * The staff list.
 *
 * Built on the customer list's shape deliberately — same table, same chrome,
 * same refresh button — because an admin moving between the two should not
 * have to learn a second layout for the same kind of screen.
 *
 * Deactivating takes two clicks rather than one. It is not a display toggle:
 * it ends that person's live sessions and stops them signing in, and a
 * mis-click on a row you were only reading would do that silently.
 */
export function EmployeeManagement({ initial }: { initial: EmployeeRow[] }) {
  const [rows, setRows] = useState<EmployeeRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/employees/", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load staff accounts.");
      setRows(data.employees as EmployeeRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load staff accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The server rendered the first list; this only refreshes it if the tab
    // has been sitting open.
    const t = setTimeout(() => void load(), 60_000);
    return () => clearTimeout(t);
  }, [load]);

  const setActive = async (row: EmployeeRow, isActive: boolean) => {
    setBusyId(row.id);
    setConfirming(null);
    try {
      const res = await fetch(`/api/admin/employees/${row.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change that account.");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive } : r)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that account.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = rows.filter((r) => {
    if (filter === "active" && !r.isActive) return false;
    if (filter === "inactive" && r.isActive) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.region ?? "").toLowerCase().includes(q)
    );
  });

  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
            <p className="text-[13px] text-[#86868b]">
              {error ?? `${rows.length} ${rows.length === 1 ? "account" : "accounts"} · ${activeCount} active · they sign in at /employee/login`}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => { setAdding((v) => !v); setNewPassword(null); }}
              className="flex items-center gap-2 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {adding ? <X size={14} /> : <UserPlus size={14} />}
              {adding ? "Close" : "Add employee"}
            </button>
          </div>
        </div>

        {/* The password, once. */}
        {newPassword && (
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-500/30">
            <p className="text-[13px] font-semibold">
              {newPassword.email} can now sign in at /employee/login/
            </p>
            <p className="mt-1 text-[13px] text-[#86868b]">
              This password is shown once and is not recoverable — send it on now. They can change it
              from the staff login&apos;s &ldquo;Forgot your password?&rdquo; link.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-[#f5f5f7] px-3 py-2 text-[15px] font-bold tracking-wider">
                {newPassword.password}
              </code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(newPassword.password);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* clipboard blocked — the password is on screen to read */
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => setNewPassword(null)}
                className="rounded-lg px-3 py-2 text-[13px] font-semibold text-[#86868b] hover:text-[#1d1d1f]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {adding && (
          <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
            <h2 className="mb-4 text-[15px] font-semibold">New staff account</h2>
            <EmployeeForm
              mode="create"
              onSaved={(employee, password) => {
                setRows((prev) => [employee, ...prev]);
                setAdding(false);
                if (password) setNewPassword({ email: employee.email, password });
                void load();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["all", "active", "inactive"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold capitalize transition-colors ${
                filter === key
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
              }`}
            >
              {key}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[#86868b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or region"
              className="w-full rounded-xl bg-white py-2.5 pl-9 pr-4 text-[13px] outline-none ring-1 ring-black/[0.06] transition-all focus:ring-black/[0.15]"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-[13px]">
              <thead className="bg-[#f5f5f7] text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Region</th>
                  <th className="px-5 py-3">Last login</th>
                  <th className="px-5 py-3">Assigned leads</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#86868b]">
                      {rows.length === 0
                        ? "No staff accounts yet. Add one to let somebody sign in at /employee/login/."
                        : "No accounts match that search."}
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id} className={`transition-colors hover:bg-black/[0.015] ${r.isActive ? "" : "opacity-60"}`}>
                      <td className="px-5 py-3">
                        <Link href={`/admin/employees/${r.id}/`} className="flex items-center gap-3">
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.image}
                              alt=""
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10"
                            />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#86868b] ring-1 ring-black/10">
                              {r.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span>
                            <span className="block font-semibold hover:underline">
                              {r.name}
                              {r.role === "ADMIN" && (
                                <span className="ml-2 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-bold text-violet-700">
                                  Admin
                                </span>
                              )}
                            </span>
                            <span className="block text-xs text-[#86868b]">{r.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">{r.region || <span className="text-[#86868b]">—</span>}</td>
                      <td className="px-5 py-3">
                        {r.lastLoginAt ? (
                          <span title={new Date(r.lastLoginAt).toLocaleString("en-GB")}>{timeAgo(r.lastLoginAt)}</span>
                        ) : (
                          <span className="text-[#86868b]">never</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-medium">{r.assignedLeads ?? 0}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                            r.isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-black/[0.05] text-[#86868b]"
                          }`}
                        >
                          {r.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {busyId === r.id ? (
                          <Loader2 size={14} className="ml-auto animate-spin text-[#86868b]" />
                        ) : confirming === r.id ? (
                          <span className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => void setActive(r, !r.isActive)}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-[12px] font-semibold text-white"
                            >
                              {r.isActive ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              onClick={() => setConfirming(null)}
                              className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#86868b]"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirming(r.id)}
                            className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
                          >
                            {r.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[12px] text-[#86868b]">
          Deactivating keeps the person and their history, and ends their sessions at once. Assignment
          and status updates arrive in a later phase; the counts read zero until then.
        </p>
      </div>
    </div>
  );
}

export default EmployeeManagement;

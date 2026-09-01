"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, ArrowLeft, Mail, AlertTriangle, Smartphone } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface MobileUser {
  id: string;
  name: string;
  email: string;
  profileImage: string | null;
  authProvider: string;
  emailVerified: boolean;
  accountStatus: string;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

const sfFont = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' };

export default function MobileUsersPage() {
  const [users, setUsers] = useState<MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mobile-users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data);
        setTotalPages(json.pagination.totalPages);
        setTotalUsers(json.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [page, search]);

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">App Users</h1>
              <p className="text-[13px] text-[#86868b]">{totalUsers} registered mobile users</p>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/[0.04]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" size={16} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-xl bg-[#f5f5f7] py-2.5 pl-9 pr-4 text-[13px] outline-none ring-1 ring-transparent transition-all focus:bg-white focus:ring-black/[0.08]"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-[13px]">
              <thead className="bg-[#f5f5f7] text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Logins</th>
                  <th className="px-5 py-3">Last Active</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-[#86868b]" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#86868b]">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-black/[0.015]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {user.profileImage ? (
                            <Image src={user.profileImage} alt={user.name} width={32} height={32} className="rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#86868b] ring-1 ring-black/10">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">{user.name}</p>
                            <p className="text-xs text-[#86868b]">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${
                          user.authProvider === "GOOGLE" ? "bg-red-500/10 text-red-600" :
                          user.authProvider === "EMAIL" ? "bg-blue-500/10 text-blue-600" :
                          "bg-purple-500/10 text-purple-600"
                        }`}>
                          {user.authProvider}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          user.accountStatus === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                        }`}>
                          {user.accountStatus}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-[#86868b]">
                        {user.loginCount}
                      </td>
                      <td className="px-5 py-3 text-[#86868b]">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}
                      </td>
                      <td className="px-5 py-3 text-[#86868b]">
                        {new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-3 flex items-center justify-between">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] bg-white disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-[13px] text-[#86868b]">Page {page} of {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] bg-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

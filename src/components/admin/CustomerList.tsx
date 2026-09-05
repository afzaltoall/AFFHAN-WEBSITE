"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, Loader2, RefreshCw, Search, Smartphone } from "lucide-react";
import { GoogleG } from "@/components/ui/GoogleG";

/**
 * One customer list, pointed at whichever client you want to see.
 *
 * The website list and the app list are the same table read two ways, so they
 * are the same component with a different filter rather than two files that
 * would drift apart the first time a column is added to one of them.
 */

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  profileImage: string | null;
  authProvider: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  accountStatus: string;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  usesWeb: boolean;
  usesApp: boolean;
  unknownSessions: number;
  activeSessions: number;
  inquiryCount: number;
  favouriteCount: number;
  changeCount: number;
}

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export function CustomerList({
  platform,
  title,
  blurb,
}: {
  /** null lists every account, regardless of where they signed in from. */
  platform: "WEB" | "APP" | null;
  title: string;
  blurb: string;
}) {
  const [users, setUsers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // A failed load and an empty list look identical without this, and the
  // failure that matters most here is an expired admin session — which reads
  // as "there are no customers" exactly when it should read "sign in again".
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "20", search });
      if (platform) qs.set("platform", platform);
      const res = await fetch(`/api/admin/mobile-users?${qs}`);
      if (res.ok) {
        const json = await res.json();
        setError(null);
        setUsers(json.data);
        setTotalPages(json.pagination.totalPages);
        setTotal(json.pagination.total);
      } else {
        setUsers([]);
        setTotal(0);
        setError(
          res.status === 401
            ? "Your admin session has ended. Sign in again to see this."
            : "Could not load accounts."
        );
      }
    } catch (err) {
      console.error(err);
      setUsers([]);
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [page, search, platform]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      {/* Full width, not a centred column. This is a data table with eight
          columns; capping it at 1152px left the numbers crushed together in the
          middle of a wide screen with empty grey either side. */}
      <div className="px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-[13px] text-[#86868b]">
              {error ? error : `${total} ${total === 1 ? "account" : "accounts"} · ${blurb}`}
            </p>
          </div>

          {/* Sessions expire and people sign in while you are looking at this,
              so the list goes stale as you read it. */}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Switching between the two lists, and the honest note about why a
            person can be on both. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tab href="/admin/users/website/" active={platform === "WEB"} Icon={Globe}>
            Website users
          </Tab>
          <Tab href="/admin/users/app/" active={platform === "APP"} Icon={Smartphone}>
            App users
          </Tab>
          <Tab href="/admin/users/" active={platform === null} Icon={Globe}>
            All accounts
          </Tab>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/[0.04]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
              size={16}
            />
            <input
              type="text"
              placeholder="Search by name, email or phone..."
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
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Signs in with</th>
                  <th className="px-5 py-3">Used from</th>
                  <th className="px-5 py-3">Inquiries</th>
                  <th className="px-5 py-3">Changes</th>
                  <th className="px-5 py-3">Last active</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {loading && users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-[#86868b]" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[#86868b]">
                      {error ?? "No accounts found."}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-black/[0.015]">
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/${u.id}/`} className="flex items-center gap-3">
                          {u.profileImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.profileImage}
                              alt=""
                              width={32}
                              height={32}
                              referrerPolicy="no-referrer"
                              className="h-8 w-8 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10"
                            />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#86868b] ring-1 ring-black/10">
                              {u.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span>
                            <span className="block font-semibold hover:underline">{u.name}</span>
                            <span className="block text-xs text-[#86868b]">{u.email ?? "—"}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        {u.phone ? (
                          <span className="font-medium">
                            {u.phone}
                            {u.phoneVerified && <span className="ml-1 text-emerald-600">✓</span>}
                          </span>
                        ) : (
                          <span className="text-[#86868b]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.04] px-2 py-1 text-[11px] font-bold text-[#1d1d1f]">
                          {/* The mark, not just the word — it is the one
                              sign-in method with a logo people recognise at a
                              glance, which is the point of a dense table. */}
                          {u.authProvider.includes("GOOGLE") && (
                            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
                              <GoogleG size={9} />
                            </span>
                          )}
                          {readableProvider(u.authProvider)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5">
                          {u.usesWeb && <Pill tone="sky">Web</Pill>}
                          {u.usesApp && <Pill tone="violet">App</Pill>}
                          {/* Sessions opened before the platform column was
                              filled in. Saying "unknown" beats putting them on
                              a list they may not belong to. */}
                          {u.unknownSessions > 0 && <Pill tone="grey">Unknown</Pill>}
                          {u.activeSessions === 0 && (
                            <span className="text-[11px] text-[#86868b]">No live session</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-[#86868b]">{u.inquiryCount}</td>
                      <td className="px-5 py-3 font-medium text-[#86868b]">
                        {u.changeCount > 0 ? u.changeCount : "—"}
                      </td>
                      <td className="px-5 py-3 text-[#86868b]">
                        {/* hour12, or en-GB renders 22:25 — railway time,
                            which nobody in the office reads back correctly. */}
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })
                          : "Never"}
                      </td>
                      <td className="px-5 py-3 text-[#86868b]">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
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
                className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[13px] text-[#86868b]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 px-1 text-[12px] leading-relaxed text-[#86868b]">
          There is one customer table. These lists are the same accounts filtered by where they
          signed in from, so somebody who uses both the site and the app appears on both — that is
          the same person, not a duplicate. Sessions expire, so a very old account with nothing
          live shows on &ldquo;All accounts&rdquo; only.
        </p>
      </div>
    </div>
  );
}

function Tab({
  href,
  active,
  Icon,
  children,
}: {
  href: string;
  active: boolean;
  Icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "bg-[#1d1d1f] text-white"
          : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
      }`}
    >
      <Icon size={14} />
      {children}
    </Link>
  );
}

function Pill({ tone, children }: { tone: "sky" | "violet" | "grey"; children: React.ReactNode }) {
  const tones = {
    sky: "bg-sky-500/10 text-sky-700",
    violet: "bg-violet-500/10 text-violet-700",
    grey: "bg-black/[0.05] text-[#86868b]",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** "GOOGLE_AND_PHONE" is storage; this is what a person reads. */
export function readableProvider(provider: string) {
  const google = provider.includes("GOOGLE");
  const phone = provider.includes("PHONE");
  const email = provider.includes("EMAIL");
  const parts = [google && "Google", phone && "OTP", email && "Password"].filter(Boolean);
  return parts.length ? parts.join(" + ") : provider;
}

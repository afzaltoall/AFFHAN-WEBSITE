"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  Heart,
  KeyRound,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Smartphone,
} from "lucide-react";
import { readableProvider } from "@/components/admin/CustomerList";
import { getCdnUrl } from "@/lib/cdn";
import { GoogleG } from "@/components/ui/GoogleG";

/**
 * One customer, in full.
 *
 * Built like the supplier detail page: its own route, so several can be open
 * at once — which is how these get used, one per person being chased.
 *
 * The password hash and the Google subject id are not fetched at all, so there
 * is nothing here to leak. Whether a password exists is a boolean the server
 * derives; what it is is nobody's business, including the office's.
 */

interface Detail {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  profileImage: string | null;
  authProvider: string;
  accountStatus: string;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean;
  usesWeb: boolean;
  usesApp: boolean;
  inquiryCount: number;
  favouriteCount: number;
  viewCount: number;
  sessions: Array<{ id: string; platform: string | null; createdAt: string; expiresAt: string }>;
  changes: Array<{
    id: string;
    field: string;
    fromValue: string | null;
    toValue: string | null;
    source: string;
    createdAt: string;
  }>;
  inquiries: Array<{
    id: string;
    /** Which table it came from — the website's or the app's. */
    source: "WEBSITE" | "APP";
    productId: number | null;
    productName: string;
    productImage: string | null;
    requestedMOQ: number;
    label: string;
    createdAt: string;
  }>;
}

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/mobile-users/${id}`, { cache: "no-store" });
        if (!res.ok) {
          setError(res.status === 404 ? "That account does not exist." : "Could not load it.");
          return;
        }
        const json = await res.json();
        setUser(json.user);
      } catch {
        setError("Could not reach the server.");
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div style={sfFont} className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <p className="text-[13px] text-[#86868b]">{error}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={sfFont} className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
        <Loader2 size={24} className="animate-spin text-[#86868b]" />
      </div>
    );
  }

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/users/"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Customer</h1>
        </div>

        {/* Identity */}
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          {user.profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.profileImage}
              alt=""
              width={56}
              height={56}
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f5f7] text-lg font-bold text-[#86868b] ring-1 ring-black/10">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#86868b]">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={12} />
                {user.email ?? "no email"}
                {user.email && user.emailVerified && (
                  <span className="text-emerald-600">verified</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} />
                {user.phone ?? "no number"}
                {user.phone && user.phoneVerified && (
                  <span className="text-emerald-600">verified</span>
                )}
              </span>
            </p>
          </div>
          <span className="flex items-center gap-2">
            {user.usesWeb && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-[12px] font-bold text-sky-700">
                <Globe size={12} /> Website
              </span>
            )}
            {user.usesApp && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-[12px] font-bold text-violet-700">
                <Smartphone size={12} /> App
              </span>
            )}
          </span>
        </div>

        {/* Facts */}
        <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-black/[0.06] shadow-sm ring-1 ring-black/[0.04] sm:grid-cols-4">
          <Fact
            label="Signs in with"
            value={readableProvider(user.authProvider)}
            icon={
              user.authProvider.includes("GOOGLE") ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white ring-1 ring-black/10">
                  <GoogleG size={10} />
                </span>
              ) : undefined
            }
          />
          <Fact label="Status" value={user.accountStatus} />
          <Fact label="Logins" value={String(user.loginCount)} />
          <Fact
            label="Joined"
            value={new Date(user.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
          <Fact label="Inquiries" value={String(user.inquiryCount)} />
          <Fact label="Favourites" value={String(user.favouriteCount)} />
          <Fact label="Products viewed" value={String(user.viewCount)} />
          <Fact label="Last active" value={user.lastLoginAt ? dt(user.lastLoginAt) : "Never"} />
        </div>

        {/* Change history */}
        <Panel
          title="Account changes"
          icon={<KeyRound size={15} />}
          subtitle="Edits the customer made to their own details."
        >
          {user.changes.length === 0 ? (
            <p className="px-5 py-6 text-[13px] leading-relaxed text-[#86868b]">
              Nothing recorded. Changes have only been logged since this trail was added, so an
              older account shows none — that is an empty history, not a missing one.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {user.changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                  <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] font-bold uppercase">
                    {c.field}
                  </span>
                  <span className="text-[13px]">
                    {c.field === "password" ? (
                      // Deliberately valueless. The row answers "was it
                      // changed"; nothing about what it became is stored.
                      "Changed"
                    ) : (
                      <>
                        <span className="text-[#86868b] line-through">{c.fromValue || "—"}</span>
                        <span className="mx-2 text-[#86868b]">→</span>
                        <span className="font-medium">{c.toValue || "—"}</span>
                      </>
                    )}
                  </span>
                  <span className="ml-auto text-[12px] text-[#86868b]">
                    {c.source} · {dt(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!user.hasPassword && (
            <p className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-3 text-[12px] leading-relaxed text-[#86868b]">
              This account has no password — it signs in with{" "}
              {readableProvider(user.authProvider)}. There is no password-change flow anywhere in
              the website or the app today, so a &ldquo;password&rdquo; row can only appear if one
              is built.
            </p>
          )}
        </Panel>

        {/* Sessions */}
        <Panel
          title="Sessions"
          icon={<Globe size={15} />}
          subtitle="Live sign-ins. Expired ones are deleted, so this is not a full login history."
        >
          {user.sessions.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[#86868b]">No live sessions.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {user.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] font-bold">
                    {s.platform ?? "UNKNOWN"}
                  </span>
                  <span className="text-[#86868b]">opened {dt(s.createdAt)}</span>
                  <span className="ml-auto text-[12px] text-[#86868b]">
                    expires {dt(s.expiresAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Inquiries */}
        <Panel
          title="Inquiries"
          icon={<MessageSquareText size={15} />}
          subtitle={`${user.inquiryCount} total${user.inquiryCount > 25 ? ", 25 most recent shown" : ""}.`}
        >
          {user.inquiries.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[#86868b]">None yet.</p>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {user.inquiries.map((i) => (
                <li key={`${i.source}-${i.id}`} className="flex items-center gap-3 px-5 py-3">
                  {/* The picture is how you recognise the thing being asked
                      for; a truncated CJ product name mostly is not. */}
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#f5f5f7] ring-1 ring-black/[0.06]">
                    {i.productImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getCdnUrl(i.productImage) ?? i.productImage}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    {i.productId ? (
                      <Link
                        href={`/products/${i.productId}/`}
                        target="_blank"
                        className="line-clamp-1 text-[13px] font-semibold text-[#1d1d1f] hover:underline"
                      >
                        {i.productName}
                      </Link>
                    ) : (
                      <span className="line-clamp-1 text-[13px] font-semibold text-[#1d1d1f]">
                        {i.productName}
                      </span>
                    )}
                    <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[#6e6e73]">
                      {i.requestedMOQ.toLocaleString()} pcs
                      <span className="text-black/20">·</span>
                      {dt(i.createdAt)}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {/* Which client it arrived from. The two tables behave
                        differently — only a website inquiry can be anonymous —
                        so the office needs to know which it is looking at. */}
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        i.source === "WEBSITE"
                          ? "bg-sky-500/10 text-sky-700"
                          : "bg-violet-500/10 text-violet-700"
                      }`}
                    >
                      {i.source === "WEBSITE" ? "Web" : "App"}
                    </span>
                    <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] font-bold text-[#1d1d1f]">
                      {i.label}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <p className="mt-4 flex items-start gap-2 px-1 text-[12px] leading-relaxed text-[#86868b]">
          <Heart size={13} className="mt-px shrink-0" />
          Favourites and browsing history are counted here but not listed — they are the
          customer&apos;s own shortlist, and the office has no reason to read it item by item.
        </p>
      </div>
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white px-5 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">{label}</p>
      {/* text-[#1d1d1f], not the inherited grey: these are the facts the page
          exists to state, and they were rendering lighter than their labels. */}
      <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#1d1d1f]">
        {icon}
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
      <div className="border-b border-black/[0.06] px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#86868b]">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

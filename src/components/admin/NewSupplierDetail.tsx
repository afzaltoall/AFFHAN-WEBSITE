"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Ban, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, ExternalLink, LogIn, MapPin, Moon, Package,
  Sun, Trash2, User,
} from "lucide-react";
import { useAdminDark } from "@/lib/useAdminDark";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { getCdnUrl } from "@/lib/cdn";
import { SupplierContacts } from "@/components/admin/SupplierContacts";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import {
  NOTICE_KEY, newSupplierTheme, offerTone, phoneOf, spaced, stamp, wechatOf, type BoardAccount, type BoardOffer,
  type NewSupplierTheme,
} from "@/components/admin/new-suppliers-shared";
import { REPLY_MAX, TEAM_STATUSES, TEAM_STATUS_LABEL, moqPhrase, type OfferStatus } from "@/lib/supplier-offer";

/**
 * One new supplier, in full: the Old Suppliers book's supplier page (SupplierDetail) for the supplier portal
 * (the owner, 2026-10-23: "see the last image, I want like that, to show off fully"). The same bar, the same
 * card of who they are, their contact and address side by side, and then everything they applied to supply, each
 * application whole: the product, the MOQ, what they wrote, their photos, where it stands and the reply they read.
 * The team decides here, and blocks or deletes the supplier here; New Suppliers' rows open this page, and the
 * inquiry panel opens it at one application (#application-<id>).
 *
 * Read again every twenty seconds while on screen, as the board is, so an application sent while it is open
 * appears by itself; a reply being typed stays as it is.
 */

/** Another new supplier's application for a product this one applied for. */
export interface OtherApplication {
  offerId: string;
  supplierId: string;
  /** Company, else the contact person. */
  title: string;
  /** The contact person when the title is the company. */
  person: string;
  productName: string;
  status: OfferStatus;
}

type Change = { status?: OfferStatus; reply?: string };
type Pending = { kind: "supplier" } | { kind: "application"; id: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const session = (status: number, fallback: string, error?: unknown) =>
  status === 401 ? "Your admin session has ended. Sign in again." : typeof error === "string" && error ? error : fallback;

export function NewSupplierDetail({
  account: initialAccount,
  serial,
  offers: initialOffers,
  others,
}: {
  account: BoardAccount;
  /** Registration order, as New Suppliers numbers its rows. */
  serial: number;
  /** Their applications, newest first. */
  offers: BoardOffer[];
  others: OtherApplication[];
}) {
  const router = useRouter();
  const [dark, setDark] = useAdminDark();
  const [account, setAccount] = useState(initialAccount);
  const [offers, setOffers] = useState(initialOffers);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The application the address points at (#application-<id>), lit for a moment on arrival. */
  const [lit, setLit] = useState<string | null>(null);

  useLiveRefresh(20_000);
  useEffect(() => setAccount(initialAccount), [initialAccount]);
  useEffect(() => setOffers(initialOffers), [initialOffers]);

  // #application-<id>: to that application, and light it. Done here rather than with :target, which a client
  // navigation (history.pushState, as the board's links make) never updates.
  useEffect(() => {
    const show = () => {
      const match = /^#application-(.+)$/.exec(window.location.hash);
      const el = match && document.getElementById(`application-${match[1]}`);
      if (!match || !el) return;
      el.scrollIntoView({ block: "start" });
      setLit(match[1]);
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, []);
  useEffect(() => {
    if (!lit) return;
    const timer = window.setTimeout(() => setLit(null), 2600);
    return () => window.clearTimeout(timer);
  }, [lit]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const t = newSupplierTheme(dark);
  const tone = offerTone(dark);
  const title = account.companyName ?? account.name;
  const blocked = account.status === "BLOCKED";
  const mapsHref = account.companyAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.companyAddress)}`
    : null;
  const waiting = offers.filter((o) => o.status === "NEW").length;
  const accepted = offers.filter((o) => o.status === "ACCEPTED").length;

  const facts: { Icon: typeof User; label: string; value: React.ReactNode }[] = [
    { Icon: User, label: "Contact person", value: account.name },
    ...(account.companyName ? [{ Icon: Building2, label: "Company", value: account.companyName }] : []),
    {
      Icon: CalendarDays,
      label: "Registered",
      value: (
        <>
          {stamp(account.createdAt)} <span className={t.soft}>· S.No {serial}</span>
        </>
      ),
    },
    { Icon: LogIn, label: "Last signed in", value: account.lastLoginAt ? stamp(account.lastLoginAt) : "—" },
  ];

  /** A status or a reply, saved at once; null when saved, or the sentence saying why not. */
  const saveOffer = async (id: string, change: Change): Promise<string | null> => {
    const before = offers;
    setOffers((all) =>
      all.map((o) => (o.id === id ? { ...o, ...change, reply: change.reply !== undefined ? change.reply.trim() || null : o.reply } : o)),
    );
    try {
      const res = await fetch(`/api/admin/supplier-offers/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(session(res.status, "That change did not save. Try again.", data?.error));
      setOffers((all) =>
        all.map((o) => (o.id === id ? { ...o, status: data.status, reply: data.reply, reviewedAt: data.reviewedAt, reviewedBy: data.reviewedBy } : o)),
      );
      router.refresh();
      return null;
    } catch (e) {
      setOffers(before);
      return e instanceof Error ? e.message : "That change did not save. Try again.";
    }
  };

  const setBlocked = async (block: boolean) => {
    const who = `${title} (${account.email})`;
    if (!window.confirm(block ? `Block ${who}? They are signed out at once and cannot sign in until unblocked.` : `Unblock ${who}?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/supplier-accounts/${account.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: block ? "BLOCKED" : "ACTIVE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(session(res.status, "That change did not save. Try again.", data?.error));
      setAccount((a) => ({ ...a, status: block ? "BLOCKED" : "ACTIVE" }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change did not save. Try again.");
    }
  };

  /** The delete the window asked about: null when done, or the sentence to show when it was not. */
  const runDelete = async (): Promise<string | null> => {
    if (!pending) return null;
    try {
      if (pending.kind === "supplier") {
        const res = await fetch("/api/admin/supplier-accounts/delete/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [account.id] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return session(res.status, "The supplier was not deleted.", data?.error);
        const said = `Deleted ${plural(Number(data.deleted) || 1, "supplier")}${data.applications ? ` and ${plural(Number(data.applications), "application")}` : ""}.`;
        try {
          window.sessionStorage.setItem(NOTICE_KEY, said);
        } catch {
          // Storage refused: the board simply does not say it.
        }
        router.replace("/admin/new-suppliers/");
        return null;
      }
      const res = await fetch(`/api/admin/supplier-offers/${pending.id}/`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return session(res.status, "The application was not deleted.", data?.error);
      const gone = offers.find((o) => o.id === pending.id);
      setOffers((all) => all.filter((o) => o.id !== pending.id));
      setNotice(`Deleted the application${gone ? ` for ${gone.productName.slice(0, 80)}` : ""}.`);
      setPending(null);
      router.refresh();
      return null;
    } catch {
      return "Network error: nothing was deleted. Try again.";
    }
  };

  /** What the delete window says about what it is about to delete. */
  const pendingView = (() => {
    if (!pending) return null;
    if (pending.kind === "supplier") {
      const photos = offers.reduce((n, o) => n + o.photos.length, 0);
      // Only what there is: "The account is deleted", "The account, 2 applications and 1 photo are deleted".
      const parts = ["The account", offers.length ? plural(offers.length, "application") : "", photos ? plural(photos, "photo") : ""].filter(Boolean);
      const what = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
      return {
        title: "Delete this supplier?",
        lines: [`${what} ${parts.length > 1 ? "are" : "is"} deleted for good. This cannot be undone.`, "They are signed out at once, and can register again with the same email."],
        names: [`${title} · ${account.email}`],
      };
    }
    const o = offers.find((x) => x.id === pending.id);
    return {
      title: "Delete this application?",
      lines: [
        `${o ? `${o.productName} from ${o.companyName}` : "The application"}${o?.photos.length ? `, with ${plural(o.photos.length, "photo")},` : ""} is deleted for good. This cannot be undone.`,
        "The supplier's account and their other applications stay.",
      ],
      names: [],
    };
  })();

  const otherProducts = [...new Set(others.map((o) => o.productName))];

  return (
    <div className={`min-h-screen ${t.page}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' }}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${t.bar}`}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link
            href="/admin/new-suppliers/"
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="hidden sm:inline">New Suppliers</span>
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg rail:hidden">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{title}</p>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-pressed={dark}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-10">
        <div className={`rounded-2xl p-5 ring-1 sm:p-6 ${t.card}`}>
          <h1 className="break-words text-[22px] font-semibold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
          {account.companyName && <p className={`mt-1 text-[14px] ${t.soft}`}>{account.name}</p>}

          {blocked && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] font-medium text-red-600">
              <Ban size={14} aria-hidden="true" className="shrink-0" />
              Blocked: signed out, and unable to sign in until unblocked. Their applications stay.
            </p>
          )}

          <dl className={`mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4 ${t.border}`}>
            {facts.map(({ Icon, label, value }) => (
              <div key={label} className="min-w-0">
                <dt className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
                  <Icon size={12} aria-hidden="true" /> {label}
                </dt>
                <dd className="mt-1 break-words text-[13.5px] font-medium leading-snug">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-600">{error}</p>}
        {notice && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-600">
            <Check size={15} aria-hidden="true" /> {notice}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className={`min-w-0 rounded-2xl p-5 ring-1 ${t.card}`} aria-labelledby="supplier-contact-heading">
            <h2 id="supplier-contact-heading" className={`mb-3.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
              Contact
            </h2>
            <SupplierContacts
              phones={phoneOf(account.mobile)}
              handles={wechatOf(account.wechatId)}
              webs={[]}
              emails={[account.email]}
              raw=""
              dark={dark}
              variant="full"
            />
          </section>

          <section className={`min-w-0 rounded-2xl p-5 ring-1 ${t.card}`} aria-labelledby="supplier-address-heading">
            <h2 id="supplier-address-heading" className={`mb-3.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
              <MapPin size={12} aria-hidden="true" /> Address
            </h2>
            {account.companyAddress ? (
              <>
                <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{account.companyAddress}</p>
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Open in Google Maps <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </>
            ) : (
              <p className={`text-[13px] ${t.soft}`}>No address yet. The first application asks for it, with the company and WeChat ID.</p>
            )}
          </section>
        </div>

        <section className="mt-6" aria-labelledby="supplier-applications-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="supplier-applications-heading" className="text-[15px] font-semibold tracking-tight">
              Applications <span className={`font-normal ${t.soft}`}>· {offers.length.toLocaleString("en-US")}</span>
            </h2>
            {offers.length > 0 && (
              <p className={`text-[12px] ${t.soft}`}>
                {waiting.toLocaleString("en-US")} waiting · {accepted.toLocaleString("en-US")} accepted
              </p>
            )}
          </div>
          {offers.length ? (
            <div className="grid grid-cols-1 gap-4">
              {offers.map((o) => (
                <ApplicationCard
                  key={o.id}
                  offer={o}
                  account={account}
                  lit={lit === o.id}
                  t={t}
                  tone={tone}
                  onSave={(change) => saveOffer(o.id, change)}
                  onDelete={() => setPending({ kind: "application", id: o.id })}
                />
              ))}
            </div>
          ) : (
            <div className={`rounded-2xl px-6 py-10 text-center ring-1 ${t.card}`}>
              <p className="text-[14px] font-semibold">Nothing applied for yet.</p>
              <p className={`mt-1 text-[13px] ${t.soft}`}>Whatever they apply to supply arrives here, in full.</p>
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section className="mt-6" aria-labelledby="supplier-others-heading">
            <h2 id="supplier-others-heading" className="mb-3 px-1 text-[15px] font-semibold tracking-tight">
              {otherProducts.length === 1 ? `Others who applied for “${otherProducts[0]}”` : "Others who applied for the same products"}
            </h2>
            <ul className={`overflow-hidden rounded-2xl ring-1 ${t.card}`}>
              {others.map((r, i) => (
                <li key={r.offerId} className={i ? `border-t ${t.border}` : ""}>
                  <Link
                    href={`/admin/new-suppliers/${r.supplierId}/#application-${r.offerId}`}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.hover}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{r.title}</span>
                      <span className={`block truncate text-[11.5px] ${t.soft}`}>{[r.person, r.productName].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone[r.status]}`}>{TEAM_STATUS_LABEL[r.status]}</span>
                    <ChevronRight size={15} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={`mt-6 rounded-2xl p-5 ring-1 ${t.card}`} aria-labelledby="supplier-account-heading">
          <h2 id="supplier-account-heading" className={`mb-3.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
            Account
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                blocked ? "bg-red-500/10 text-red-600" : dark ? "bg-emerald-400/15 text-emerald-300" : "bg-emerald-500/10 text-emerald-700"
              }`}
            >
              {blocked ? <Ban size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
              {blocked ? "Blocked" : "Active"}
            </span>
            <p className={`min-w-0 flex-1 text-[13px] ${t.soft}`}>
              {blocked
                ? "Unblocked, they can sign in again at once."
                : "Blocked, they are signed out at once and cannot sign in until unblocked. Their applications stay."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {blocked ? (
                <button
                  type="button"
                  onClick={() => void setBlocked(false)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
                >
                  <CheckCircle2 size={14} aria-hidden="true" /> Unblock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setBlocked(true)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-red-600 ring-1 ring-red-500/30 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Ban size={14} aria-hidden="true" /> Block
                </button>
              )}
              <button
                type="button"
                onClick={() => setPending({ kind: "supplier" })}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Trash2 size={14} aria-hidden="true" /> Delete supplier
              </button>
            </div>
          </div>
        </section>
      </main>

      {pending && pendingView && (
        <ConfirmDelete
          title={pendingView.title}
          lines={pendingView.lines}
          names={pendingView.names}
          t={t}
          onCancel={() => setPending(null)}
          onConfirm={runDelete}
        />
      )}
    </div>
  );
}

/**
 * One application, whole: the product and its picture, the MOQ, what the supplier wrote and their photos, and the
 * team's side of it, where it stands and the reply the supplier reads beside it, saved as soon as it is pressed.
 */
function ApplicationCard({
  offer: o,
  account,
  lit,
  t,
  tone,
  onSave,
  onDelete,
}: {
  offer: BoardOffer;
  account: BoardAccount;
  /** The application the page was opened at. */
  lit: boolean;
  t: NewSupplierTheme;
  tone: Record<OfferStatus, string>;
  /** Null when saved, or the sentence saying why not. */
  onSave: (change: Change) => Promise<string | null>;
  onDelete: () => void;
}) {
  const [reply, setReply] = useState(o.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const withdrawn = o.status === "WITHDRAWN";
  const picture = getCdnUrl(o.productImage ?? o.photos[0] ?? null, 240);
  const heading = `application-${o.id}-title`;

  const decide = async (s: OfferStatus) => {
    setBusy(true);
    setProblem(await onSave({ status: s }));
    setBusy(false);
  };
  const saveReply = async () => {
    setBusy(true);
    const why = await onSave({ reply });
    setProblem(why);
    setSaved(!why);
    setBusy(false);
  };

  // The contact this application was sent with, where it is not what the account holds now (each application keeps
  // its own; the account remembers the latest).
  const sentWith = (
    [
      ["Name", o.contactName, account.name],
      ["Company", o.companyName, account.companyName],
      ["Mobile", spaced(o.mobile), spaced(account.mobile)],
      ["WeChat ID", o.wechatId, account.wechatId],
      ["Company address", o.companyAddress, account.companyAddress],
    ] as const
  ).filter(([, sent, now]) => sent.trim() !== (now ?? "").trim());

  const label = `mb-2.5 text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`;

  return (
    <article
      id={`application-${o.id}`}
      aria-labelledby={heading}
      className={`min-w-0 scroll-mt-24 overflow-hidden rounded-2xl transition-shadow duration-500 ${lit ? "ring-2 ring-brand" : "ring-1"} ${t.card}`}
    >
      <div className="flex gap-4 p-5 sm:gap-5 sm:p-6">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-24 sm:w-24 ${t.well}`}>
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picture} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <Package size={22} aria-hidden="true" className={t.soft} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[12px] ${t.soft}`}>
            {o.productId === null ? "Their own product, not in the catalogue" : o.categoryName ?? "Catalogue product"} · Sent {stamp(o.createdAt)}
          </p>
          <h3 id={heading} className="mt-1 break-words text-[16px] font-semibold leading-snug tracking-tight sm:text-[17px]">
            {o.productName}
          </h3>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${tone[o.status]}`}>{TEAM_STATUS_LABEL[o.status]}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold tabular-nums ring-1 ${t.chip}`}>MOQ {moqPhrase(o.moq, o.moqUnit)}</span>
            {o.productId !== null && (
              <a
                href={`/products/${o.productId}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-1 rounded text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Open the product <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 border-t lg:grid-cols-2 ${t.border}`}>
        <section className="min-w-0 p-5 sm:p-6" aria-label="Product details">
          <h4 className={label}>Product details</h4>
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{o.details}</p>
          {o.photos.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {o.photos.map((p, i) => (
                <a
                  key={p}
                  href={p}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Photo ${i + 1} of ${o.photos.length}, full size`}
                  className={`block aspect-square overflow-hidden rounded-xl ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.chip}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform hover:scale-105" />
                </a>
              ))}
            </div>
          )}
        </section>

        <section className={`min-w-0 border-t p-5 sm:p-6 lg:border-l lg:border-t-0 ${t.border}`} aria-label="Decision">
          <h4 className={label}>Status</h4>
          {withdrawn ? (
            <p className={`inline-flex rounded-full px-3 py-1.5 text-[13px] font-semibold ${tone.WITHDRAWN}`}>Withdrawn by the supplier</p>
          ) : (
            <div className="flex flex-wrap gap-2 text-[13px]">
              {TEAM_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || o.status === s}
                  onClick={() => void decide(s)}
                  aria-pressed={o.status === s}
                  className={`rounded-full px-3 py-1.5 font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default ${o.status === s ? `${tone[s]} ring-transparent` : t.pill}`}
                >
                  {TEAM_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          <h4 className={`${label} mt-5`}>Reply to the supplier</h4>
          <p className={`text-[12.5px] ${t.soft}`}>They read this beside the status, in My applications.</p>
          <label htmlFor={`reply-${o.id}`} className="sr-only">
            Reply to the supplier about {o.productName}
          </label>
          <textarea
            id={`reply-${o.id}`}
            value={reply}
            onChange={(e) => {
              setSaved(false);
              setReply(e.target.value);
            }}
            maxLength={REPLY_MAX}
            rows={3}
            disabled={withdrawn}
            placeholder={withdrawn ? "The supplier withdrew this application." : "e.g. Please send a sample to our Guangzhou office."}
            className={`mt-2.5 w-full resize-y rounded-xl px-3.5 py-2.5 text-[14px] outline-none ring-1 ring-transparent focus:ring-2 focus:ring-brand disabled:opacity-60 ${t.input}`}
          />
          {/* What the team does with it, in one row: answer, or remove it. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => void saveReply()}
              disabled={busy || withdrawn || reply.trim() === (o.reply ?? "")}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pillOn}`}
            >
              Save reply
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald-600">
                <Check size={14} aria-hidden="true" /> Saved
              </span>
            )}
            {o.reviewedBy && o.reviewedAt && (
              <span className={`text-[12px] ${t.soft}`}>
                Last changed by {o.reviewedBy}, {stamp(o.reviewedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <Trash2 size={14} aria-hidden="true" /> Delete application
            </button>
          </div>
          {problem && (
            <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-600">
              {problem}
            </p>
          )}
        </section>
      </div>

      {sentWith.length > 0 && (
        <section className={`border-t px-5 py-4 sm:px-6 ${t.border}`} aria-label="Contact details sent with this application">
          <h4 className={label}>Sent with these contact details</h4>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {sentWith.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className={`text-[12px] ${t.soft}`}>{k}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px]">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { rupees } from "@/lib/trip-referral-shared";
import {
  CHECK_NOTE_MAX,
  FOLLOWERS_MAX,
  INSTAGRAM_REJECT_REASONS,
  PERSON_STATE_LABEL,
  POSTS_MAX,
  accountDone,
  boardTotals,
  checkLine,
  comparePeople,
  instagramLink,
  personProgress,
  personState,
  type InstagramAccountView,
  type InstagramBoardView,
  type InstagramEventView,
  type InstagramPersonRow,
  type InstagramSettingsView,
  type PersonProgress,
  type PersonState,
} from "@/lib/instagram-task-shared";
import { Ago, Bar, ConfirmWindow, accountWord, card, field, fmtDay, fmtWhen, label, num, pill, pillDark, pillPlain, sendJson, toneClass } from "@/components/instagram/instagram-ui";

/**
 * Everyone in the Instagram task (the owner, 2026-11-23: "hr adha edha full track pani elaraiyum regular check panuvaaru
 * yaaru evalo panirukanga and evalo panitu erukanga live check"; "as a overall admin i see everyone"): HR's board on
 * their staff page, and the console's. Each person's accounts and how far they have got, read again every half minute
 * while the page is in view; a press on someone opens their accounts, to check on Instagram, and their history.
 *
 * `api` is the door it reads and writes through: /api/instagram-task for a tracker's staff session,
 * /api/admin/instagram-task for the console's. `me` is the tracker's own id: their own accounts are never theirs to
 * check (the server refuses too). `admin` gives the prize.
 */

type Tab = "all" | "to_check" | "complete" | "not_started";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "to_check", label: "To check" },
  { key: "complete", label: "Complete" },
  { key: "not_started", label: "Not started" },
];

interface Person extends InstagramPersonRow {
  p: PersonProgress;
  state: PersonState;
}

const inTab = (x: Person, t: Tab) =>
  t === "all" ? true : t === "to_check" ? x.p.toCheck > 0 && !x.prize : t === "complete" ? x.p.complete || !!x.prize : x.p.added === 0;

/** A person's one status word: the brand's colour only where something waits. */
function stateWords(x: Person, admin: boolean): { word: string; className: string } {
  if (x.state === "to_check") return { word: `${x.p.toCheck} to check`, className: "font-semibold text-brand-dark" };
  if (x.state === "complete") return { word: admin ? "Complete: prize to give" : "Complete", className: "font-semibold text-[#1d1d1f]" };
  if (x.state === "prize_given") return { word: "Prize given", className: "text-[#1d1d1f]" };
  return { word: PERSON_STATE_LABEL[x.state], className: "text-[#86868b]" };
}

export function InstagramBoard({ initial, api, me, admin }: { initial: InstagramBoardView; api: string; me: string | null; admin: boolean }) {
  const [board, setBoard] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, InstagramEventView[] | "failed">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [, setTick] = useState(0);
  const seq = useRef(0);
  // Whose panel is open, for a board read that finishes after the press that opened or closed it.
  const openRef = useRef<string | null>(null);
  useEffect(() => {
    openRef.current = openId;
  }, [openId]);
  // The page read again on the server (the console's settings saved, a tracker named) brings a new board with it.
  useEffect(() => setBoard(initial), [initial]);

  const loadHistory = useCallback(
    async (employeeId: string) => {
      try {
        const res = await fetch(`${api}/people/${employeeId}/`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const { events } = (await res.json()) as { events: InstagramEventView[] };
        setHistory((h) => ({ ...h, [employeeId]: events }));
      } catch {
        setHistory((h) => ({ ...h, [employeeId]: h[employeeId] && h[employeeId] !== "failed" ? h[employeeId] : "failed" }));
      }
    },
    [api],
  );

  /** The board read again; an answer overtaken by a later read is dropped. */
  const read = useCallback(async () => {
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const res = await fetch(`${api}/board/`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as InstagramBoardView;
      if (mine === seq.current) {
        setBoard(next);
        setReadFailed(false);
      }
      if (openRef.current) void loadHistory(openRef.current);
    } catch {
      if (mine === seq.current) setReadFailed(true);
    } finally {
      if (mine === seq.current) setRefreshing(false);
    }
  }, [api, loadHistory]);

  // Live (the owner: "live check"): every half minute while the page is in view, and at once when it comes back.
  useEffect(() => {
    const every = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
      else setTick((n) => n + 1);
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [read]);

  const settings = board.settings;
  const people = useMemo<Person[]>(
    () =>
      board.people
        .map((r) => {
          const p = personProgress(r.accounts, settings);
          return { ...r, p, state: personState(p, !!r.prize) };
        })
        .sort(comparePeople),
    [board.people, settings],
  );
  const totals = useMemo(() => boardTotals(people, settings), [people, settings]);
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  const matches = useCallback(
    (x: Person) => !needle || x.name.toLowerCase().includes(needle) || x.email.toLowerCase().includes(needle) || x.accounts.some((a) => a.handle.includes(needle)),
    [needle],
  );
  const shown = people.filter((x) => inTab(x, tab) && matches(x));
  const open = openId ? people.find((x) => x.employeeId === openId) ?? null : null;

  function openPerson(id: string) {
    setError(null);
    setNotice(null);
    setOpenId(id);
    void loadHistory(id);
  }

  async function write(url: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    const sent = await sendJson(url, "POST", body);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error);
      void read();
      return false;
    }
    setNotice(done);
    await read();
    return true;
  }

  async function exportExcel() {
    setExporting(true);
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const N = settings.accountsPerPerson;
      const sheetPeople = [
        ["Employee", "Email", "Status", "Accounts added", `Checked done (of ${N})`, "To check", "Posts (their count)", "Followers (their count)", "Last count", "Prize (₹)", "Prize given on", "Tracker", "Still with AFFHAN"],
        ...people.map((x) => [
          x.name, x.email, stateWords(x, true).word, x.p.added, x.p.done, x.p.toCheck, x.p.posts, x.p.followers, x.p.lastReportAt ? fmtWhen(x.p.lastReportAt) : "",
          x.prize ? x.prize.amount : "", x.prize ? fmtWhen(x.prize.givenAt) : "", x.tracker ? "Yes" : "", x.isActive ? "Yes" : "No",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetPeople), "People");
      const sheetAccounts = [
        ["Employee", "Username", "Link", "Posts (their count)", "Followers (their count)", "Their count on", "Check", "Posts seen", "Followers seen", "Checked by", "Checked on", "Reason", "Done"],
        ...people.flatMap((x) =>
          x.accounts.map((a) => [
            x.name, `@${a.handle}`, instagramLink(a.handle), a.posts, a.followers, fmtWhen(a.reportedAt),
            a.checkState === "checked" ? "Checked" : a.checkState === "rejected" ? "Doesn't count" : "Not checked",
            a.checkedPosts ?? "", a.checkedFollowers ?? "", a.checkedBy ?? "", a.checkedAt ? fmtWhen(a.checkedAt) : "", a.checkState === "rejected" ? (a.checkNote ?? "") : "",
            accountDone(a, settings) ? "Yes" : "",
          ]),
        ),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetAccounts), "Accounts");
      XLSX.writeFile(wb, `instagram-task-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      setError("The export could not be made. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const figures: [string, string][] = [
    ["Taking part", `${num(totals.started)} of ${num(totals.people)}`],
    ["Accounts added", num(totals.accounts)],
    ["Checked done", num(totals.done)],
    ["To check", num(totals.toCheck)],
    ["Complete", num(totals.complete)],
    [totals.toGive > 0 ? "Prizes to give" : "Prizes given", rupees(totals.toGive > 0 ? totals.toGive : totals.given)],
  ];

  return (
    <div className="space-y-5 text-[#1d1d1f]">
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && !open && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0">
            <X size={15} />
          </button>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-black/[0.06] shadow-sm ring-1 ring-black/[0.06] sm:grid-cols-3 xl:grid-cols-6">
        {figures.map(([name, value]) => (
          <div key={name} className="min-w-0 bg-white px-4 py-3">
            <dt className="truncate text-[12px] text-[#6e6e73]">{name}</dt>
            <dd className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <section className={`overflow-hidden ${card}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-black/[0.06] px-5 py-2.5">
          <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const n = people.filter((x) => inTab(x, t.key)).length;
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  className={`${pill} ${on ? "bg-[#1d1d1f] text-white ring-[#1d1d1f]" : "bg-white text-[#1d1d1f] hover:bg-black/[0.03]"}`}
                >
                  {t.label} <span className={`tabular-nums ${on ? "text-white/70" : "text-[#86868b]"}`}>{n}</span>
                </button>
              );
            })}
          </div>
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search people and accounts</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) setQ("");
              }}
              placeholder="Search name, email or @username"
              className="h-8 w-full rounded-full bg-white pl-9 pr-4 text-[13px] text-[#1d1d1f] outline-none ring-1 ring-black/[0.08] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
          <span className="ml-auto text-[12px] text-[#86868b]" aria-live="polite" suppressHydrationWarning>
            {readFailed ? "Couldn't read again: showing the last read" : refreshing ? "Updating…" : `Updated ${timeAgo(board.readAt)}`}
          </span>
          <button type="button" onClick={() => void read()} disabled={refreshing} className={pillPlain}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={() => void exportExcel()} disabled={exporting} className={pillPlain}>
            <Download size={13} /> {exporting ? "Exporting…" : "Export"}
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[#86868b]">
            {people.length === 0 ? "No employees yet." : needle ? "Nobody matches that search." : tab === "to_check" ? "Nothing waits for a check." : "Nobody here yet."}
          </p>
        ) : (
          <>
            {/* A phone reads people, not columns. */}
            <ul className="divide-y divide-black/[0.06] sm:hidden">
              {shown.map((x) => {
                const w = stateWords(x, admin);
                return (
                  <li key={x.employeeId}>
                    <button type="button" onClick={() => openPerson(x.employeeId)} className="block w-full px-5 py-3 text-left transition-colors hover:bg-black/[0.02]">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[15px] font-semibold">{x.name}</span>
                        <span className={`shrink-0 text-[12.5px] ${w.className}`}>{w.word}</span>
                      </span>
                      <span className="mt-1 block text-[12.5px] text-[#48484a]">
                        {x.p.done} of {settings.accountsPerPerson} done · {x.p.added} {x.p.added === 1 ? "account" : "accounts"} · {num(x.p.followers)} followers
                      </span>
                      <span className="mt-2 block">
                        <Bar value={x.p.share} of={1} name={`${x.name}: how far, by their counts`} thin />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-black/[0.06] text-[12px] text-[#86868b]">
                    <th className="py-2.5 pl-5 pr-3 font-medium">Employee</th>
                    <th className="px-3 py-2.5 text-right font-medium">Accounts</th>
                    <th className="px-3 py-2.5 text-right font-medium">Done</th>
                    <th className="px-3 py-2.5 text-right font-medium">Posts</th>
                    <th className="px-3 py-2.5 text-right font-medium">Followers</th>
                    <th className="px-3 py-2.5 font-medium">How far</th>
                    <th className="px-3 py-2.5 font-medium">Last count</th>
                    <th className="py-2.5 pl-3 pr-5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {shown.map((x) => {
                    const w = stateWords(x, admin);
                    return (
                      <tr key={x.employeeId} onClick={() => openPerson(x.employeeId)} className="cursor-pointer transition-colors hover:bg-black/[0.02]">
                        <td className="py-2.5 pl-5 pr-3">
                          <button type="button" onClick={(e) => (e.stopPropagation(), openPerson(x.employeeId))} className="text-left font-medium text-[#0058b0] hover:underline">
                            {x.name}
                          </button>
                          {x.tracker && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-[#48484a]">Tracker</span>}
                          {!x.isActive && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] text-[#6e6e73]">Left</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {x.p.added}
                          <span className="text-[#86868b]"> / {settings.accountsPerPerson}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                          {x.p.done}
                          <span className="font-normal text-[#86868b]"> / {settings.accountsPerPerson}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(x.p.posts)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(x.p.followers)}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="flex w-24 lg:w-36">
                              <Bar value={x.p.share} of={1} name={`${x.name}: how far, by their counts`} thin />
                            </span>
                            <span className="w-9 text-[12px] tabular-nums text-[#48484a]">{Math.round(x.p.share * 100)}%</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[#48484a]">{x.p.lastReportAt ? <Ago iso={x.p.lastReportAt} /> : <span className="text-[#86868b]">–</span>}</td>
                        <td className={`py-2.5 pl-3 pr-5 ${w.className}`}>{w.word}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="border-t border-black/[0.06] px-5 py-2.5 text-[12px] text-[#86868b]">
          Posts, followers and how far are each person&apos;s own counts. Done counts only accounts checked on Instagram.
        </p>
      </section>

      {open && (
        <PersonPanel
          x={open}
          settings={settings}
          me={me}
          admin={admin}
          busy={busy}
          notice={notice}
          error={error}
          history={history[open.employeeId]}
          onClose={() => {
            setOpenId(null);
            setNotice(null);
            setError(null);
          }}
          onCheck={(a, body) => write(`${api}/accounts/${a.id}/check/`, body, `@${a.handle} checked.`)}
          onPrize={(note) => write(`${api}/prize/`, { employeeId: open.employeeId, note }, `${open.name}'s prize is recorded as given.`)}
        />
      )}
    </div>
  );
}

/** One person, in a panel on the right (full width on a phone): their accounts to check, their prize, their history. */
function PersonPanel({
  x,
  settings,
  me,
  admin,
  busy,
  notice,
  error,
  history,
  onClose,
  onCheck,
  onPrize,
}: {
  x: Person;
  settings: InstagramSettingsView;
  me: string | null;
  admin: boolean;
  busy: boolean;
  notice: string | null;
  error: string | null;
  history: InstagramEventView[] | "failed" | undefined;
  onClose: () => void;
  onCheck: (a: InstagramAccountView, body: unknown) => Promise<boolean>;
  onPrize: (note: string | null) => Promise<boolean>;
}) {
  const [checking, setChecking] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const [note, setNote] = useState("");
  const own = me !== null && x.employeeId === me;
  const N = settings.accountsPerPerson;

  // Escape closes the panel, unless a window over it takes the key first (useEscape listens before this).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const figures: [string, string][] = [
    ["Checked done", `${x.p.done} of ${N}`],
    ["Accounts added", `${x.p.added} of ${N}`],
    ["Posts", num(x.p.posts)],
    ["Followers", num(x.p.followers)],
  ];

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-labelledby="ig-person-name">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-black/25" />
      <section className="absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col bg-[#f5f5f7] text-[#1d1d1f] shadow-2xl">
        <header className="border-b border-black/[0.06] bg-white px-5 pb-5 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="ig-person-name" className="text-[19px] font-semibold tracking-tight">
                {x.name}
                {x.tracker && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 align-middle text-[11px] font-normal text-[#48484a]">Tracker</span>}
                {!x.isActive && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 align-middle text-[11px] font-normal text-[#6e6e73]">Left</span>}
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-[#6e6e73]">{x.email}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]">
              <X size={18} />
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-black/[0.06] ring-1 ring-black/[0.06] sm:grid-cols-4">
            {figures.map(([name, value]) => (
              <div key={name} className="bg-white px-4 py-2.5">
                <dt className="text-[12px] text-[#6e6e73]">{name}</dt>
                <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            {x.prize ? (
              <span className="font-semibold">
                Prize given: {rupees(x.prize.amount)}, {fmtWhen(x.prize.givenAt)} by {x.prize.givenBy}
                {x.prize.note && <span className="font-normal text-[#48484a]"> · {x.prize.note}</span>}
              </span>
            ) : x.p.complete ? (
              admin ? (
                <button type="button" disabled={busy} onClick={() => setGiving(true)} className={`${pillDark} h-9 px-4 text-[13px]`}>
                  Give prize {rupees(settings.prizeRupees)}
                </button>
              ) : (
                <span className="font-semibold">Complete: the admin gives the {rupees(settings.prizeRupees)} prize.</span>
              )
            ) : (
              <span className="text-[#48484a]">
                Prize {rupees(settings.prizeRupees)} when all {N} accounts are checked done.
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {error && (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-800">
              {notice}
            </p>
          )}

          <section className={`overflow-hidden ${card}`}>
            <h3 className="border-b border-black/[0.06] px-5 py-3 text-[15px] font-semibold">
              Accounts{" "}
              <span className="font-normal tabular-nums text-[#86868b]">
                {x.accounts.length} of {N}
              </span>
            </h3>
            {x.accounts.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-[#86868b]">No accounts added yet.</p>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {x.accounts.map((a) => {
                  const w = accountWord(a, settings, "To check");
                  return (
                    <li key={a.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <a
                          href={instagramLink(a.handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-[#0058b0] hover:underline"
                        >
                          <span className="truncate">@{a.handle}</span>
                          <ExternalLink size={13} aria-hidden className="shrink-0" />
                          <span className="sr-only">(opens Instagram)</span>
                        </a>
                        {w && <span className={`text-[13px] ${toneClass[w.tone]}`}>{w.word}</span>}
                      </div>
                      <dl className="mt-2 grid gap-1 text-[13px] sm:grid-cols-[6.5rem_minmax(0,1fr)]">
                        <dt className="text-[#6e6e73]">Their count</dt>
                        <dd className="tabular-nums">
                          {num(a.posts)} posts · {num(a.followers)} followers · <Ago iso={a.reportedAt} />
                        </dd>
                        <dt className="text-[#6e6e73]">Check</dt>
                        <dd className={a.checkState === "rejected" ? "font-medium text-red-700" : undefined}>
                          {checkLine(a, settings, fmtDay)}
                          {a.checkedBy && <span className="font-normal text-[#86868b]"> · {a.checkedBy}</span>}
                        </dd>
                      </dl>
                      {checking === a.id ? (
                        <CheckForm
                          a={a}
                          busy={busy}
                          onCancel={() => setChecking(null)}
                          onSave={async (body) => {
                            if (await onCheck(a, body)) setChecking(null);
                          }}
                        />
                      ) : x.prize ? null : own ? (
                        <p className="mt-2.5 text-[12.5px] text-[#86868b]">Your own: an admin or another tracker checks it.</p>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => setChecking(a.id)} className={`${pillPlain} mt-3 h-9 px-4 text-[13px]`}>
                          Check on Instagram
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={`overflow-hidden ${card}`}>
            <h3 className="border-b border-black/[0.06] px-5 py-3 text-[15px] font-semibold">History</h3>
            {history === undefined ? (
              <p className="px-5 py-6 text-center text-[13px] text-[#86868b]">Reading…</p>
            ) : history === "failed" ? (
              <p className="px-5 py-6 text-center text-[13px] text-red-700">The history could not be read. Refresh to try again.</p>
            ) : history.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-[#86868b]">Nothing yet.</p>
            ) : (
              <ol className="divide-y divide-black/[0.06]">
                {history.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 px-5 py-2.5 text-[13px] sm:flex-row sm:gap-4">
                    <span className="shrink-0 tabular-nums text-[#86868b] sm:w-32">{fmtWhen(e.at)}</span>
                    <span className="min-w-0">{eventWords(e)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>

      {giving && (
        <ConfirmWindow
          title={`Give ${x.name} the ${rupees(settings.prizeRupees)} prize?`}
          confirm="Record prize given"
          working="Recording…"
          busy={busy}
          onCancel={() => setGiving(false)}
          onConfirm={async () => {
            if (await onPrize(note.trim() || null)) {
              setGiving(false);
              setNote("");
            }
          }}
        >
          <p>
            All {N} of their accounts are checked done. This records the prize as given today, by you. Their accounts can&apos;t be changed or
            checked again after it.
          </p>
          <label className={`block ${label}`}>
            Note <span className="font-normal text-[#86868b]">(optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="Paid in cash on…" className={`mt-1 ${field}`} />
          </label>
        </ConfirmWindow>
      )}
    </div>
  );
}

/** What a check says: what Instagram shows (typed, never filled in from the employee's own count), or why it doesn't count. */
function CheckForm({ a, busy, onCancel, onSave }: { a: InstagramAccountView; busy: boolean; onCancel: () => void; onSave: (body: unknown) => void }) {
  const [mode, setMode] = useState<"seen" | "rejected">("seen");
  const [posts, setPosts] = useState("");
  const [followers, setFollowers] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, String(max).length);
  const ok = (v: string, max: number) => /^\d+$/.test(v) && Number(v) <= max;
  const seenValid = ok(posts, POSTS_MAX) && ok(followers, FOLLOWERS_MAX);
  const why = reason === "Other" ? other.trim() : reason;
  return (
    <div className="mt-3 rounded-xl bg-[#f5f5f7] p-4">
      <p className="text-[13px] text-[#48484a]">
        Open{" "}
        <a href={instagramLink(a.handle)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0058b0] hover:underline">
          @{a.handle} on Instagram
        </a>
        , then write what it shows there now.
      </p>
      {mode === "seen" ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (seenValid && !busy) onSave({ state: "checked", posts: Number(posts), followers: Number(followers) });
          }}
        >
          <label className={`${label} w-32`}>
            Posts seen
            <input autoFocus inputMode="numeric" value={posts} onChange={(e) => setPosts(digits(e.target.value, POSTS_MAX))} className={`mt-1 ${field}`} />
          </label>
          <label className={`${label} w-36`}>
            Followers seen
            <input inputMode="numeric" value={followers} onChange={(e) => setFollowers(digits(e.target.value, FOLLOWERS_MAX))} className={`mt-1 ${field}`} />
          </label>
          <button type="submit" disabled={!seenValid || busy} className={`${pillDark} h-10 px-4 text-[13px]`}>
            {busy ? "Saving…" : "Save check"}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("rejected")} className={`${pillPlain} h-10 px-4 text-[13px]`}>
            Doesn&apos;t count…
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className={`${pillPlain} h-10 px-4 text-[13px]`}>
            Cancel
          </button>
        </form>
      ) : (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (why && !busy) onSave({ state: "rejected", note: why });
          }}
        >
          <p className={label}>Why doesn&apos;t it count?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...INSTAGRAM_REJECT_REASONS, "Other"].map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={`${pill} h-9 px-3.5 text-[13px] ${reason === r ? "bg-[#1d1d1f] text-white ring-[#1d1d1f]" : "bg-white text-[#1d1d1f] hover:bg-black/[0.03]"}`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "Other" && (
            <label className={`mt-3 block ${label}`}>
              The reason
              <input autoFocus value={other} onChange={(e) => setOther(e.target.value.slice(0, CHECK_NOTE_MAX))} className={`mt-1 ${field}`} />
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={!why || busy} className={`${pillDark} h-10 px-4 text-[13px]`}>
              {busy ? "Saving…" : "Save: doesn't count"}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("seen")} className={`${pillPlain} h-10 px-4 text-[13px]`}>
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** One line of a person's history, in words. */
function eventWords(e: InstagramEventView): React.ReactNode {
  const at = <span className="font-semibold">@{e.handle}</span>;
  const counts = `${num(e.posts ?? 0)} posts, ${num(e.followers ?? 0)} followers`;
  switch (e.kind) {
    case "ADDED":
      return (
        <>
          {e.byName} added {at} ({counts})
        </>
      );
    case "REPORTED":
      return (
        <>
          {e.byName} updated {at}: {counts}
        </>
      );
    case "CHECKED":
      return (
        <>
          {e.byName} checked {at} on Instagram: {counts}
        </>
      );
    case "REJECTED":
      return (
        <>
          {e.byName} marked {at} as not counting: <span className="text-red-700">{e.note}</span>
        </>
      );
    case "RENAMED":
      return (
        <>
          {e.byName} changed @{e.note} to {at}
        </>
      );
    case "REMOVED":
      return (
        <>
          {e.byName} removed {at}
        </>
      );
    default:
      return (
        <>
          {e.byName}: {at}
        </>
      );
  }
}

export default InstagramBoard;

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, UserPlus, X } from "lucide-react";
import { CargoDatePicker } from "@/components/cargo/CargoDatePicker";
import { InstagramBoard } from "@/components/instagram/InstagramBoard";
import { card, field, fmtWhen, pillDark, pillPlain, sendJson, useEscape } from "@/components/instagram/instagram-ui";
import { istDate, istLastDay, rupees } from "@/lib/trip-referral-shared";
import { INSTAGRAM_DEFAULTS, instagramTaskLine, type InstagramBoardView, type InstagramSettingsView } from "@/lib/instagram-task-shared";

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

/**
 * Team → Instagram task (the owner, 2026-11-23: "enaku nama admin la creat pani kudu new feature new task"; "as a overall
 * admin i see everyone"): the task's settings, who checks everyone's accounts besides the admins (HR: "hr track pana
 * maari access kudu"), and everyone, as HR's board shows them, with the prize to give. Its own page and its own tables,
 * apart from the Free China Trip's Employee tasks ("dont merge this task to employee task of china trip").
 */
export function InstagramTaskConsole({ board }: { board: InstagramBoardView }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const trackers = board.people.filter((p) => p.tracker);
  const candidates = board.people.filter((p) => p.isActive && !p.tracker);

  async function write(url: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const sent = await sendJson(url, "POST", body);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error);
      return false;
    }
    setNotice(done);
    startRefresh(() => router.refresh());
    return true;
  }

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/admin/employees/"
            aria-label="Back to Staff"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-[min(100%,15rem)] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Instagram task</h1>
            <p className="text-[13px] text-[#86868b]">{instagramTaskLine(board.settings)} · every employee, HR too</p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0">
              <X size={15} />
            </button>
          </div>
        )}

        <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SettingsCard
            settings={board.settings}
            busy={busy || refreshing}
            onSave={(s) => write("/api/admin/instagram-task/settings/", s, "The task's settings are saved.")}
          />

          <section className={`p-5 ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Who checks</h2>
              <button type="button" disabled={busy || refreshing || candidates.length === 0} onClick={() => setPicking(true)} className={pillPlain}>
                <UserPlus size={14} /> Give access
              </button>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#6e6e73]">
              They see everyone&apos;s accounts on their Instagram task page and check them on Instagram. They take part too: their own accounts are
              checked by an admin or another tracker.
            </p>
            {trackers.length === 0 ? (
              <p className="mt-4 text-[13px] text-[#86868b]">Nobody yet. Only the admins check accounts.</p>
            ) : (
              <ul className="mt-3 divide-y divide-black/[0.06]">
                {trackers.map((t) => (
                  <li key={t.employeeId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{t.name}</span>
                      <span className="block truncate text-[12.5px] text-[#86868b]">{t.email}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy || refreshing}
                      onClick={() => void write("/api/admin/instagram-task/trackers/", { employeeId: t.employeeId, tracker: false }, `${t.name} no longer checks accounts.`)}
                      className={pillPlain}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <InstagramBoard initial={board} api="/api/admin/instagram-task" me={null} admin />
      </div>

      {picking && (
        <PickWindow
          people={candidates}
          busy={busy}
          onCancel={() => setPicking(false)}
          onPick={async (p) => {
            if (await write("/api/admin/instagram-task/trackers/", { employeeId: p.employeeId, tracker: true }, `${p.name} now checks everyone's accounts.`)) setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function SettingsCard({ settings, busy, onSave }: { settings: InstagramSettingsView; busy: boolean; onSave: (s: unknown) => Promise<boolean> }) {
  const initial = useMemo(
    () => ({
      enabled: settings.enabled,
      accounts: String(settings.accountsPerPerson),
      posts: String(settings.postsPerAccount),
      followers: String(settings.followersPerAccount),
      prize: String(settings.prizeRupees),
      startDay: settings.startsAt ? istDate(settings.startsAt) : "",
      endDay: settings.endsAt ? istLastDay(settings.endsAt) : "",
    }),
    [settings],
  );
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const n = (v: string) => (/^\d+$/.test(v) ? Number(v) : NaN);
  const d = INSTAGRAM_DEFAULTS;

  return (
    <section className={`p-5 ${card}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">The task</h2>
        <button type="button" role="switch" aria-checked={form.enabled} onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))} className="inline-flex items-center gap-2 text-[13px] font-medium">
          <span className={`relative h-6 w-11 rounded-full transition-colors ${form.enabled ? "bg-emerald-500" : "bg-black/20"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${form.enabled ? "left-[22px]" : "left-0.5"}`} />
          </span>
          {form.enabled ? "On: employees add and update accounts" : "Off: accounts can't be changed; checks go on"}
        </button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["accounts", "Accounts each", 2],
            ["posts", "Posts per account", 6],
            ["followers", "Followers per account", 8],
            ["prize", "Prize (₹)", 8],
          ] as const
        ).map(([key, name, len]) => (
          <label key={key} className="text-[13px] font-medium">
            {name}
            <input inputMode="numeric" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, "").slice(0, len) }))} className={`mt-1 ${field}`} />
          </label>
        ))}
        <div className="text-[13px] font-medium">
          First day
          <div className="mt-1">
            <CargoDatePicker value={form.startDay} onChange={(v) => setForm((f) => ({ ...f, startDay: v }))} ariaLabel="The task's first day" placeholder="Any day" />
          </div>
        </div>
        <div className="text-[13px] font-medium">
          Last day
          <div className="mt-1">
            <CargoDatePicker value={form.endDay} onChange={(v) => setForm((f) => ({ ...f, endDay: v }))} ariaLabel="The task's last day" placeholder="No end" />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#86868b]">
          {settings.changedBy && settings.updatedAt
            ? `Saved by ${settings.changedBy}, ${fmtWhen(settings.updatedAt)}`
            : `Not saved yet: ${d.accountsPerPerson} accounts, ${d.postsPerAccount} posts and ${d.followersPerAccount.toLocaleString("en-IN")} followers each, ${rupees(d.prizeRupees)}`}
        </p>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() =>
            void onSave({
              enabled: form.enabled,
              accountsPerPerson: n(form.accounts),
              postsPerAccount: n(form.posts),
              followersPerAccount: n(form.followers),
              prizeRupees: n(form.prize),
              startDay: form.startDay,
              endDay: form.endDay,
            })
          }
          className={`${pillDark} px-5`}
        >
          {busy && dirty ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

/** Give an employee the tracker's access: the console's own list, found by name or email. */
function PickWindow({
  people,
  busy,
  onCancel,
  onPick,
}: {
  people: InstagramBoardView["people"];
  busy: boolean;
  onCancel: () => void;
  onPick: (p: InstagramBoardView["people"][number]) => void;
}) {
  const [q, setQ] = useState("");
  useEscape(onCancel, busy);
  const needle = q.trim().toLowerCase();
  const shown = people.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle));
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ig-pick-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <div className="px-6 pt-6">
          <h2 id="ig-pick-title" className="text-[17px] font-semibold">
            Who checks everyone&apos;s accounts?
          </h2>
          <p className="mt-1 text-[13px] text-[#48484a]">HR, usually. They see everyone on their own Instagram task page.</p>
          <label className="relative mt-4 block">
            <span className="sr-only">Find an employee</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" className={`${field} pl-9`} />
          </label>
        </div>
        <ul className="mt-3 min-h-0 flex-1 divide-y divide-black/[0.06] overflow-y-auto px-2 pb-2">
          {shown.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-[#86868b]">Nobody matches.</li>
          ) : (
            shown.map((p) => (
              <li key={p.employeeId}>
                <button type="button" disabled={busy} onClick={() => onPick(p)} className="block w-full rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-black/[0.03] disabled:opacity-50">
                  <span className="block truncate text-[14px] font-medium">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-[#86868b]">{p.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end border-t border-black/[0.06] px-6 py-3">
          <button type="button" disabled={busy} onClick={onCancel} className={`${pillPlain} h-9 px-4`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default InstagramTaskConsole;

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, Plus } from "lucide-react";
import {
  FOLLOWERS_MAX,
  PASSWORD_MAX,
  POSTS_MAX,
  checkLine,
  handleFromInputs,
  instagramLink,
  instagramTaskRunning,
  parseInstagramHandle,
  passwordProblem,
  personProgress,
  type InstagramAccountView,
  type InstagramPrizeView,
  type InstagramSettingsView,
} from "@/lib/instagram-task-shared";
import { rupees } from "@/lib/trip-referral-shared";
import { Ago, Bar, ConfirmWindow, accountWord, card, field, fmtDay, label, num, pillDark, pillPlain, sendJson, toneClass } from "@/components/instagram/instagram-ui";

/**
 * An employee's own Instagram task (the owner, 2026-11-23): their accounts, what each shows by their count, what HR saw
 * when they checked it, and how far they are from the prize. They add an account by its username or its profile's
 * link, keep its counts up to date (each new count asks HR to look again), change its username when they change it on
 * Instagram, or take it out. Every press writes through /api/instagram-task/ and reads the page again
 * (router.refresh), so what shows is always what is stored.
 */
export function InstagramMine({
  settings,
  accounts,
  prize,
  tracker,
}: {
  settings: InstagramSettingsView;
  accounts: InstagramAccountView[];
  prize: InstagramPrizeView | null;
  tracker: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; what: "counts" | "handle" } | null>(null);
  const [removing, setRemoving] = useState<InstagramAccountView | null>(null);
  const [adding, setAdding] = useState(false);

  const running = instagramTaskRunning(settings);
  const p = personProgress(accounts, settings);
  const N = settings.accountsPerPerson;
  const canChange = running && !prize;
  const room = accounts.length < N;

  /** A write, then the page read again; the refusal in its own words. */
  async function run(write: () => ReturnType<typeof sendJson>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const sent = await write();
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error);
      // A lapsed session: reading the page again takes them to the sign-in (the workspace's layout).
      if (sent.status === 401 || sent.status === 409) startRefresh(() => router.refresh());
      return false;
    }
    startRefresh(() => router.refresh());
    return true;
  }

  const prizeLine = prize
    ? `${rupees(prize.amount)} given on ${fmtDay(prize.givenAt)}${prize.note ? ` · ${prize.note}` : ""}`
    : p.complete
      ? `Complete: all ${N} are checked done. The office gives you your ${rupees(settings.prizeRupees)}.`
      : `${rupees(settings.prizeRupees)} once all ${N} accounts are checked done.`;

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <section className={`p-5 ${card}`}>
        <p className="text-[13px] font-medium text-[#48484a]">Your progress</p>
        <p className="mt-1 text-[15px] font-semibold">
          <span className="text-[28px] font-bold tabular-nums">{p.done}</span>
          <span className="text-[#86868b]">
            {" "}
            / {N} {N === 1 ? "account" : "accounts"} done
          </span>
        </p>
        <div className="mt-3">
          <Bar value={p.done} of={N} name={`Accounts checked done, of ${N}`} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Accounts added", `${p.added} of ${N}`],
              ["Posts", num(p.posts)],
              ["Followers", num(p.followers)],
              ["Waiting for HR", num(p.toCheck)],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="rounded-xl bg-[#f5f5f7] px-3.5 py-2.5">
              <dt className="text-[12.5px] text-[#48484a]">{name}</dt>
              <dd className="mt-0.5 text-[19px] font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-4 text-[14px] ${prize || p.complete ? "font-semibold text-[#1d1d1f]" : "text-[#48484a]"}`}>
          <span className="font-semibold">Prize:</span> {prizeLine}
        </p>
      </section>

      <section className={`overflow-hidden ${card}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.06] px-5 py-3">
          <h2 className="text-[15px] font-semibold">
            Your accounts{" "}
            <span className="font-normal tabular-nums text-[#86868b]">
              {accounts.length} of {N}
            </span>
          </h2>
          {canChange && room && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={`${pillDark} ml-auto h-9 px-4 text-[13px]`}>
              <Plus size={15} /> Add account
            </button>
          )}
        </div>

        {accounts.length === 0 && !adding && (
          <p className="px-5 py-8 text-center text-[14px] text-[#48484a]">
            No accounts yet. Make {N} new Instagram {N === 1 ? "account" : "accounts"} and add each one here.
          </p>
        )}

        <ul className="divide-y divide-black/[0.06]">
          {accounts.map((a) => (
            <AccountItem
              key={a.id}
              a={a}
              settings={settings}
              canChange={canChange}
              busy={busy || refreshing}
              editing={editing?.id === a.id ? editing.what : null}
              onEdit={(what) => {
                setError(null);
                setEditing(what ? { id: a.id, what } : null);
              }}
              onRemove={() => setRemoving(a)}
              onSaveCounts={async (posts, followers) => {
                if (await run(() => sendJson(`/api/instagram-task/accounts/${a.id}/`, "PATCH", { posts, followers }))) setEditing(null);
              }}
              onSaveHandle={async (handle) => {
                if (await run(() => sendJson(`/api/instagram-task/accounts/${a.id}/`, "PATCH", { handle }))) setEditing(null);
              }}
              onSavePassword={(password) => run(() => sendJson(`/api/instagram-task/accounts/${a.id}/`, "PATCH", { password }))}
            />
          ))}
        </ul>

        {canChange && room && adding && (
          <AddForm
            n={accounts.length + 1}
            of={N}
            busy={busy || refreshing}
            onCancel={() => {
              setAdding(false);
              setError(null);
            }}
            onAdd={async (v) => {
              if (await run(() => sendJson("/api/instagram-task/accounts/", "POST", v))) setAdding(false);
            }}
          />
        )}
      </section>

      <section className="px-1 text-[13px] leading-relaxed text-[#48484a]">
        <h2 className="text-[14px] font-semibold text-[#1d1d1f]">How it is checked</h2>
        <p className="mt-1">
          HR opens each account on Instagram and writes down the posts and followers it shows. An account is done once HR has
          seen {num(settings.postsPerAccount)} posts and {num(settings.followersPerAccount)} followers on it, and the prize is
          given when all {N} are done. Keep your counts here up to date: each new count asks HR to look again.
          {tracker && " Your own accounts are checked by an admin or another tracker, never by you."}
        </p>
        {!running && !prize && <p className="mt-2 font-semibold text-red-700">The task is closed: accounts can&apos;t be added or changed now. HR can still check them.</p>}
      </section>

      {removing && (
        <ConfirmWindow
          title={`Remove @${removing.handle}?`}
          confirm="Remove"
          working="Removing…"
          danger
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            if (await run(() => sendJson(`/api/instagram-task/accounts/${removing.id}/`, "DELETE"))) setRemoving(null);
          }}
        >
          <p>It leaves your accounts, with its counts{removing.checkState ? " and HR's check" : ""}. You can add another account in its place.</p>
        </ConfirmWindow>
      )}
    </div>
  );
}

/** Digits only, as typed into a count. */
const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, String(max).length);
const countOk = (v: string, max: number) => /^\d+$/.test(v) && Number(v) <= max;

function AccountItem({
  a,
  settings,
  canChange,
  busy,
  editing,
  onEdit,
  onRemove,
  onSaveCounts,
  onSaveHandle,
  onSavePassword,
}: {
  a: InstagramAccountView;
  settings: InstagramSettingsView;
  canChange: boolean;
  busy: boolean;
  editing: "counts" | "handle" | null;
  onEdit: (what: "counts" | "handle" | null) => void;
  onRemove: () => void;
  onSaveCounts: (posts: number, followers: number) => void;
  onSaveHandle: (handle: string) => void;
  onSavePassword: (password: string) => Promise<boolean>;
}) {
  const word = accountWord(a, settings, "Waiting for HR");
  const [posts, setPosts] = useState(String(a.posts));
  const [followers, setFollowers] = useState(String(a.followers));
  const [handle, setHandle] = useState(a.handle);
  const parsed = parseInstagramHandle(handle);
  const countsValid = countOk(posts, POSTS_MAX) && countOk(followers, FOLLOWERS_MAX);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href={instagramLink(a.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 text-[16px] font-semibold text-[#0058b0] hover:underline"
        >
          <span className="truncate">@{a.handle}</span>
          <ExternalLink size={14} aria-hidden className="shrink-0" />
          <span className="sr-only">(opens Instagram)</span>
        </a>
        {word && <span className={`text-[13px] ${toneClass[word.tone]}`}>{word.word}</span>}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-6">
        {(
          [
            ["Posts", a.posts, settings.postsPerAccount],
            ["Followers", a.followers, settings.followersPerAccount],
          ] as const
        ).map(([name, value, of]) => (
          <div key={name}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-[#48484a]">{name}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{num(value)}</span>
                <span className="text-[#86868b]"> / {num(of)}</span>
              </span>
            </div>
            <div className="mt-1.5">
              <Bar value={value} of={of} name={`@${a.handle}: ${name.toLowerCase()} by your count`} thin />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#48484a]">
        Your count: <Ago iso={a.reportedAt} />
        {" · "}
        <span className={a.checkState === "rejected" ? "font-medium text-red-700" : undefined}>{checkLine(a, settings, fmtDay)}</span>
        {a.checkedBy && <span className="text-[#86868b]"> ({a.checkedBy})</span>}
      </p>
      {/* Its password: saved or not, and Change, open even once the task closes (it is about keeping the account). */}
      {editing === null && <PasswordLine a={a} busy={busy} onSave={onSavePassword} />}

      {editing === "counts" ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (countsValid && !busy) onSaveCounts(Number(posts), Number(followers));
          }}
        >
          <label className={`${label} w-32`}>
            Posts now
            <input autoFocus inputMode="numeric" value={posts} onChange={(e) => setPosts(digits(e.target.value, POSTS_MAX))} className={`mt-1 ${field}`} />
          </label>
          <label className={`${label} w-36`}>
            Followers now
            <input inputMode="numeric" value={followers} onChange={(e) => setFollowers(digits(e.target.value, FOLLOWERS_MAX))} className={`mt-1 ${field}`} />
          </label>
          <button type="submit" disabled={!countsValid || busy} className={`${pillDark} h-10 px-4 text-[13px]`}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={busy} onClick={() => onEdit(null)} className={`${pillPlain} h-10 px-4 text-[13px]`}>
            Cancel
          </button>
        </form>
      ) : editing === "handle" ? (
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed && !busy) onSaveHandle(parsed);
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} min-w-[14rem] flex-1 sm:max-w-sm`}>
              New username
              <input autoFocus value={handle} onChange={(e) => setHandle(e.target.value.slice(0, 200))} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`mt-1 ${field}`} />
            </label>
            <button type="submit" disabled={!parsed || parsed === a.handle || busy} className={`${pillDark} h-10 px-4 text-[13px]`}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" disabled={busy} onClick={() => onEdit(null)} className={`${pillPlain} h-10 px-4 text-[13px]`}>
              Cancel
            </button>
          </div>
          <p className="mt-1.5 text-[12.5px] text-[#48484a]">
            Only when you changed it on Instagram. HR checks the account again under its new name.
            {handle.trim() && !parsed && <span className="font-medium text-red-700"> That is not an Instagram username.</span>}
          </p>
        </form>
      ) : (
        canChange && (
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Each opens on what is stored now, never on what was typed into it last time. */}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPosts(String(a.posts));
                setFollowers(String(a.followers));
                onEdit("counts");
              }}
              className={`${pillDark} h-9 px-4 text-[13px]`}
            >
              Update counts
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setHandle(a.handle);
                onEdit("handle");
              }}
              className={`${pillPlain} h-9 px-4 text-[13px]`}
            >
              Change username
            </button>
            <button type="button" disabled={busy} onClick={onRemove} className={`${pillPlain} h-9 px-4 text-[13px]`}>
              Remove
            </button>
          </div>
        )
      )}
    </li>
  );
}

/** What every password field here says, under it. */
const PASSWORD_NOTE = "Only the admin can see it. Use a password made for this account, never one you use anywhere else.";

/**
 * A password box with Show and Hide. Never filled in by the browser from the staff sign-in (new-password, a name of its
 * own), never sent back by the server: what the admin reads, they read in the console's vault.
 */
function PasswordField({ id, value, onChange, autoFocus = false }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative mt-1 block">
      <input
        id={id}
        name={id}
        type={shown ? "text" : "password"}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, PASSWORD_MAX))}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${field} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide the password" : "Show the password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-[#6e6e73] hover:text-[#1d1d1f]"
      >
        {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </span>
  );
}

/**
 * Adding an account (the owner, 2026-11-24: "give usernam and account password entry and url option"): its username,
 * its profile's link (either fills the other; both must name the same account), its password, and what it shows now.
 */
function AddForm({
  n,
  of,
  busy,
  onCancel,
  onAdd,
}: {
  n: number;
  of: number;
  busy: boolean;
  onCancel: () => void;
  onAdd: (v: { username: string; link: string; password: string; posts: number; followers: number }) => void;
}) {
  const [username, setUsername] = useState("");
  // Filled in from the link until the employee types a username of their own.
  const [userFromLink, setUserFromLink] = useState(true);
  const [link, setLink] = useState("");
  const [password, setPassword] = useState("");
  const [posts, setPosts] = useState("0");
  const [followers, setFollowers] = useState("0");
  const named = handleFromInputs(username, link);
  const typedSomething = !!(username.trim() || link.trim());
  const passwordWrong = password ? passwordProblem(password) : null;
  const valid = "handle" in named && !passwordProblem(password) && countOk(posts, POSTS_MAX) && countOk(followers, FOLLOWERS_MAX);
  return (
    <form
      className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-4"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onAdd({ username, link, password, posts: Number(posts), followers: Number(followers) });
      }}
    >
      <h3 className="text-[14px] font-semibold">
        Add account {n} of {of}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Username
          <span className="relative mt-1 block">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-[#86868b]">
              @
            </span>
            <input
              autoFocus
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/^@+/, "").slice(0, 200));
                setUserFromLink(false);
              }}
              placeholder="affhan.finds"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${field} pl-7`}
            />
          </span>
        </label>
        <label className={label}>
          Profile link
          <input
            value={link}
            onChange={(e) => {
              const v = e.target.value.slice(0, 300);
              setLink(v);
              const fromLink = parseInstagramHandle(v);
              if (fromLink && (userFromLink || !username.trim())) {
                setUsername(fromLink);
                setUserFromLink(true);
              }
            }}
            placeholder="instagram.com/affhan.finds"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`mt-1 ${field}`}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
        <div className={label}>
          <label htmlFor="instagram-account-password">Instagram password</label>
          <PasswordField id="instagram-account-password" value={password} onChange={setPassword} />
        </div>
        <label className={label}>
          Posts now
          <input inputMode="numeric" value={posts} onChange={(e) => setPosts(digits(e.target.value, POSTS_MAX))} className={`mt-1 ${field}`} />
        </label>
        <label className={label}>
          Followers now
          <input inputMode="numeric" value={followers} onChange={(e) => setFollowers(digits(e.target.value, FOLLOWERS_MAX))} className={`mt-1 ${field}`} />
        </label>
      </div>
      <div className="mt-2.5 space-y-1 text-[12.5px] leading-relaxed text-[#48484a]">
        <p>
          {"handle" in named ? (
            <>
              Adds <span className="font-semibold text-[#1d1d1f]">@{named.handle}</span>
              {" · "}
              <a href={instagramLink(named.handle)} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0058b0] hover:underline">
                Open it on Instagram to check
              </a>
            </>
          ) : typedSomething ? (
            <span className="font-medium text-red-700">{named.error}</span>
          ) : (
            "Type the username, or paste the link: on Instagram, your profile, Share profile, Copy link."
          )}
        </p>
        <p className={passwordWrong ? "font-medium text-red-700" : undefined}>{passwordWrong ?? PASSWORD_NOTE}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={!valid || busy} className={`${pillDark} h-10 px-5 text-[13px]`}>
          {busy ? "Adding…" : "Add account"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={`${pillPlain} h-10 px-4 text-[13px]`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** An account's password, as its owner sees it: when it was saved, never what it is, and Change. */
function PasswordLine({ a, busy, onSave }: { a: InstagramAccountView; busy: boolean; onSave: (password: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const wrong = password ? passwordProblem(password) : null;
  const fieldId = `instagram-password-${a.id}`;
  if (!editing) {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#48484a]">
        <span>
          Password:{" "}
          {a.passwordSetAt ? (
            <>
              saved <Ago iso={a.passwordSetAt} />
            </>
          ) : (
            <span className="font-semibold text-brand-dark">not given yet</span>
          )}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPassword("");
            setEditing(true);
          }}
          className="font-semibold text-[#0058b0] hover:underline disabled:opacity-50"
        >
          {a.passwordSetAt ? "Change password" : "Add password"}
        </button>
      </p>
    );
  }
  return (
    <form
      className="mt-3"
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || passwordProblem(password)) return;
        if (await onSave(password)) {
          setEditing(false);
          setPassword("");
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className={`${label} min-w-[14rem] flex-1 sm:max-w-sm`}>
          <label htmlFor={fieldId}>{a.passwordSetAt ? "New Instagram password" : "Instagram password"}</label>
          <PasswordField id={fieldId} value={password} onChange={setPassword} autoFocus />
        </div>
        <button type="submit" disabled={!!passwordProblem(password) || busy} className={`${pillDark} h-10 px-4 text-[13px]`}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className={`${pillPlain} h-10 px-4 text-[13px]`}>
          Cancel
        </button>
      </div>
      <p className={`mt-1.5 text-[12.5px] ${wrong ? "font-medium text-red-700" : "text-[#48484a]"}`}>{wrong ?? PASSWORD_NOTE}</p>
    </form>
  );
}

export default InstagramMine;

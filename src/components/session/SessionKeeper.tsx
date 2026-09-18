"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LogOut } from "lucide-react";
import {
  announce,
  armSessionKeeper,
  isSigningOut,
  openSessionChannel,
  sessionRequest,
  signOutThrough,
  type SessionMessage,
  type SessionRole,
} from "@/lib/session-client";

/**
 * Keeps a session alive while somebody works, warns before it lapses, and keeps
 * every tab of it in step. One component for the console and the workspace:
 * they are the same problem with different addresses.
 *
 * Nothing here ends a session. The thirty-minute rule is enforced on the
 * server against the timestamp the server signed (lib/session.ts,
 * lib/employee-session.ts); this only does what a page is in a position to do:
 *
 *   - While somebody is working, touch the session so the window slides —
 *     throttled to once a minute however busy the mouse is.
 *   - Two minutes before the window closes, say so, with a countdown and a
 *     button, instead of letting the next click land on a login page. Once the
 *     warning is up, only an explicit choice extends: a stray mouse movement
 *     from somebody walking past the desk should not.
 *   - Tell the session's other tabs. Working in one tab pushes the window back
 *     for all of them, so none of them warns about a timeout that has already
 *     moved; signing out in one signs out the rest at once.
 *   - When the window has closed, go to the login page and say why.
 *
 * The countdown runs on durations the server reports, measured from when each
 * answer arrived — never on the server's clock compared with this PC's — so a
 * machine whose clock is off by minutes still warns on time.
 */

const CONFIG: Record<SessionRole, { endpoint: string; logout: string; login: string }> = {
  admin: { endpoint: "/api/admin/session/", logout: "/api/auth/logout/", login: "/admin/login/" },
  staff: { endpoint: "/api/employee/auth/session/", logout: "/api/employee/auth/logout/", login: "/employee/login/" },
};

/** Where to send somebody, and what the login page should tell them. */
function loginFor(role: SessionRole, reason: string | undefined): string {
  const base = CONFIG[role].login;
  if (reason === "idle_expired") return `${base}?expired=1`;
  if (role === "staff") return reason === "deactivated" ? `${base}?disabled=1` : `${base}?signedout=1`;
  return base;
}

/** At most one keep-alive per minute, however much activity there is. */
const TOUCH_INTERVAL_MS = 60 * 1000;
/** How often an open tab asks whether it still has a session. */
const POLL_MS = 60 * 1000;
/** How long before the end the warning appears. */
const WARN_MS = 2 * 60 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart", "mousemove"] as const;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SessionKeeper({ role }: { role: SessionRole }) {
  const router = useRouter();
  /** When the window closes, on this PC's clock. Null until the server has said. */
  const expiresAt = useRef<number | null>(null);
  const lastTouch = useRef(0);
  /** Milliseconds left while the warning is showing; null when it is not. */
  const [left, setLeft] = useState<number | null>(null);
  const warningUp = useRef(false);
  const [extending, setExtending] = useState(false);
  const stayRef = useRef<HTMLButtonElement | null>(null);
  const callRef = useRef<(method: "GET" | "POST") => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    let ended = false;
    /** Set once this tab has itself counted down to zero. */
    let ranOut = false;
    let checkingEnd = false;
    armSessionKeeper();
    const cfg = CONFIG[role];

    const hideWarning = () => {
      warningUp.current = false;
      setLeft(null);
    };

    const learn = (remainingMs: number) => {
      expiresAt.current = Date.now() + remainingMs;
      ranOut = false;
      if (remainingMs > WARN_MS) hideWarning();
    };

    const end = (reason: string | undefined) => {
      if (ended || cancelled) return;
      ended = true;
      // The browser drops the cookie at the same moment the server stops
      // honouring it, so a tab that counted itself down can hear "no session"
      // rather than "timed out". It knows which it was.
      router.replace(loginFor(role, ranOut ? "idle_expired" : reason));
    };

    const call = async (method: "GET" | "POST") => {
      try {
        const res = await sessionRequest(cfg.endpoint, method);
        if (cancelled || !res) return;
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          end(data?.reason);
          return;
        }
        // A 5xx or a blip says nothing about the session. Leave it be and ask
        // again on the next tick rather than sign somebody out over it.
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (typeof data?.remainingMs !== "number") return;
        learn(data.remainingMs);
        if (method === "POST" && expiresAt.current !== null) {
          announce(role, { type: "extended", expiresAt: expiresAt.current });
        }
      } catch {
        // Offline: say nothing and try again next time. Signing somebody out
        // because their wifi blinked is the bug this component exists to avoid.
      }
    };
    callRef.current = call;

    const onActivity = () => {
      // With the warning up, extending is an explicit choice — see above.
      if (warningUp.current) return;
      const now = Date.now();
      if (now - lastTouch.current < TOUCH_INTERVAL_MS) return;
      lastTouch.current = now;
      void call("POST");
    };

    const tick = () => {
      const at = expiresAt.current;
      if (at === null || ended) return;
      const remaining = at - Date.now();
      if (remaining <= 0) {
        ranOut = true;
        setLeft(0);
        // One last question before leaving: another tab may have extended it
        // and the message gone astray.
        if (!checkingEnd) {
          checkingEnd = true;
          void call("GET").finally(() => { checkingEnd = false; });
        }
        return;
      }
      if (remaining <= WARN_MS) {
        warningUp.current = true;
        setLeft(remaining);
      } else if (warningUp.current) {
        hideWarning();
      }
    };

    const channel = openSessionChannel(role);
    if (channel) {
      channel.onmessage = (e: MessageEvent<SessionMessage>) => {
        const msg = e.data;
        if (msg?.type === "extended" && typeof msg.expiresAt === "number") {
          if (expiresAt.current === null || msg.expiresAt > expiresAt.current) {
            expiresAt.current = msg.expiresAt;
            ranOut = false;
            if (msg.expiresAt - Date.now() > WARN_MS) hideWarning();
          }
        } else if (msg?.type === "signed-out" && !isSigningOut()) {
          end("signed_out");
        }
      };
    }

    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { passive: true });
    const poll = window.setInterval(() => void call("GET"), POLL_MS);
    const clock = window.setInterval(tick, 1000);
    // Coming back to a tab that was in the background is exactly when the
    // answer is most likely to have changed.
    const onVisible = () => {
      if (document.visibilityState === "visible") void call("GET");
    };
    document.addEventListener("visibilitychange", onVisible);
    void call("GET");

    return () => {
      cancelled = true;
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
      window.clearInterval(poll);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [role, router]);

  // The warning's button takes the keyboard, so Enter answers it.
  const warningShown = left !== null;
  useEffect(() => {
    if (warningShown) stayRef.current?.focus();
  }, [warningShown]);

  if (left === null) return null;

  const stay = async () => {
    setExtending(true);
    lastTouch.current = Date.now();
    warningUp.current = false;
    await callRef.current("POST");
    setExtending(false);
  };

  const signOut = async () => {
    await signOutThrough(CONFIG[role].logout, role);
    router.replace(CONFIG[role].login);
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ fontFamily: "inherit" }}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-body"
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-[#1d1d1f] shadow-2xl ring-1 ring-black/[0.06]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <Clock3 className="h-5 w-5" />
        </span>
        <h2 id="session-warning-title" className="mt-4 text-lg font-semibold tracking-tight">
          {left > 0 ? "Are you still there?" : "Signing you out…"}
        </h2>
        <p id="session-warning-body" className="mt-1.5 text-[13px] leading-relaxed text-[#48484a]">
          There has been no activity for a while. For security, this session will end in{" "}
          <span className="font-semibold tabular-nums text-[#1d1d1f]" aria-live="polite">{mmss(left)}</span>.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold text-[#48484a] ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.03]"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
          <button
            ref={stayRef}
            type="button"
            onClick={() => void stay()}
            disabled={extending || left <= 0}
            className="inline-flex items-center justify-center rounded-full bg-brand-dark px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
          >
            {extending ? "Staying signed in…" : "Stay signed in"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionKeeper;

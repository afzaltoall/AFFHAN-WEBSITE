"use client";

import { useEffect, useRef, useState } from "react";
import { preconnect, preload } from "react-dom";
import Script from "next/script";
import { useAuth, type WebUser } from "@/context/AuthContext";
import { prefetchPhoneDialog, usePhonePrompt } from "@/context/PhonePromptContext";

/** Google's script, fetched as early as each page allows (the /login layout asks in its HTML). */
export const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

/* Baked in at build time. Kept as the fast path — when it is present the
   button renders without waiting on anything — but not as the only path: a
   build that ran before the variable was set ships an empty string forever,
   which is how production ended up showing "not configured yet" while the
   server verified Google tokens perfectly well. /api/web/auth/google/config
   answers with the same id at request time, so setting the variable is enough
   on its own. */
const BUILD_TIME_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (res: { credential?: string }) => void;
        ux_mode?: "popup" | "redirect";
        auto_select?: boolean;
        use_fedcm_for_button?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string | number | undefined>
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdApi;
  }
}

/**
 * Sign in with Google.
 *
 * Google's own rendered button, not a lookalike. Getting an ID token for a
 * custom-drawn button means either hiding Google's and forwarding clicks to it,
 * or using the OAuth2 popup — which returns an access token, not the signed ID
 * token the backend verifies. renderButton is the supported path, and it comes
 * with the keyboard and screen-reader behaviour a hand-rolled div would have to
 * reimplement. It is themed outline/white, which is what sat here before.
 *
 * The credential is verified server-side at /api/web/auth/google. Nothing here
 * decides who anyone is; it only carries the token across.
 */
export function GoogleButton({
  onSuccess,
  suggestedPhone = null,
}: {
  onSuccess?: () => void;
  /** A number to start the phone dialog from: the one typed into the quote form behind the sign-in. */
  suggestedPhone?: string | null;
}) {
  const { refreshSession, adoptUser } = useAuth();
  const { askForPhone } = usePhonePrompt();
  // Google's script and its button's frame come from accounts.google.com: connect, and fetch the script, as this
  // renders rather than after the page is up (next/script adds its tag only then; the tag finds it fetched).
  preconnect("https://accounts.google.com");
  preload(GSI_SCRIPT, { as: "script" });
  // The phone dialog a sign-in may open, fetched while nothing else is happening, so it is there at once.
  useEffect(() => {
    const id = window.setTimeout(prefetchPhoneDialog, 1500);
    return () => window.clearTimeout(id);
  }, []);
  // Read when Google answers rather than closed over: a new number is not a
  // reason to set Google's button up again.
  const suggestedPhoneRef = useRef(suggestedPhone);
  useEffect(() => {
    suggestedPhoneRef.current = suggestedPhone;
  }, [suggestedPhone]);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(BUILD_TIME_CLIENT_ID);
  // Null until the server has answered, so "not configured" is only ever shown
  // once we actually know — rather than for the moment before the answer
  // arrives, which would flash a wrong message on every load.
  const [checked, setChecked] = useState(BUILD_TIME_CLIENT_ID !== "");

  useEffect(() => {
    if (BUILD_TIME_CLIENT_ID) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/web/auth/google/config/", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && typeof json?.clientId === "string") setClientId(json.clientId);
      } catch {
        // Leave it empty; the message below is then the honest answer.
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scriptReady || !clientId || !holderRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      ux_mode: "popup",
      // Chrome's own account chooser (FedCM: desktop 125+, Android 128+) in place of Google's popup window, a
      // sheet over the page instead of a second window to load (the owner, 2026-10-15: "very late and slow").
      // Other browsers keep the popup.
      use_fedcm_for_button: true,
      // No auto_select: silently signing someone in because a browser happens
      // to hold a Google session is not a decision to make for them.
      auto_select: false,
      callback: async (res) => {
        if (!res.credential) {
          setError("Google did not return a sign-in. Please try again.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          // With its slash: the site's trailingSlash answers the bare address with a 308 first, a second round
          // trip before anyone was signed in (measured on affhan.com, 2026-10-15).
          const r = await fetch("/api/web/auth/google/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ idToken: res.credential }),
          });
          const json = await r.json().catch(() => ({}));
          if (!r.ok) {
            setError(json?.error ?? "Google sign-in failed.");
            return;
          }
          // The answer carries the account, as /me would (publicUser): taken as it is, rather than asking /me
          // again for what was just said.
          const answered = (json?.user as WebUser | undefined) ?? null;
          if (answered) adoptUser(answered);
          const me = answered ?? (await refreshSession());
          // Google gives us no number, and our team calls or WhatsApps about
          // quotes: an account without one is asked for it before the visitor
          // goes on (the owner, 2026-10-15). Saved as typed, no code; closing
          // the dialog skips it.
          if (me && !me.phone) await askForPhone(suggestedPhoneRef.current);
          onSuccess?.();
        } catch {
          setError("Could not reach the server. Please try again.");
        } finally {
          setBusy(false);
        }
      },
    });

    window.google.accounts.id.renderButton(holderRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "center",
      width: 320,
    });
  }, [scriptReady, clientId, refreshSession, adoptUser, onSuccess, askForPhone]);

  // Nothing to sign in against, and the server has confirmed it. Saying so
  // beats rendering a control that cannot work — but only once we know, which
  // is what `checked` is for.
  if (checked && !clientId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-3 text-center text-[13px] text-slate-500">
        Google sign-in is not configured yet.
      </div>
    );
  }

  return (
    <div>
      <Script
        src={GSI_SCRIPT}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />

      <div className="flex justify-center">
        {/* Google draws into this. Until the script lands it holds the row's
            height so the form does not jump when the button appears. */}
        <div ref={holderRef} className="min-h-[44px] w-full max-w-[320px]" />
      </div>

      {busy && (
        <p className="mt-2 text-center text-[12px] text-slate-500">Signing you in…</p>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

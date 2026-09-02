"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useAuth } from "@/context/AuthContext";

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
export function GoogleButton({ onSuccess }: { onSuccess?: () => void }) {
  const { refreshSession } = useAuth();
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
        const res = await fetch("/api/web/auth/google/config", { cache: "no-store" });
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
          const r = await fetch("/api/web/auth/google", {
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
          await refreshSession();
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
  }, [scriptReady, clientId, refreshSession, onSuccess]);

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
        src="https://accounts.google.com/gsi/client"
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

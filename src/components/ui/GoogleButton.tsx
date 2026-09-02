"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useAuth } from "@/context/AuthContext";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

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

  useEffect(() => {
    if (!scriptReady || !CLIENT_ID || !holderRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
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
  }, [scriptReady, refreshSession, onSuccess]);

  // Without a client ID there is nothing to sign in against, so say that
  // rather than rendering a control that cannot work.
  if (!CLIENT_ID) {
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

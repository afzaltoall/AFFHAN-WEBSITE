"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";

// Lazy, and only mounted once something asks for it. The login modal pulls in
// the auth forms and Google's button; a visitor who never clicks "Request a
// Quote" should not pay for any of it. Same treatment the inquiry modal gets
// at its own call sites.
const LoginModal = dynamic(() => import("@/components/ui/LoginModal").then((m) => m.LoginModal), {
  ssr: false,
});

/** What to do once the visitor is signed in. */
type Resume = () => void;

interface QuoteGateValue {
  /**
   * Run `resume` if someone is signed in; otherwise open the login modal and
   * run it the moment they are.
   *
   * The pending intent is the closure itself — whichever product the call site
   * captured. Nothing is serialised, nothing is stored, because sign-in happens
   * without leaving the page: the password and signup forms are fetches, and
   * Google runs in a popup (ux_mode: "popup"), so React state survives the
   * whole round trip. That is why there is no sessionStorage key here and no
   * `?resume=` in the URL.
   *
   * `onCancel` fires when the dialog is dismissed without signing in. Without
   * it the caller is left silent: someone who pressed Submit, thought better
   * of making an account and closed the box would be looking at a form that
   * appeared to do nothing when they pressed the button.
   */
  requireLogin: (resume: Resume, reason?: string, onCancel?: () => void) => void;
}

const QuoteGateContext = createContext<QuoteGateValue | null>(null);

const DEFAULT_REASON = "Sign in to request a quote";

/**
 * The sign-in gate in front of every "Request a Quote".
 *
 * Quote requests were open to anyone until now — deliberately, and the reasons
 * are still in the comment at the top of /api/inquiry. This gate is a product
 * decision taken with the numbers in view: at the time it was added, 240 of
 * 250 inquiries on record had no account attached.
 *
 * It holds the login modal rather than the inquiry modal on purpose. Seven
 * different components open an inquiry, several of them with their own portal,
 * back-button handling and lazy import; hoisting all that into one provider
 * would have meant rewriting each of them.
 *
 * There are two callers, and neither is any of those seven: the product quote
 * form's own submit handler (InquiryModal), and the freight quote form's at
 * the foot of /shipping/ (ShippingQuoteSection). The gate used to sit on the
 * button that opened the form, which meant nobody could see what they were
 * filling in before being asked for an account. It sits on the send instead —
 * fill it freely, sign in to send it:
 *
 *     requireLogin(() => void send(), reason, onCancel)
 *
 * The login modal is portalled above the quote form rather than replacing it,
 * so the form stays mounted throughout and `send()` closes over the values
 * that were already typed. Nothing is serialised to survive the round trip
 * because nothing has to be.
 */
export function QuoteGateProvider({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(DEFAULT_REASON);
  const resumeRef = useRef<Resume | null>(null);
  const cancelRef = useRef<Resume | null>(null);

  const requireLogin = useCallback(
    (resume: Resume, why?: string, onCancel?: Resume) => {
      void (async () => {
        // `user` is null for the first moment of every visit, until /me
        // answers — gating on that would show the login modal to people who
        // are already signed in and just clicked quickly.
        let current = user;
        if (!current && loading) current = await refreshSession();

        if (current) {
          resume();
          return;
        }

        resumeRef.current = resume;
        cancelRef.current = onCancel ?? null;
        setReason(why ?? DEFAULT_REASON);
        setOpen(true);
      })();
    },
    [user, loading, refreshSession]
  );

  // Both auth forms and the Google button await refreshSession() before they
  // call onSuccess, so by the time this runs the session is real and the
  // context already knows who it belongs to — the inquiry form's prefill
  // effect fires off the same value.
  const handleSuccess = useCallback(() => {
    setOpen(false);
    const resume = resumeRef.current;
    resumeRef.current = null;
    cancelRef.current = null;
    resume?.();
  }, []);

  // Dismissed without signing in: drop the intent rather than leaving it armed
  // for whatever opens the modal next.
  const handleClose = useCallback(() => {
    setOpen(false);
    resumeRef.current = null;
    const cancel = cancelRef.current;
    cancelRef.current = null;
    cancel?.();
  }, []);

  const value = useMemo(() => ({ requireLogin }), [requireLogin]);

  return (
    <QuoteGateContext.Provider value={value}>
      {children}
      <LoginModal open={open} onClose={handleClose} onSuccess={handleSuccess} reason={reason} />
    </QuoteGateContext.Provider>
  );
}

export function useQuoteGate(): QuoteGateValue {
  const ctx = useContext(QuoteGateContext);
  if (!ctx) throw new Error("useQuoteGate must be used inside <QuoteGateProvider>");
  return ctx;
}

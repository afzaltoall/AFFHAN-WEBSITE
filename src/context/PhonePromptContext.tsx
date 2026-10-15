"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";

// Fetched the first time it is asked for: a visitor who never signs in with
// Google never downloads the dialog. (Its libphonenumber and country list are
// the sign-in forms' already, so by then it is a small chunk.)
const AddPhoneDialog = dynamic(() => import("@/components/account/AddPhoneDialog").then((m) => m.AddPhoneDialog), {
  ssr: false,
});

interface PhonePromptValue {
  /**
   * Ask the signed-in customer for a mobile number. Resolves when the dialog
   * closes, saved or not, so a sign-in goes on to wherever it was going only
   * once the question has been answered.
   */
  askForPhone: () => Promise<void>;
}

const PhonePromptContext = createContext<PhonePromptValue | null>(null);

/**
 * The phone dialog after a Google sign-in (the owner, 2026-10-15). An account
 * made with Google arrives with no number, and our team calls or WhatsApps
 * about quotes; GoogleButton asks here when the account it has just signed in
 * to has none.
 *
 * Above the pages rather than inside the sign-in screens, because /login moves
 * on the moment the session exists and would take a dialog of its own with it.
 * Above the quote gate too, whose sign-in dialog holds that button: the gate
 * resumes only after the answer, so a quote is sent once the dialog has closed,
 * not underneath it.
 */
export function PhonePromptProvider({ children }: { children: React.ReactNode }) {
  const { refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  // Mounted on the first ask and kept: the chunk is fetched once, and closing
  // can play its exit.
  const [asked, setAsked] = useState(false);
  const answerRef = useRef<(() => void) | null>(null);

  const askForPhone = useCallback(
    () =>
      new Promise<void>((resolve) => {
        // A second ask while one is open answers the first: nothing is left waiting.
        answerRef.current?.();
        answerRef.current = resolve;
        setAsked(true);
        setOpen(true);
      }),
    []
  );

  const close = useCallback(() => {
    setOpen(false);
    const answer = answerRef.current;
    answerRef.current = null;
    answer?.();
  }, []);

  const value = useMemo(() => ({ askForPhone }), [askForPhone]);

  return (
    <PhonePromptContext.Provider value={value}>
      {children}
      {asked && <AddPhoneDialog open={open} onClose={close} onSaved={() => void refreshSession()} />}
    </PhonePromptContext.Provider>
  );
}

export function usePhonePrompt(): PhonePromptValue {
  const ctx = useContext(PhonePromptContext);
  if (!ctx) throw new Error("usePhonePrompt must be used inside <PhonePromptProvider>");
  return ctx;
}

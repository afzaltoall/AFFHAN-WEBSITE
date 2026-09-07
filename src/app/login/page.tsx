"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PasswordAuthForm } from "@/components/ui/PasswordAuthForm";
import { SignupForm } from "@/components/ui/SignupForm";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { LoginBrandPanel } from "@/components/ui/LoginBrandPanel";
import { LoginBackground } from "@/components/ui/LoginBackground";
import { TiltCard, TravellingEdgeLight } from "@/components/ui/TiltCard";

/**
 * Only same-origin, path-only destinations are followed.
 *
 * `?redirect=` is attacker-controllable — anyone can send a link to
 * /login?redirect=https://evil.example. Refusing anything but a relative path
 * keeps the sign-in page from being used to launder a link to somewhere else.
 */
function safeRedirect(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  // Two screens: signing in, and creating an account. Both are email and
  // password now — signup no longer starts with an SMS code, so the step and
  // intent this page used to track (which OTP screen was showing, and whether
  // it was a sign-in or a sign-up) have nothing left to describe.
  const [method, setMethod] = useState<"password" | "signup">("password");

  const destination = safeRedirect(searchParams.get("redirect"));

  // Nobody signed in needs a sign-in page. Waits for `loading` so a returning
  // visitor is not shown the form for a moment before being bounced.
  useEffect(() => {
    if (!loading && user) router.replace(destination);
  }, [loading, user, destination, router]);

  const onSuccess = useCallback(() => {
    router.replace(destination);
  }, [router, destination]);

  const { heading, subheading } =
    method === "password"
      ? { heading: "Sign in", subheading: "Use the email and password on your account." }
      : { heading: "Create your account", subheading: "One screen, and you are in — no code to wait for." };

  // Only an already-signed-in visitor sees the spinner, and only for the moment
  // before the redirect lands. The form is not gated on `loading`: doing that
  // would leave the server rendering nothing but a spinner, so the page would
  // arrive empty and fill in only after hydration.
  if (!loading && user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center">
        <LoginBackground />
        <Loader2 size={22} className="relative animate-spin text-white/70" />
      </div>
    );
  }

  return (
    // Two surfaces, not one: the words sit on white where they read most
    // easily, and the card floats on the gradient, which is what gives it
    // something to glow against.
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      <div className="flex items-center bg-white">
        <LoginBrandPanel />
      </div>

      <div className="relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-8 lg:px-12">
        <LoginBackground />

        <TiltCard className="relative w-full max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="relative"
          >
            {/* Soft halo, then the light that runs the border. Both sit behind
                the card's own surface and neither can take a click. */}
            <div
              aria-hidden="true"
              className="absolute -inset-3 rounded-3xl bg-white/10 blur-2xl"
            />
            <TravellingEdgeLight />

            {/* The card is light on purpose. The form inside is the same
                component the modal uses, styled for a white surface; a dark
                glass card would need it restyled, and it would then be wrong in
                the modal. */}
            {/* No overflow-hidden: the country dial menu opens downward out of
                this box, and clipping it would cut the list off inside the
                card. The travelling light does its own clipping. */}
            <div className="relative rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:p-7">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{subheading}</p>

              <div className="mt-6">
                {method === "password" ? (
                  <PasswordAuthForm
                    onSuccess={onSuccess}
                    onCreateAccount={() => setMethod("signup")}
                  />
                ) : (
                  // Creating an account: one screen, no code. This is where
                  // PhoneAuthForm used to be — it and the Twilio routes behind
                  // it are still in the codebase, just not on this path while
                  // production access is pending.
                  <SignupForm
                    onSuccess={onSuccess}
                    onHaveAccount={() => setMethod("password")}
                  />
                )}
              </div>

              {/* Always shown now. This used to be hidden once a code was on
                  its way, so that a second way in could not strand the one in
                  progress; with no code step there is nothing to strand. */}
              <>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[12px] font-medium uppercase tracking-wider text-slate-400">
                      or
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  {/* Google is a way in and a way to start — the heading above
                      already says which, so the label follows it. */}
                  <GoogleButton onSuccess={onSuccess} />
                  {method === "signup" && (
                    <p className="mt-2.5 text-center text-[12px] text-slate-400">
                      Signing up with Google fills this in for you.
                    </p>
                  )}
              </>

              <p className="mt-7 text-[12px] leading-relaxed text-slate-400">
                By continuing you agree to our{" "}
                <Link
                  href="/terms-conditions/"
                  className="text-slate-500 underline hover:text-slate-700"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy-policy/"
                  className="text-slate-500 underline hover:text-slate-700"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </motion.div>
        </TiltCard>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center">
          <LoginBackground />
          <Loader2 size={22} className="relative animate-spin text-white/70" />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

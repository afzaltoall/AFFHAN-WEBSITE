"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutThrough } from "@/lib/session-client";
import { sideRow } from "@/components/employee/workspace-ui";

/**
 * Ends the session server-side (the cookie is cleared there), then leaves.
 *
 * Two shapes for the same button: a full-width red row at the foot of the rail,
 * which is where the console keeps its own, and a compact one for the top bar
 * that stands in for the rail on a phone.
 */
export function EmployeeSignOut({
  variant = "compact",
  collapsed = false,
}: {
  variant?: "compact" | "rail";
  /** In the rail: hide the word while the rail is an icon column. */
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    // Waits for any keep-alive already in the air, so the cookie this clears
    // cannot be re-installed a moment later. Even if the request never lands,
    // they are sent to the login page: the alternative is a button that
    // appears to do nothing.
    await signOutThrough("/api/employee/auth/logout/", "staff");
    router.replace("/employee/login/");
    router.refresh();
  };

  if (variant === "rail") {
    return (
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        title="Sign out"
        className={`${sideRow} gap-0 justify-start px-1.5 bg-red-500 font-semibold text-white hover:bg-red-600 disabled:opacity-60`}
      >
        <span className="relative flex h-[22px] w-8 shrink-0 items-center justify-center">
          <LogOut size={15} />
        </span>
        <span
          className={`overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[190px] opacity-100"
          }`}
        >
          {busy ? "Signing out…" : "Sign out"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

export default EmployeeSignOut;

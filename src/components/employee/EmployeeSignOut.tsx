"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/** Ends the session server-side (the cookie is cleared there), then leaves. */
export function EmployeeSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/employee/auth/logout/", { method: "POST", credentials: "same-origin" });
    } catch {
      // Even if the request never lands, send them to the login page: the
      // alternative is a button that appears to do nothing.
    }
    router.replace("/employee/login/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

export default EmployeeSignOut;

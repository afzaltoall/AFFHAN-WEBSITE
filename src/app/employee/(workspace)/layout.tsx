import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { loginRedirectFor, readWorkspaceAuth } from "@/lib/employee-session";
import { EmployeeSessionKeeper } from "@/components/employee/EmployeeSessionKeeper";
import { EmployeeSignOut } from "@/components/employee/EmployeeSignOut";

export const metadata: Metadata = {
  title: "Staff workspace — Affhan",
  robots: { index: false, follow: false },
};

/**
 * The guard for everything behind a staff sign-in.
 *
 * Server-side, and on every request: the check runs here, in a layout, so no
 * page inside the group can forget it, and it is a redirect before any of that
 * page's data is fetched rather than a hidden link in a UI that already
 * rendered. The route group's name is in brackets, so these pages are still
 * /employee/dashboard and not /employee/workspace/dashboard.
 *
 * /employee/login and /employee/forgot-password sit OUTSIDE this group, which
 * is what lets them be reachable without a session.
 *
 * Admins are admitted deliberately — the console's owner should be able to see
 * what the team sees — but they carry no Employee row, so anything that writes
 * to the audit trail has to check for one rather than assume it.
 */
export default async function EmployeeWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) redirect(loginRedirectFor(auth.reason));

  const who =
    auth.kind === "employee"
      ? { name: auth.employee.name, detail: auth.employee.region ?? auth.employee.email }
      : { name: auth.session.name ?? "Administrator", detail: "admin — viewing the staff workspace" };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Only a real employee session slides its own window; an admin keeps the
          console's session rules. */}
      {auth.kind === "employee" && <EmployeeSessionKeeper />}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/employee/dashboard/" className="flex items-center gap-3">
            <span className="relative block h-8 w-24">
              <Image src="/logo.png" alt="Affhan" fill className="object-contain" />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-500">Staff workspace</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold leading-tight">{who.name}</span>
              <span className="block text-xs text-slate-500">{who.detail}</span>
            </span>
            <EmployeeSignOut />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

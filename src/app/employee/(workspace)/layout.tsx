import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { isCargoJob, isSalesJob, loginRedirectFor, readWorkspaceAuth, workspaceHome } from "@/lib/employee-session";
import { SessionKeeper } from "@/components/session/SessionKeeper";
import { EmployeeSignOut } from "@/components/employee/EmployeeSignOut";
import { WorkspaceSidebar, type WorkspacePages } from "@/components/employee/WorkspaceSidebar";
import { WorkspaceTabs } from "@/components/employee/WorkspaceTabs";
import { sfFont, wt } from "@/components/employee/workspace-ui";

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
      ? {
          name: auth.employee.name,
          detail: auth.employee.region ?? auth.employee.email,
          image: auth.employee.image,
        }
      : {
          name: auth.session.name ?? "Administrator",
          detail: "admin — viewing the staff workspace",
          image: auth.session.image ?? null,
        };

  // Which pages this account has: a salesperson their leads, an assigner cargo tracking, a referral account only its
  // link (2026-11-03), an admin both works. Everyone has My referrals and Profile.
  const pages: WorkspacePages =
    auth.kind === "admin" ? "both" : isSalesJob(auth.employee) ? "sales" : isCargoJob(auth.employee) ? "assigner" : "referral";
  const home = auth.kind === "admin" ? "/employee/dashboard/" : workspaceHome(auth.employee);

  return (
    <div style={sfFont} className={`min-h-screen antialiased ${wt.page}`}>
      {/* Only a real employee session slides its own window; an admin keeps the
          console's session rules. */}
      {auth.kind === "employee" && <SessionKeeper role="staff" />}

      <div className="flex">
        <WorkspaceSidebar name={who.name} detail={who.detail} image={who.image} pages={pages} />

        <div className="min-w-0 flex-1">
          {/* The rail stands in for this bar from lg up, so the two never show
              at once. Below that it is the whole of the chrome. */}
          <header className={`border-b bg-white lg:hidden ${wt.border}`}>
            {/* Whose workspace it is beside the mark (2026-11-08): the mark sat small in a wide box, with gaps either
                side of it, and a phone showed no name at all. */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
              <Link href={home} className="flex min-w-0 items-center gap-2.5">
                <Image src="/logo.png" alt="Affhan" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[15px] font-semibold tracking-tight">{who.name}</span>
                  <span className={`block truncate text-[12.5px] ${wt.mid}`}>Staff workspace</span>
                </span>
              </Link>
              <EmployeeSignOut />
            </div>
            <WorkspaceTabs pages={pages} />
          </header>

          {/* The console's own main: no max-width, because the width is already
              decided by the rail beside it. The workspace used to centre itself
              in a max-w-6xl column, which on a 1440px screen left a third of
              the desk empty and the cards narrower than the same rows are in
              /admin. */}
          <main className="min-w-0 px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

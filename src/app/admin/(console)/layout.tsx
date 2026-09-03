import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AdminAutoLogout } from "@/components/admin/AdminAutoLogout";

/**
 * The console's defaults, so a new admin route is noindex and named without
 * anyone remembering to say so.
 *
 * Most admin pages already set both; two did not — the customer lists, which
 * are client components and so cannot export metadata at all, and the app
 * inquiries page, which set a title and no robots. Both were inheriting the
 * public site's marketing title and its indexable default. Pages that do
 * declare their own still win, including the supplier page's per-supplier
 * title.
 *
 * noindex is tidiness rather than protection: the gate below redirects an
 * anonymous request before any of these render, so there is nothing for a
 * crawler to reach in the first place.
 */
export const metadata: Metadata = {
  title: "Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * The signed-in admin area: the dashboard, the supplier book, the customer
 * lists, videos and app inquiries.
 *
 * Two jobs, both of which belong to the whole group rather than to any one
 * page.
 *
 * 1. The door. Every route in here is checked on the server before anything
 *    renders. It used to be per-page and therefore only where somebody had
 *    remembered: the supplier detail page checked, the dashboard and the
 *    listings did not, so an anonymous request got the console shell — chrome,
 *    headings, empty tables and a message saying their admin session had
 *    ended, which is a strange thing to tell somebody who never had one. No
 *    data leaked (the APIs behind these pages have always refused an
 *    unauthenticated caller) but a door that is only sometimes locked is not a
 *    door. Checking here means a route added tomorrow is covered by existing
 *    code rather than by remembering.
 *
 *    /admin/login sits outside this route group deliberately, so the redirect
 *    below has somewhere to send people and cannot loop.
 *
 *    A signed-in customer is not a near miss here: they hold affhan_user, an
 *    opaque token on the MobileSession table, while this reads affhan_session,
 *    a signed cookie naming an AdminUser. Neither can be mistaken for the
 *    other, so the role check below is for the case that could actually
 *    happen — an admin-area account whose role is not admin.
 *
 * 2. AdminAutoLogout, which ends the session when it unmounts, on the
 *    principle that unmounting means the admin has left /admin. That was
 *    exactly true while the console was a single page. The moment there were
 *    two admin routes it stopped being: mounted per page, moving from the
 *    dashboard to the supplier directory unmounted one copy and signed the
 *    admin out mid-navigation. Mounted here it survives every move between
 *    admin routes and only unmounts when the admin genuinely leaves.
 *
 * The group is named in brackets, so it shapes nothing in the URL: these pages
 * are still /admin and /admin/suppliers.
 */
export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  return (
    <>
      <AdminAutoLogout />
      {children}
    </>
  );
}

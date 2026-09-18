import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AdminSessionKeeper } from "@/components/admin/AdminSessionKeeper";

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
 * 2. AdminSessionKeeper, which holds the session open while somebody is
 *    working and sends them to the login page once the thirty-minute window
 *    has closed. It ends nothing itself — the timeout is enforced in
 *    lib/session.ts, on the server, against the timestamp the server signed.
 *
 *    Its predecessor, AdminAutoLogout, did end the session, from `pagehide`
 *    and from its own unmount. Both are events about a document rather than
 *    about a person: Next's router replaces the document on its own whenever
 *    an RSC fetch comes back unusable — a deployment landing mid-session is
 *    the common one — so the console signed the admin out mid-click, at
 *    random. Mounting it here rather than per page had already been needed to
 *    stop the same thing happening on every move between two admin routes;
 *    that was the same fault one level down.
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
      <AdminSessionKeeper />
      {children}
    </>
  );
}

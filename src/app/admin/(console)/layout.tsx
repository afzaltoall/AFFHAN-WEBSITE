import { AdminAutoLogout } from "@/components/admin/AdminAutoLogout";

/**
 * The signed-in admin area: the dashboard and the supplier book.
 *
 * This layout exists to own AdminAutoLogout. That component ends the session
 * when it unmounts, on the principle that unmounting means the admin has left
 * /admin — which was exactly true while the console was a single page. The
 * moment there were two admin routes it stopped being true: mounted per page,
 * moving from the dashboard to the supplier directory unmounted one copy and
 * signed the admin out in the middle of the navigation.
 *
 * Mounted here instead, it survives every move between admin routes and only
 * unmounts when the admin genuinely leaves the area. /admin/login sits outside
 * this route group deliberately, so arriving at the login screen is not itself
 * treated as a session to end.
 *
 * The group is named in brackets, so it shapes nothing in the URL: these pages
 * are still /admin and /admin/suppliers.
 */
export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminAutoLogout />
      {children}
    </>
  );
}

import type { CSSProperties } from "react";
import {
  Activity, Factory, Globe, Inbox, LayoutList, Lock, MessageSquare, Plane, PlayCircle, Ship, Smartphone, Store, Trash2,
  TrendingUp, UserCog, Users, type LucideIcon,
} from "lucide-react";

/**
 * What is in the admin rail, in what order, under which heading — once.
 *
 * There are two rails. The dashboard draws its own inside AdminConsole, where
 * four of these are view state rather than routes; every other admin page gets
 * AdminRail. They looked identical until one of them was grouped into sections
 * and the other was not, and a rail that rearranges itself when you open Staff
 * is worse than one that was never grouped at all.
 *
 * So the structure lives here and both read it. What each rail still decides
 * for itself is how a row behaves — a button that changes a view, or a link
 * that changes the page — and which of them carries a count.
 */

export type RailKey =
  | "all" | "inquiries" | "contacts" | "shipping" | "trips" | "trip-lock" | "trash"
  | "staff" | "team-performance" | "activity"
  | "suppliers" | "new-suppliers" | "videos"
  | "website-users" | "app-users" | "supplier-users";

/** The dashboard's five in-page views. */
export type RailView = "all" | "inquiries" | "contacts" | "shipping" | "trash";

export interface RailItem {
  key: RailKey;
  /** Where it goes from a page that is not the dashboard. */
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * The dashboard's own view, for the five that are state there. The console
   * renders these as buttons; every other page links to them with ?view=,
   * which the console reads on arrival.
   */
  view?: RailView;
  /** Other pages that are this row's own, lit by it: App Users holds App Inquiries (the owner, 2026-10-23). */
  also?: string[];
}

/** Whether the row stands for the page at `pathname`: its own address, or one of the pages it holds. */
export const railRowIsCurrent = (item: RailItem, pathname: string) =>
  !item.view && [item.href, ...(item.also ?? [])].some((href) => pathname.startsWith(href));

export interface RailGroup {
  /** null for the first group, which is one row and needs no heading. */
  label: string | null;
  items: RailItem[];
}

export const RAIL_GROUPS: RailGroup[] = [
  {
    // The landing view, on its own: a heading over one row says less than the
    // row does.
    label: null,
    items: [{ key: "all", href: "/admin/", label: "All", icon: LayoutList, view: "all" }],
  },
  {
    label: "Leads",
    items: [
      { key: "inquiries", href: "/admin/?view=inquiries", label: "Inquiries", icon: Inbox, view: "inquiries" },
      { key: "contacts", href: "/admin/?view=contacts", label: "Contact Us", icon: MessageSquare, view: "contacts" },
      // Freight quote requests from the form on /shipping/.
      { key: "shipping", href: "/admin/?view=shipping", label: "Shipping", icon: Ship, view: "shipping" },
      { key: "trash", href: "/admin/?view=trash", label: "Recently Deleted", icon: Trash2, view: "trash" },
    ],
  },
  {
    // The Free China Business Trip: everyone who registered, with their
    // account and Trip ID (/free-china-trip/apply/). A section of its own on
    // the owner's request (it was "Trip applications" under Leads), though it
    // holds one row; a page of its own rather than a dashboard view, so it
    // links from both rails.
    label: "Free China Trip",
    items: [
      { key: "trips", href: "/admin/trip-applications/", label: "Participants", icon: Plane },
      // The key to the homepage trip banner's lock (TripLockPanel), one click
      // from anywhere in the console, its row saying which way it stands
      // (TripLockRailStatus). The owner's request of 2026-10-06.
      { key: "trip-lock", href: "/admin/trip-applications/#trip-lock", label: "Trip lock", icon: Lock },
    ],
  },
  {
    // The sales team: who they are, how they are doing, and what they have
    // recorded. Activity is here rather than under a heading of its own — it is
    // the team's own trail, and a section with one row in it is a divider with
    // a word on top. The Queue row went with its page (the owner, 2026-10-22):
    // the lead lists say who holds whom, and the popup releases them.
    label: "Team",
    items: [
      { key: "staff", href: "/admin/employees/", label: "Staff", icon: UserCog },
      { key: "team-performance", href: "/admin/team-performance/", label: "Team performance", icon: TrendingUp },
      { key: "activity", href: "/admin/activity/", label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Catalog & content",
    items: [
      // The WeChat book, the suppliers the team already dealt with: "Old Suppliers" since the supplier portal
      // (the owner, 2026-10-21), beside the ones who register themselves there, "New Suppliers".
      { key: "suppliers", href: "/admin/suppliers/", label: "Old Suppliers", icon: Users },
      { key: "new-suppliers", href: "/admin/new-suppliers/", label: "New Suppliers", icon: Factory },
      { key: "videos", href: "/admin/videos/", label: "Videos", icon: PlayCircle },
    ],
  },
  {
    // Everyone who signs in, in the order the owner gave (2026-10-23): customers on the site, customers on the
    // app, then suppliers. Website and App Users are one customer table read two ways (somebody who uses both is
    // on both, the honest answer rather than a duplicate); App Users holds the app's inquiries as a tab of its
    // own page, so the row stays lit there; Supplier Users is the supplier portal's own table, apart from
    // customers'.
    label: "Users",
    items: [
      { key: "website-users", href: "/admin/users/website/", label: "Website Users", icon: Globe },
      { key: "app-users", href: "/admin/users/app/", label: "App Users", icon: Smartphone, also: ["/admin/mobile-inquiries/"] },
      { key: "supplier-users", href: "/admin/users/suppliers/", label: "Supplier Users", icon: Store },
    ],
  },
];

/** Every row, flat, for the rails that do not care about the headings. */
export const RAIL_ITEMS: RailItem[] = RAIL_GROUPS.flatMap((g) => g.items);

/**
 * The rail fits the window, with nothing to scroll (the owner, 2026-10-23: "remove the sidebar scroll"). Every row is
 * one height: the window's height, less everything in the rail that is not a row, shared among the rows, between
 * RAIL_ROW_MIN and RAIL_ROW_MAX. Both rails draw the same header, headings, hairlines and account row (the classes
 * named below), so this one figure fits both. Only a window under about 620px tall, where a row would be smaller than
 * a pointer can reliably hit, lets the list run on, still without a scrollbar.
 */
export const RAIL_ROW_MIN = 22;
export const RAIL_ROW_MAX = 38;
const RAIL_PX = {
  /** py-3 around the 32px logo. */
  header: 56,
  /** The account row: its hairline, p-1.5, and the 40px row. */
  account: 53,
  /** A group's heading, open: a 14px line and mb-0.5. */
  heading: 16,
  /** Between groups: mt-1, the hairline, pt-1. */
  divider: 9,
  /** space-y-0.5 between a group's children. */
  gap: 2,
  /** pb-1 under the last group, and 2px for rounding. */
  end: 6,
};
const railRows = RAIL_ITEMS.length;
const railFixed =
  RAIL_PX.header +
  RAIL_PX.account +
  RAIL_GROUPS.filter((g) => g.label).length * RAIL_PX.heading +
  (RAIL_GROUPS.length - 1) * RAIL_PX.divider +
  RAIL_GROUPS.reduce((n, g) => n + g.items.length + (g.label ? 1 : 0) - 1, 0) * RAIL_PX.gap +
  RAIL_PX.end;
/** On the rail's aside: --rail-row, the height every row takes (h-[var(--rail-row)]). */
export const railFitStyle = {
  "--rail-row": `clamp(${RAIL_ROW_MIN}px, calc((100vh - ${railFixed}px) / ${railRows}), ${RAIL_ROW_MAX}px)`,
} as CSSProperties;
/** Above this window height the open rail never runs past the bottom. */
export const RAIL_FITS_FROM_PX = railFixed + railRows * RAIL_ROW_MIN;

/**
 * The figure beside a row, in the two shapes the rail needs it.
 *
 * Both rails print these, so both round the same way: "1.1k" fits beside a
 * 17px icon at 60px wide and 1,068,225 does not, while the pill in the opened
 * panel has room for the real number and should say it.
 */
export const fmtRailNum = (n: number) => n.toLocaleString("en-US");
export const fmtRailBadge = (n: number) =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n / 100_000) / 10}M`;

/**
 * Which rows carry a count, and what it is. Rows left out carry none.
 *
 * Seven of the sixteen rows do, and each counts something different enough to
 * be worth writing down — the figures are read at a glance by people who will
 * not go and check what they mean:
 *
 *   inquiries  customers waiting in the open pool RIGHT NOW (state OPEN), for
 *              anybody on the team to take: the Queue row's figure, moved here
 *              when that page went (the owner, 2026-10-22). Customers, not
 *              quote requests, and NOT the untriaged count it used to be.
 *   contacts   Contact Us messages nobody has triaged yet — every status that
 *              is not handled, spam or deleted, which is what the console's own
 *              asStatus() treats as "new".
 *   shipping   the same rule over freight quote requests from /shipping/.
 *              Always the whole table: the dashboard does not load these rows,
 *              so it takes the server's count too.
 *   trash      what is sitting in Recently Deleted. Inquiries only, because
 *              that is what the view restores.
 *   suppliers  every row of the supplier book. A total, not a backlog.
 *   new-suppliers  supplier-portal applications nobody has looked at yet
 *              (status NEW). A backlog, like inquiries.
 *   videos     every uploaded video. Also a total.
 *
 * The dashboard draws its own rail from the rows it has already loaded, so
 * its contact figure honours whatever country filter is on; every other page
 * reads lib/admin-rail-counts.ts, which counts the whole table.
 */
export type RailCountMap = Partial<Record<RailKey, number>>;

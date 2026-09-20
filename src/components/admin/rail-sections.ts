import {
  Activity, Globe, Inbox, LayoutList, MessageSquare, PlayCircle, Smartphone, Timer, Trash2,
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
  | "all" | "inquiries" | "contacts" | "trash"
  | "staff" | "team-performance" | "queue" | "activity"
  | "suppliers" | "videos"
  | "website-users" | "app-users" | "app-inquiries";

/** The dashboard's four in-page views. */
export type RailView = "all" | "inquiries" | "contacts" | "trash";

export interface RailItem {
  key: RailKey;
  /** Where it goes from a page that is not the dashboard. */
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * The dashboard's own view, for the four that are state there. The console
   * renders these as buttons; every other page links to them with ?view=,
   * which the console reads on arrival.
   */
  view?: RailView;
}

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
      { key: "trash", href: "/admin/?view=trash", label: "Recently Deleted", icon: Trash2, view: "trash" },
    ],
  },
  {
    // The sales team: who they are, how they are doing, what the rotation is
    // holding, and what they have recorded. Activity is here rather than under
    // a heading of its own — it is the team's own trail, and a section with one
    // row in it is a divider with a word on top.
    label: "Team",
    items: [
      { key: "staff", href: "/admin/employees/", label: "Staff", icon: UserCog },
      { key: "team-performance", href: "/admin/team-performance/", label: "Team performance", icon: TrendingUp },
      { key: "queue", href: "/admin/queue/", label: "Queue", icon: Timer },
      { key: "activity", href: "/admin/activity/", label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Catalog & content",
    items: [
      { key: "suppliers", href: "/admin/suppliers/", label: "Suppliers", icon: Users },
      { key: "videos", href: "/admin/videos/", label: "Videos", icon: PlayCircle },
    ],
  },
  {
    // Two lists, because the office asks two different questions: who signs in
    // on the site, and who signs in on the app. One table underneath —
    // somebody who uses both appears on both, which is the honest answer
    // rather than a duplicate.
    label: "Users",
    items: [
      { key: "website-users", href: "/admin/users/website/", label: "Website Users", icon: Globe },
      { key: "app-users", href: "/admin/users/app/", label: "App Users", icon: Smartphone },
      { key: "app-inquiries", href: "/admin/mobile-inquiries/", label: "App Inquiries", icon: MessageSquare },
    ],
  },
];

/** Every row, flat, for the rails that do not care about the headings. */
export const RAIL_ITEMS: RailItem[] = RAIL_GROUPS.flatMap((g) => g.items);

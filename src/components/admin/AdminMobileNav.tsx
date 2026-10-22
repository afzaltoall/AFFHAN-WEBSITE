"use client";

import Link from "next/link";
import { RAIL_GROUPS, fmtRailNum, type RailCountMap, type RailItem, type RailView } from "@/components/admin/rail-sections";
import { TripLockRailPill } from "@/components/admin/TripLockRailStatus";

/**
 * The console's navigation on a phone or a tablet (wherever neither rail is
 * drawn: below lg, and on touch screens): every row the desktop rail has, under the same headings, in
 * the same order, with the same figures, because both read RAIL_GROUPS. The
 * dashboard's drawer had only its five in-page views and Suppliers, and every
 * other admin page had no menu at all, so the Free China Trip, its lock, the
 * team's pages, Videos and the user lists could not be reached on a phone (the
 * owner, 2026-10-12).
 *
 * The rows only: the drawer around them is the page's (AdminConsole's own, and
 * AdminMobileBar's on every other page), as each closes and themes itself.
 */
export interface AdminNavTheme {
  soft: string;
  border: string;
  navActive: string;
  navIdle: string;
  chip: string;
}

export function AdminRailList({
  t,
  counts,
  dark = false,
  isActive,
  onView,
  onNavigate,
}: {
  t: AdminNavTheme;
  /** The figures beside the rows, as the desktop rail shows them; none when they could not be read. */
  counts: RailCountMap;
  dark?: boolean;
  isActive: (item: RailItem) => boolean;
  /** On the dashboard, its five views are state: a press changes the view. Elsewhere they are links (?view=). */
  onView?: (view: RailView) => void;
  /** After any choice: the drawer closes. */
  onNavigate: () => void;
}) {
  const row = (item: RailItem) => {
    const active = isActive(item);
    const count = counts[item.key];
    const cls = `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium transition-colors ${active ? t.navActive : t.navIdle}`;
    const body = (
      <>
        <item.icon size={18} className={active ? "text-brand" : t.soft} />
        <span className="flex-1 text-left">{item.label}</span>
        {count !== undefined && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.chip}`}>{fmtRailNum(count)}</span>}
        {item.key === "trip-lock" && <TripLockRailPill open dark={dark} />}
      </>
    );
    return item.view && onView ? (
      <button
        key={item.key}
        type="button"
        onClick={() => {
          onView(item.view as RailView);
          onNavigate();
        }}
        aria-current={active ? "page" : undefined}
        className={cls}
      >
        {body}
      </button>
    ) : (
      <Link key={item.key} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cls}>
        {body}
      </Link>
    );
  };

  return (
    <>
      {RAIL_GROUPS.map((group, i) => (
        <div key={group.label ?? "top"} className={i === 0 ? "space-y-1" : `mt-2 space-y-1 border-t pt-2 ${t.border}`}>
          {group.label && <p className={`px-3 pb-0.5 pt-1 text-[11px] font-bold uppercase tracking-[0.09em] ${t.soft}`}>{group.label}</p>}
          {group.items.map(row)}
        </div>
      ))}
    </>
  );
}

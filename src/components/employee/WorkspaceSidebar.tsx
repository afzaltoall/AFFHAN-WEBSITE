"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutList, UserRound } from "lucide-react";
import { EmployeeSignOut } from "@/components/employee/EmployeeSignOut";
import { sideRow, wt } from "@/components/employee/workspace-ui";

/**
 * The workspace's rail — the console's, down to the geometry.
 *
 * An icon rail 60px wide that opens to 272px when the pointer or the keyboard
 * focus is in it, overlaying the page rather than pushing it: the outer div
 * reserves the 60px and never changes, so nothing reflows when the mouse
 * crosses the left edge. That is the console's reasoning and it applies here
 * with more force, not less — this screen is a list of leads that wants the
 * width, and its navigation is read once a session.
 *
 * Profile is listed and marked. There is nowhere to send anybody yet, so it is
 * not a link: a nav row that navigates nowhere is worse than one that says it
 * is coming.
 */
export function WorkspaceSidebar({
  name,
  detail,
  image,
}: {
  name: string;
  detail: string;
  image: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onDashboard = pathname?.startsWith("/employee/dashboard") ?? false;

  const label = `overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
    open ? "ml-2.5 max-w-[190px] opacity-100" : "ml-0 max-w-0 opacity-0"
  }`;
  const iconCol = "relative flex h-[22px] w-8 shrink-0 items-center justify-center";

  return (
    <div className="hidden w-[60px] shrink-0 lg:block">
      <aside
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={() => setOpen(true)}
        // Only when focus actually leaves: moving between two controls inside
        // fires a blur too, and closing on that would shut the rail under a
        // keyboard user mid-Tab.
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        className={`sticky top-0 z-40 flex h-screen flex-col overflow-hidden border-r backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none ${wt.border} ${
          open ? "w-[272px] bg-white shadow-2xl" : "w-[60px] bg-white/80"
        }`}
      >
        <Link href="/employee/dashboard/" className="flex items-center px-3.5 py-5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${wt.thumb}`}>
            <Image src="/logo.png" alt="Affhan" width={22} height={22} className="object-contain" />
          </span>
          <span className={`leading-tight ${label}`}>
            <span className="block text-sm font-semibold tracking-tight">Affhan</span>
            <span className={`block text-[11px] ${wt.soft}`}>Staff workspace</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-2">
          <Link
            href="/employee/dashboard/"
            title="Dashboard"
            aria-current={onDashboard ? "page" : undefined}
            className={`${sideRow} gap-0 px-1.5 ${onDashboard ? wt.navActive : wt.navIdle}`}
          >
            <span className={iconCol}>
              <LayoutList size={17} className={onDashboard ? "text-brand" : wt.soft} />
            </span>
            <span className={`flex-1 ${label}`}>Dashboard</span>
          </Link>

          <span
            title="Profile — coming soon"
            aria-disabled="true"
            className={`${sideRow} gap-0 cursor-default px-1.5 ${wt.soft}`}
          >
            <span className={iconCol}>
              <UserRound size={17} className={wt.soft} />
            </span>
            <span className={`flex-1 ${label}`}>Profile</span>
            <span
              className={`shrink-0 overflow-hidden whitespace-nowrap rounded-full text-[10px] font-bold leading-5 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${wt.chip} ${
                open ? "ml-1 max-w-[72px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"
              }`}
            >
              Soon
            </span>
          </span>
        </nav>

        <div className={`border-t p-2 ${wt.border}`}>
          <div className="flex items-center px-1.5 py-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10"
              />
            ) : (
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ring-1 ring-black/10 ${wt.thumb} ${wt.soft}`}>
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className={`min-w-0 flex-1 leading-tight ${label}`}>
              <span className="block truncate text-[13px] font-semibold">{name}</span>
              <span className={`block truncate text-[11px] ${wt.soft}`}>{detail}</span>
            </span>
          </div>
          <EmployeeSignOut variant="rail" collapsed={!open} />
        </div>
      </aside>
    </div>
  );
}

export default WorkspaceSidebar;

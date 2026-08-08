"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Trophy, Info, Mail } from "lucide-react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";

const ITEMS = [
  { title: "Home", href: "/", icon: Home },
  { title: "Catalog", href: "/products", icon: LayoutGrid },
  { title: "Top Ranking", href: "/rankings", icon: Trophy },
  { title: "About", href: "/about", icon: Info },
  { title: "Contact", href: "/contact", icon: Mail },
];

/**
 * Floating Apple-style quick-nav dock. The magnify interaction is mouse-based,
 * so it is shown on desktop only (lg+); touch devices keep the normal nav.
 */
export function CatalogueDock() {
  const pathname = usePathname();

  return (
    <div className="hidden lg:block fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-full">
      <Dock className="items-end pb-3 bg-white/80 backdrop-blur-md ring-1 ring-slate-200 shadow-xl">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} aria-label={item.title}>
              <DockItem
                className={`aspect-square rounded-full ${
                  active ? "bg-brand/15 ring-1 ring-brand/40" : "bg-slate-100 hover:bg-slate-200"
                }`}
              >
                <DockLabel>{item.title}</DockLabel>
                <DockIcon>
                  <Icon className={`h-full w-full ${active ? "text-brand-dark" : "text-slate-600"}`} />
                </DockIcon>
              </DockItem>
            </Link>
          );
        })}
      </Dock>
    </div>
  );
}

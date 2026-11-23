"use client";

import Link from "next/link";
import { useWorkspaceNav } from "@/components/employee/workspace-nav";

/**
 * A tracker's two views of the Instagram task (HR, the owner: "hr also included in this task he do the task and check
 * everyone status too"): their own accounts, and everyone's. A press is answered at once, as the tabs' are
 * (workspace-nav).
 */
export function InstagramViews({ at }: { at: "mine" | "everyone" }) {
  const nav = useWorkspaceNav();
  const items = [
    { key: "mine", href: "/employee/instagram/", label: "My accounts" },
    { key: "everyone", href: "/employee/instagram/team/", label: "Everyone" },
  ] as const;
  return (
    <nav aria-label="Instagram task" className="inline-flex rounded-full bg-black/[0.06] p-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          onNavigate={() => nav.start(i.href)}
          aria-current={at === i.key ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-[14px] font-semibold transition-colors sm:text-[13px] ${
            at === i.key ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#48484a] hover:text-[#1d1d1f]"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export default InstagramViews;

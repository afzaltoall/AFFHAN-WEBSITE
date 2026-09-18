"use client";

import { usePathname } from "next/navigation";
import { AdminRail } from "@/components/admin/AdminRail";

/**
 * Puts the admin rail beside every console page except the dashboard, which
 * draws its own. Below lg the rail is hidden, as the dashboard's is, and each
 * page keeps its own way back.
 */
export function AdminFrame({
  name,
  image,
  children,
}: {
  name: string;
  image: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  if (pathname === "/admin" || pathname === "/admin/") return <>{children}</>;

  // The pages that have a dark theme of their own for the rail to match.
  const supportsDark = /^\/admin\/(suppliers|videos)(\/|$)/.test(pathname);

  return (
    <div className="flex">
      <AdminRail name={name} image={image} supportsDark={supportsDark} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default AdminFrame;

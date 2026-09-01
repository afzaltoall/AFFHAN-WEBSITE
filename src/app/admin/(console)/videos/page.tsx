import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { VideoManagement } from "@/components/admin/VideoManagement";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Videos | Affhan Admin",
  robots: { index: false, follow: false },
};

export default async function VideosPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true },
  });

  return <VideoManagement categories={categories} />;
}

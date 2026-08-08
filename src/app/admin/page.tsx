import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const [productCount, categoryCount, inquiryCount, inquiries, deletedInquiries] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.inquiry.count({ where: { status: { not: "deleted" } } }),
    prisma.inquiry.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 200, include: { product: true } }),
    prisma.inquiry.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 200, include: { product: true } }),
  ]);

  const mapInquiry = (i: (typeof inquiries)[number]) => ({
    id: i.id,
    createdAt: i.createdAt.toISOString(),
    customerName: i.customerName,
    companyName: i.companyName,
    email: i.email,
    country: i.country,
    phone: i.phone,
    productName: i.productName,
    productId: i.productId,
    productImage: i.product?.imageUrl || null,
    quantity: i.quantity,
    message: i.message,
    status: i.status,
  });

  const data = {
    adminName: admin.name || admin.email,
    adminEmail: admin.email,
    adminImage: admin.image ?? null,
    stats: {
      products: productCount,
      categories: categoryCount,
      inquiries: inquiryCount,
    },
    inquiries: inquiries.map(mapInquiry),
    deletedInquiries: deletedInquiries.map(mapInquiry),
  };

  return <AdminConsole data={data} />;
}

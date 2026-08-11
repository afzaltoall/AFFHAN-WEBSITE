import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { AdminAutoLogout } from "@/components/admin/AdminAutoLogout";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const [productCount, categoryCount, inquiryCount, inquiries, deletedInquiries, contactCount, contacts, deletedContacts] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.inquiry.count({ where: { status: { not: "deleted" } } }),
    prisma.inquiry.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 200, include: { product: true } }),
    prisma.inquiry.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 200, include: { product: true } }),
    prisma.contactMessage.count({ where: { status: { not: "deleted" } } }),
    prisma.contactMessage.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.contactMessage.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 200 }),
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

  const mapContact = (c: (typeof contacts)[number]) => ({
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    productName: c.productName,
    message: c.message,
    status: c.status,
  });

  const data = {
    adminName: admin.name || admin.email,
    adminEmail: admin.email,
    adminImage: admin.image ?? null,
    stats: {
      products: productCount,
      categories: categoryCount,
      inquiries: inquiryCount,
      contacts: contactCount,
    },
    inquiries: inquiries.map(mapInquiry),
    deletedInquiries: deletedInquiries.map(mapInquiry),
    contacts: contacts.map(mapContact),
    deletedContacts: deletedContacts.map(mapContact),
  };

  return (
    <>
      <AdminAutoLogout />
      <AdminConsole data={data} />
    </>
  );
}

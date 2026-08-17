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

  const [productCount, categoryCount, inquiryCount, inquiries, deletedInquiries, contactCount, contacts, deletedContacts, jobAlertCount, jobAlerts, deletedJobAlerts] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
    prisma.inquiry.count({ where: { status: { not: "deleted" } } }),
    // High take so the "All" customer checklist and grouping never silently drop
    // rows — the master export reads the full DB server-side regardless.
    prisma.inquiry.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 5000, include: { product: true } }),
    prisma.inquiry.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 500, include: { product: true } }),
    prisma.contactMessage.count({ where: { status: { not: "deleted" } } }),
    prisma.contactMessage.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.contactMessage.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.jobAlert.count({ where: { status: { not: "deleted" } } }),
    prisma.jobAlert.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.jobAlert.findMany({ where: { status: "deleted" }, orderBy: { createdAt: "desc" }, take: 200 }),
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
    fullName: c.fullName,
    email: c.email,
    companyName: c.companyName,
    country: c.country,
    phone: c.phone,
    message: c.message,
    status: c.status,
  });

  const mapJobAlert = (j: (typeof jobAlerts)[number]) => ({
    id: j.id,
    createdAt: j.createdAt.toISOString(),
    email: j.email,
    status: j.status,
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
      jobAlerts: jobAlertCount,
    },
    inquiries: inquiries.map(mapInquiry),
    deletedInquiries: deletedInquiries.map(mapInquiry),
    contacts: contacts.map(mapContact),
    deletedContacts: deletedContacts.map(mapContact),
    jobAlerts: jobAlerts.map(mapJobAlert),
    deletedJobAlerts: deletedJobAlerts.map(mapJobAlert),
  };

  return (
    <>
      <AdminAutoLogout />
      <AdminConsole data={data} />
    </>
  );
}

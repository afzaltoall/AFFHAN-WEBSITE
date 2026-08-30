import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma, withDbRetry } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const dynamic = "force-dynamic";

// Extra safeguard alongside the robots.ts disallow rule — belt-and-braces,
// since a disallow rule alone doesn't stop a URL that's already linked
// elsewhere from being indexed (Google can still index a disallowed URL with
// no snippet, just from its address). This tag prevents indexing outright.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  // Four round trips, not thirteen.
  //
  // This fired thirteen concurrent queries against a pool of ten, which is
  // where the intermittent PrismaClientKnownRequestError came from: Neon's
  // free tier suspends after a few minutes idle, and the first load after that
  // woke a cold database with more queries at once than it had connections,
  // so the surplus queued until they timed out. Every count is now one SQL
  // statement, and each active/deleted pair is one query split in JavaScript
  // rather than two round trips asking the same table opposite questions.
  const [counts, allInquiries, allContacts, allJobAlerts] = await withDbRetry(() =>
    Promise.all([
      prisma.$queryRaw<[{
        products: bigint; categories: bigint; categoriesTotal: bigint;
        inquiries: bigint; contacts: bigint; jobAlerts: bigint; suppliers: bigint;
      }]>`
        SELECT
          (SELECT count(*) FROM "Product")                                        AS products,
          -- Categories a customer can actually browse, matching what the public
          -- site advertises. The raw row count is 634, but 125 of those are
          -- empty nodes in CJ's tree that never appear in any category UI.
          (SELECT count(*) FROM "Category" c
             WHERE EXISTS (SELECT 1 FROM "Product" p WHERE p."categoryId" = c."id")) AS categories,
          (SELECT count(*) FROM "Category")                                       AS "categoriesTotal",
          (SELECT count(*) FROM "Inquiry"        WHERE status <> 'deleted')        AS inquiries,
          (SELECT count(*) FROM "ContactMessage" WHERE status <> 'deleted')        AS contacts,
          (SELECT count(*) FROM "JobAlert"       WHERE status <> 'deleted')        AS "jobAlerts",
          (SELECT count(*) FROM "Supplier")                                        AS suppliers
      `,
      // High take so the "All" customer checklist and grouping never silently
      // drop rows — the master export reads the full DB server-side regardless.
      // Only imageUrl is read off the relation (see mapInquiry below), but
      // `include: { product: true }` fetched every Product column — cjPid, sku,
      // description and the allImages JSON among them. Measured on the live
      // data that was 54KB of the 134KB this page ships, to use one string.
      prisma.inquiry.findMany({
        orderBy: { createdAt: "desc" },
        take: 5500,
        include: { product: { select: { imageUrl: true } } },
      }),
      prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 400 }),
      prisma.jobAlert.findMany({ orderBy: { createdAt: "desc" }, take: 400 }),
    ])
  );

  const n = (v: bigint) => Number(v);
  const productCount = n(counts[0].products);
  const categoryCount = n(counts[0].categories);
  const categoryTotal = n(counts[0].categoriesTotal);
  const inquiryCount = n(counts[0].inquiries);
  const contactCount = n(counts[0].contacts);
  const jobAlertCount = n(counts[0].jobAlerts);
  const supplierCount = n(counts[0].suppliers);

  const inquiries = allInquiries.filter((i) => i.status !== "deleted");
  const deletedInquiries = allInquiries.filter((i) => i.status === "deleted");
  const contacts = allContacts.filter((c) => c.status !== "deleted");
  const deletedContacts = allContacts.filter((c) => c.status === "deleted");
  const jobAlerts = allJobAlerts.filter((j) => j.status !== "deleted");
  const deletedJobAlerts = allJobAlerts.filter((j) => j.status === "deleted");

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
      categoriesTotal: categoryTotal,
      inquiries: inquiryCount,
      contacts: contactCount,
      jobAlerts: jobAlertCount,
      suppliers: supplierCount,
    },
    inquiries: inquiries.map(mapInquiry),
    deletedInquiries: deletedInquiries.map(mapInquiry),
    contacts: contacts.map(mapContact),
    deletedContacts: deletedContacts.map(mapContact),
    jobAlerts: jobAlerts.map(mapJobAlert),
    deletedJobAlerts: deletedJobAlerts.map(mapJobAlert),
  };

  return <AdminConsole data={data} />;
}

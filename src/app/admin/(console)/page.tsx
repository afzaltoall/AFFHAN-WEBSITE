import { redirect } from "next/navigation";
import { customerCodeMap } from "@/lib/customerCode";
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
  const [counts, allInquiries, allContacts, inquiryCountryRows, contactCountryRows, employees, inquiryAssigneeRows, contactAssigneeRows, latestOutcomes, customerCodes] = await withDbRetry(() =>
    Promise.all([
      prisma.$queryRaw<[{
        products: bigint; categories: bigint; categoriesTotal: bigint;
        inquiries: bigint; contacts: bigint; suppliers: bigint; videos: bigint; queue: bigint; queueInvalid: bigint;
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
          (SELECT count(*) FROM "Supplier")                                        AS suppliers,
          (SELECT count(*) FROM "Video")                                           AS videos,
          -- Customers going round the rotation queue right now. It belongs on
          -- the sidebar because a queue nobody looks at is a queue that has
          -- quietly stopped moving.
          (SELECT count(*) FROM "LeadQueueEntry" WHERE state = 'ROTATING')         AS queue,
          -- Given up on, and counted separately: these need a person, and
          -- folding them into the rotating figure would hide the ones that do.
          (SELECT count(*) FROM "LeadQueueEntry" WHERE state = 'INVALID')           AS "queueInvalid"
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
      // The country filter's option list, and the counts behind the
      // cross-reference badge. groupBy rather than a distinct select for two
      // reasons: it answers "which countries exist" and "how many rows each"
      // in one statement, and it counts the WHOLE table rather than the
      // take:5500 / take:400 slices above — so a country with rows past the
      // cap still appears in the dropdown, and the "N matching entries" badge
      // never understates. Two more statements on a four-round-trip page.
      prisma.inquiry.groupBy({
        by: ["country"],
        where: { status: { not: "deleted" } },
        _count: { _all: true },
      }),
      prisma.contactMessage.groupBy({
        by: ["country"],
        where: { status: { not: "deleted" } },
        _count: { _all: true },
      }),
      // Who a lead can be handed to. Active only: a deactivated colleague
      // cannot sign in, so offering them in the picker would park work where
      // nobody will see it. Existing assignments to somebody since deactivated
      // still resolve, because the rows below are keyed by id.
      prisma.employee.findMany({
        where: { isActive: true },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, region: true, image: true },
      }),
      // The counts beside each name in the filter, and the "Unassigned" count
      // — the null group. groupBy for the same reason the country options use
      // it: it counts the whole table rather than the take-capped slices.
      prisma.inquiry.groupBy({
        by: ["assignedToId"],
        where: { status: { not: "deleted" } },
        _count: { _all: true },
      }),
      prisma.contactMessage.groupBy({
        by: ["assignedToId"],
        where: { status: { not: "deleted" } },
        _count: { _all: true },
      }),
      // The newest sales outcome per lead, both tables in one statement.
      //
      // DISTINCT ON is the whole reason this is raw SQL: "the latest row per
      // lead" is one index scan that way (StatusUpdate is indexed on
      // inquiryId/contactId + createdAt desc), where Prisma would want either
      // every row back to reduce in JavaScript or one query per lead. Two
      // halves rather than two queries, so the page keeps its round-trip
      // budget — see the note at the top.
      prisma.$queryRaw<{ kind: string; leadId: string; status: string; note: string | null; createdAt: Date; byName: string }[]>`
        (SELECT DISTINCT ON (su."inquiryId")
                'inquiry' AS kind, su."inquiryId" AS "leadId", su.status, su.note, su."createdAt", e.name AS "byName"
           FROM "StatusUpdate" su
           JOIN "Employee" e ON e.id = su."employeeId"
          WHERE su."inquiryId" IS NOT NULL
          ORDER BY su."inquiryId", su."createdAt" DESC)
        UNION ALL
        (SELECT DISTINCT ON (su."contactId")
                'contact' AS kind, su."contactId" AS "leadId", su.status, su.note, su."createdAt", e.name AS "byName"
           FROM "StatusUpdate" su
           JOIN "Employee" e ON e.id = su."employeeId"
          WHERE su."contactId" IS NOT NULL
          ORDER BY su."contactId", su."createdAt" DESC)
      `,
      // Every customer’s permanent number, key → AFFHAN-xxxx. One short row
      // each, and the grouping that needs them happens in the browser, so
      // it is the whole table rather than a lookup per group.
      customerCodeMap(),
    ])
  );

  // Keyed for the two mappers below.
  const outcomeByLead = new Map(
    latestOutcomes.map((o) => [
      `${o.kind}:${o.leadId}`,
      { status: o.status, by: o.byName, note: o.note, at: o.createdAt.toISOString() },
    ]),
  );

  const n = (v: bigint) => Number(v);
  const productCount = n(counts[0].products);
  const categoryCount = n(counts[0].categories);
  const categoryTotal = n(counts[0].categoriesTotal);
  const inquiryCount = n(counts[0].inquiries);
  const contactCount = n(counts[0].contacts);
  const supplierCount = n(counts[0].suppliers);
  const queueCount = n(counts[0].queue);
  const queueInvalidCount = n(counts[0].queueInvalid);
  const videoCount = n(counts[0].videos);

  const inquiries = allInquiries.filter((i) => i.status !== "deleted");
  const deletedInquiries = allInquiries.filter((i) => i.status === "deleted");
  const contacts = allContacts.filter((c) => c.status !== "deleted");
  const deletedContacts = allContacts.filter((c) => c.status === "deleted");

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
    userId: i.userId,
    assignedToId: i.assignedToId,
    lastStatus: outcomeByLead.get(`inquiry:${i.id}`) ?? null,
    customerStatus: i.customerStatus,
    statusNote: i.statusNote,
    statusUpdatedAt: i.statusUpdatedAt?.toISOString() ?? null,
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
    assignedToId: c.assignedToId,
    lastStatus: outcomeByLead.get(`contact:${c.id}`) ?? null,
  });

  // ContactMessage.country is `String @default("")`, so blanks are real and
  // must not become an empty row in the dropdown. Sorted by volume: the
  // countries worth filtering to are the ones with rows behind them, and an
  // alphabetical list would bury India under Afghanistan.
  const toCountryOptions = (rows: { country: string; _count: { _all: number } }[]) =>
    rows
      .filter((r) => r.country.trim() !== "")
      .map((r) => ({ country: r.country, count: r._count._all }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

  /** groupBy rows to { employeeId | null, count } — null is "unassigned". */
  const toAssigneeCounts = (rows: { assignedToId: string | null; _count: { _all: number } }[]) =>
    rows.map((r) => ({ employeeId: r.assignedToId, count: r._count._all }));

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
      suppliers: supplierCount,
      videos: videoCount,
      queue: queueCount,
      queueInvalid: queueInvalidCount,
    },
    inquiries: inquiries.map(mapInquiry),
    deletedInquiries: deletedInquiries.map(mapInquiry),
    contacts: contacts.map(mapContact),
    deletedContacts: deletedContacts.map(mapContact),
    inquiryCountries: toCountryOptions(inquiryCountryRows),
    contactCountries: toCountryOptions(contactCountryRows),
    employees: employees.map((e) => ({ id: e.id, name: e.name, region: e.region, image: e.image })),
    inquiryAssignees: toAssigneeCounts(inquiryAssigneeRows),
    contactAssignees: toAssigneeCounts(contactAssigneeRows),
    customerCodes,
  };

  return <AdminConsole data={data} />;
}

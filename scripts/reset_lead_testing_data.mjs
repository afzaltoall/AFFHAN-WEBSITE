// Clears everything the lead-queue feature has recorded, and nothing else.
//
// Written for one job: the queue, the rotation and the sales outcomes were
// tested against the live database, and the office wants to start from clean
// before real use. It removes the METADATA that testing produced and leaves
// the customers themselves exactly as they are.
//
//   CLEARED
//     StatusUpdate        every recorded outcome (In progress / Lead / No lead
//                         / Not attended), across every employee
//     LeadQueueEvent      the rotation trail
//     LeadQueueEntry      the queue itself — rotating, settled and given up on
//     Inquiry             assignedToId and assignedAt set back to null
//     ContactMessage      the same two columns
//     Inquiry.status      "handled" back to "new", but ONLY on leads that
//     ContactMessage      carried one of the outcomes being deleted — a lead
//                         somebody triaged by hand months ago is not this
//                         feature's doing and keeps its triage. Worked out
//                         before the outcomes go, because afterwards there is
//                         no way to tell the two apart
//
//   NOT TOUCHED, deliberately
//     the inquiries and messages themselves — name, product, quantity,
//       message, phone, email, country, dates: every column a customer wrote
//     Employee rows — the accounts, names, photos, regions and passwords stay;
//       only what was assigned to them and what they recorded goes, which is
//       what makes their counters read zero
//     Inquiry.customerStatus — the lifecycle the customer is shown (PENDING /
//       CHECKED / ...), which is a different vocabulary with a different
//       audience and predates all of this
//     any lead marked "handled" or "spam" that carried no tested outcome —
//       that triage was somebody's deliberate decision, not a side effect
//     Inquiry.customerKey — derived from the phone number, not recorded by
//       anybody. The queue needs it and the backfill would only put it back
//     InquiryStatusEvent — the customer-facing lifecycle trail, which predates
//       all of this
//
//   node scripts/reset_lead_testing_data.mjs            # counts only, writes nothing
//   node scripts/reset_lead_testing_data.mjs --apply    # clears, after a backup
//
// The dry run prints exactly what would go, table by table, including the name
// on every lead whose assignment would be cleared — the point being that
// nobody should have to take this script's word for what it is about to do.
//
// --apply writes a JSON backup of every row it deletes and every assignment it
// clears, beside the repository, BEFORE touching anything. It is not a
// migration: running it twice is harmless but pointless, and running it after
// real use would throw away real work. That is why it is not idempotent by
// design and says so here.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(path.join(root, "package.json"));

for (const file of [".env.local", ".env"]) {
  try {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const match = text.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match && !process.env.DATABASE_URL) process.env.DATABASE_URL = match[1];
  } catch {}
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const rule = (label) => console.log(`\n${label}\n${"─".repeat(label.length)}`);
const n = (v) => String(v).padStart(5);

// ------------------------------------------------------------ what is there
const [statusUpdates, queueEvents, queueEntries, assignedInquiries, assignedContacts] = await Promise.all([
  prisma.statusUpdate.findMany({
    select: {
      id: true, status: true, note: true, createdAt: true, employeeId: true, inquiryId: true, contactId: true,
      employee: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  }),
  prisma.leadQueueEvent.findMany({ orderBy: { createdAt: "asc" } }),
  prisma.leadQueueEntry.findMany({ orderBy: { enteredAt: "asc" } }),
  prisma.inquiry.findMany({
    where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] },
    select: { id: true, customerName: true, productName: true, assignedToId: true, assignedAt: true, assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  }),
  prisma.contactMessage.findMany({
    where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] },
    select: { id: true, fullName: true, assignedToId: true, assignedAt: true, assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  }),
]);

// Leads that testing marked "handled" — which is to say, leads that both
// carry one of the outcomes above and sit in the handled bucket. Worked out
// now, while the outcomes still exist to point at them.
const touchedInquiryIds = [...new Set(statusUpdates.map((u) => u.inquiryId).filter(Boolean))];
const touchedContactIds = [...new Set(statusUpdates.map((u) => u.contactId).filter(Boolean))];
const [handledInquiries, handledContacts] = await Promise.all([
  touchedInquiryIds.length
    ? prisma.inquiry.findMany({
        where: { id: { in: touchedInquiryIds }, status: "handled" },
        select: { id: true, customerName: true, productName: true },
      })
    : Promise.resolve([]),
  touchedContactIds.length
    ? prisma.contactMessage.findMany({
        where: { id: { in: touchedContactIds }, status: "handled" },
        select: { id: true, fullName: true },
      })
    : Promise.resolve([]),
]);

// And what is NOT being touched, so the two lists can be compared.
const [inquiryTotal, contactTotal, employeeTotal, statusEventTotal] = await Promise.all([
  prisma.inquiry.count(),
  prisma.contactMessage.count(),
  prisma.employee.count(),
  prisma.inquiryStatusEvent.count(),
]);

rule("TO BE CLEARED");
console.log(`  StatusUpdate        ${n(statusUpdates.length)}  every recorded outcome`);
console.log(`  LeadQueueEvent      ${n(queueEvents.length)}  the rotation trail`);
console.log(`  LeadQueueEntry      ${n(queueEntries.length)}  queue entries of every state`);
console.log(`  Inquiry             ${n(assignedInquiries.length)}  assignment cleared (the rows stay)`);
console.log(`  ContactMessage      ${n(assignedContacts.length)}  assignment cleared (the rows stay)`);
console.log(`  Inquiry.status      ${n(handledInquiries.length)}  "handled" -> "new", tested leads only`);
console.log(`  ContactMessage      ${n(handledContacts.length)}  "handled" -> "new", tested leads only`);

if (statusUpdates.length) {
  const byStatus = new Map();
  const byEmployee = new Map();
  for (const u of statusUpdates) {
    byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1);
    byEmployee.set(u.employee.name, (byEmployee.get(u.employee.name) ?? 0) + 1);
  }
  console.log("\n  outcomes by kind:");
  for (const [k, v] of [...byStatus].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(14)} ${v}`);
  console.log("  outcomes by who recorded them:");
  for (const [k, v] of [...byEmployee].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(18)} ${v}`);
  const first = statusUpdates[0].createdAt, last = statusUpdates[statusUpdates.length - 1].createdAt;
  console.log(`  recorded between ${first.toISOString()} and ${last.toISOString()}`);
}

if (queueEntries.length) {
  console.log("\n  queue entries:");
  for (const e of queueEntries) {
    console.log(`     ${e.customerName.padEnd(24)} ${e.state.padEnd(9)} ${e.closedReason ?? ""}`);
  }
}

// Every lead whose assignment goes, by name — this is the list to read.
if (assignedInquiries.length || assignedContacts.length) {
  console.log("\n  assignments to be cleared:");
  for (const r of assignedInquiries) {
    console.log(`     inquiry   ${r.customerName.padEnd(24)} ${(r.assignedTo?.name ?? "(no employee)").padEnd(18)} ${r.productName.slice(0, 44)}`);
  }
  for (const r of assignedContacts) {
    console.log(`     message   ${r.fullName.padEnd(24)} ${(r.assignedTo?.name ?? "(no employee)").padEnd(18)}`);
  }
}

if (handledInquiries.length || handledContacts.length) {
  console.log("\n  triage going back to new (these carried a tested outcome):");
  for (const r of handledInquiries) console.log(`     inquiry   ${r.customerName.padEnd(24)} ${r.productName.slice(0, 50)}`);
  for (const r of handledContacts) console.log(`     message   ${r.fullName}`);
}

rule("LEFT ALONE");
console.log(`  Inquiry rows        ${n(inquiryTotal)}  every column the customer wrote`);
console.log(`  ContactMessage rows ${n(contactTotal)}  same`);
console.log(`  Employee accounts   ${n(employeeTotal)}  names, photos, regions, passwords`);
console.log(`  InquiryStatusEvent  ${n(statusEventTotal)}  the customer-facing lifecycle trail`);
console.log(`  Inquiry.status, customerStatus, customerKey — untouched (see the note at the top)`);

const nothing =
  statusUpdates.length + queueEvents.length + queueEntries.length + assignedInquiries.length +
    assignedContacts.length + handledInquiries.length + handledContacts.length === 0;

if (!apply) {
  console.log(
    nothing
      ? "\nNothing to clear — this is already the clean state."
      : "\nDry run. Nothing has been written. Pass --apply to clear all of the above."
  );
  await prisma.$disconnect();
  process.exit(0);
}

if (nothing) {
  console.log("\nNothing to clear.");
  await prisma.$disconnect();
  process.exit(0);
}

// ------------------------------------------------------------------- backup
const backup = path.join(root, `lead-testing-reset-backup-${Date.now()}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(
    {
      takenAt: new Date().toISOString(),
      statusUpdates,
      queueEvents,
      queueEntries,
      assignedInquiries: assignedInquiries.map((r) => ({ id: r.id, customerName: r.customerName, assignedToId: r.assignedToId, assignedAt: r.assignedAt })),
      assignedContacts: assignedContacts.map((r) => ({ id: r.id, fullName: r.fullName, assignedToId: r.assignedToId, assignedAt: r.assignedAt })),
      handledInquiries,
      handledContacts,
    },
    null,
    2
  )
);
console.log(`\nbackup: ${backup}`);

// -------------------------------------------------------------------- clear
// Events before entries: the foreign key cascades anyway, but deleting in the
// order the rows depend on each other means a failure halfway leaves something
// consistent rather than something half-cascaded.
const deletedEvents = await prisma.leadQueueEvent.deleteMany({});
const deletedEntries = await prisma.leadQueueEntry.deleteMany({});
const deletedUpdates = await prisma.statusUpdate.deleteMany({});
const clearedInquiries = await prisma.inquiry.updateMany({
  where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] },
  data: { assignedToId: null, assignedAt: null },
});
const clearedContacts = await prisma.contactMessage.updateMany({
  where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] },
  data: { assignedToId: null, assignedAt: null },
});
// By id, from the list worked out before the outcomes were deleted — not by
// re-deriving it now, which is no longer possible.
const untriagedInquiries = handledInquiries.length
  ? await prisma.inquiry.updateMany({ where: { id: { in: handledInquiries.map((r) => r.id) } }, data: { status: "new" } })
  : { count: 0 };
const untriagedContacts = handledContacts.length
  ? await prisma.contactMessage.updateMany({ where: { id: { in: handledContacts.map((r) => r.id) } }, data: { status: "new" } })
  : { count: 0 };

rule("CLEARED");
console.log(`  LeadQueueEvent      ${n(deletedEvents.count)}`);
console.log(`  LeadQueueEntry      ${n(deletedEntries.count)}`);
console.log(`  StatusUpdate        ${n(deletedUpdates.count)}`);
console.log(`  Inquiry             ${n(clearedInquiries.count)}  assignment cleared`);
console.log(`  ContactMessage      ${n(clearedContacts.count)}  assignment cleared`);
console.log(`  Inquiry.status      ${n(untriagedInquiries.count)}  back to new`);
console.log(`  ContactMessage      ${n(untriagedContacts.count)}  back to new`);

// ------------------------------------------------------------------- verify
// Read back rather than trust the counts above: this is the check that the
// screens will now be empty, and that the customers are still here.
const after = {
  statusUpdates: await prisma.statusUpdate.count(),
  queueEntries: await prisma.leadQueueEntry.count(),
  queueEvents: await prisma.leadQueueEvent.count(),
  assignedInquiries: await prisma.inquiry.count({ where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] } }),
  assignedContacts: await prisma.contactMessage.count({ where: { OR: [{ assignedToId: { not: null } }, { assignedAt: { not: null } }] } }),
  inquiries: await prisma.inquiry.count(),
  contacts: await prisma.contactMessage.count(),
  employees: await prisma.employee.count(),
};

rule("AFTER");
console.log(`  StatusUpdate        ${n(after.statusUpdates)}  (0 expected)`);
console.log(`  LeadQueueEntry      ${n(after.queueEntries)}  (0 expected)`);
console.log(`  LeadQueueEvent      ${n(after.queueEvents)}  (0 expected)`);
console.log(`  assigned inquiries  ${n(after.assignedInquiries)}  (0 expected)`);
console.log(`  assigned messages   ${n(after.assignedContacts)}  (0 expected)`);
console.log(`  inquiries           ${n(after.inquiries)}  (${inquiryTotal} before — unchanged)`);
console.log(`  contact messages    ${n(after.contacts)}  (${contactTotal} before — unchanged)`);
console.log(`  employees           ${n(after.employees)}  (${employeeTotal} before — unchanged)`);

const clean =
  after.statusUpdates === 0 && after.queueEntries === 0 && after.queueEvents === 0 &&
  after.assignedInquiries === 0 && after.assignedContacts === 0 &&
  after.inquiries === inquiryTotal && after.contacts === contactTotal && after.employees === employeeTotal;
console.log(clean ? "\nClean, and every customer and account still here." : "\nSomething did not match — read the numbers above.");

await prisma.$disconnect();
process.exit(clean ? 0 : 1);

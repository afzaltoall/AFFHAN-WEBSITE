/**
 * Import the WeChat supplier book from the sourcing team's spreadsheet.
 *
 *   node scripts/import_suppliers.mjs ["SUPPLIER DATA-1.xlsx"]
 *
 * Idempotent: rows are keyed on their spreadsheet row number, so re-running
 * after the team edits the sheet updates in place rather than duplicating.
 * Rows that vanish from the sheet are reported but never deleted — a row
 * missing because someone filtered the sheet before saving is far more likely
 * than a supplier we genuinely want to forget, and deletion is not recoverable.
 *
 * Nothing is parsed or cleaned here. Every cell lands in the database exactly
 * as it was typed; src/lib/suppliers.ts does the interpreting at read time so
 * the parser can improve without a re-import.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: false, quiet: true });

const prisma = new PrismaClient();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The sheet's column order. Header text is ignored — position is the contract. */
const COLUMNS = ["serial", "personName", "companyName", "productsRaw", "address", "contactRaw"];

const cell = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function readSheet(file) {
  const book = XLSX.readFile(file);
  const sheetName = book.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: false, // keep numbers as they were displayed; "0757…" must not lose its zero
  });

  const header = rows[0] || [];
  if (!/supplier/i.test(header.join(" "))) {
    throw new Error(`First row of "${sheetName}" does not look like the expected header: ${header.join(" | ")}`);
  }

  const records = [];
  rows.slice(1).forEach((row, i) => {
    const record = { sourceRow: i + 2 }; // 1-based, plus the header
    COLUMNS.forEach((key, col) => (record[key] = cell(row[col])));
    // The sheet is padded with ~100 blank rows below the data.
    if (COLUMNS.every((k) => record[k] === null)) return;
    // Anything typed past column F would be silently lost, so refuse instead.
    const overflow = row.slice(COLUMNS.length).filter((v) => cell(v) !== null);
    if (overflow.length) {
      throw new Error(`Row ${record.sourceRow} has data past column F: ${JSON.stringify(overflow)}`);
    }
    const serial = record.serial === null ? null : Number.parseInt(record.serial, 10);
    record.serial = Number.isNaN(serial) ? null : serial;
    records.push(record);
  });
  return { sheetName, records };
}

async function main() {
  const file = path.resolve(root, process.argv[2] || "SUPPLIER DATA-1.xlsx");
  if (!fs.existsSync(file)) throw new Error(`Spreadsheet not found: ${file}`);

  const { sheetName, records } = readSheet(file);
  console.log(`Read ${records.length} supplier rows from "${sheetName}" (${path.basename(file)})`);

  const before = await prisma.supplier.count();
  let created = 0;
  let updated = 0;

  for (const record of records) {
    const { sourceRow, ...data } = record;
    const existing = await prisma.supplier.findUnique({ where: { sourceRow }, select: { id: true } });
    await prisma.supplier.upsert({ where: { sourceRow }, create: { sourceRow, ...data }, update: data });
    existing ? updated++ : created++;
  }

  const after = await prisma.supplier.count();
  const seen = new Set(records.map((r) => r.sourceRow));
  const orphans = await prisma.supplier.findMany({
    where: { sourceRow: { notIn: [...seen] } },
    select: { sourceRow: true, companyName: true, personName: true },
  });

  console.log(`\nCreated ${created}, updated ${updated}. Supplier rows: ${before} -> ${after}`);
  if (orphans.length) {
    console.log(`\n${orphans.length} row(s) in the database are no longer in the sheet (left in place, not deleted):`);
    orphans.forEach((o) => console.log(`  row ${o.sourceRow}: ${o.companyName || o.personName || "(no name)"}`));
  }

  // A short completeness report, because the whole point of this sheet is the
  // contact details and it is worth knowing at a glance how many are missing.
  const [noContact, noCompany, noAddress, noName] = await Promise.all([
    prisma.supplier.count({ where: { contactRaw: null } }),
    prisma.supplier.count({ where: { companyName: null } }),
    prisma.supplier.count({ where: { address: null } }),
    prisma.supplier.count({ where: { personName: null } }),
  ]);
  console.log(
    `\nGaps: ${noContact} without a contact, ${noCompany} without a company, ` +
      `${noAddress} without an address, ${noName} without a person.`
  );
}

main()
  .catch((error) => {
    console.error("\nImport failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

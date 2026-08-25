import * as XLSX from "xlsx";
import type { SupplierRecord } from "@/lib/suppliers";
import { supplierTitle } from "@/lib/suppliers";

/**
 * The supplier export, as a real Excel workbook.
 *
 * This replaced a CSV, which could not carry column widths and — worse — had to
 * defend itself against Excel. A cell beginning "+" is read as a formula, so
 * every phone number in the file needed a leading apostrophe to survive, and
 * that apostrophe was then visible in the cell: "'+86 (0)20 2388 9722". An xlsx
 * has real cell types, so a phone number is simply declared text and arrives
 * exactly as it was written, with no escaping and no stray punctuation.
 *
 * Built on the server. SheetJS is close to a megabyte, and the directory page
 * already carries the whole supplier book — there is no reason to send a
 * spreadsheet writer to the browser as well.
 *
 * Two things this library's community build cannot do: cell styling (so the
 * header is not bold) and freeze panes (so the header does not stay put when
 * you scroll). Autofilter is set, which gives the header its dropdowns, and
 * freezing is two clicks in Excel — View, Freeze Top Row.
 */

interface Column {
  header: string;
  width: number;
  value: (r: SupplierRecord) => string | number | null;
}

const join = (parts: string[]) => parts.filter(Boolean).join("  |  ");

/**
 * Anything the reader should know about a row that the other columns cannot
 * say: a country code we supplied ourselves, a number the sheet recorded too
 * short to dial, a supplier with no contact details at all.
 */
function notes(r: SupplierRecord): string {
  const out: string[] = [];
  if (r.flags.noContact) out.push("No contact recorded");
  const assumed = r.phones.filter((p) => p.assumed).length;
  if (assumed) out.push(`+86 assumed on ${assumed} number${assumed > 1 ? "s" : ""} (no country code in the sheet)`);
  const short = r.phones.filter((p) => p.incomplete).length;
  if (short) out.push(`${short} number${short > 1 ? "s" : ""} too short to dial — check`);
  return out.join("; ");
}

const COLUMNS: Column[] = [
  { header: "S.No", width: 7, value: (r) => r.serial },
  { header: "Company", width: 44, value: (r) => r.company || (r.person ? "" : supplierTitle(r)) },
  { header: "Contact person", width: 22, value: (r) => r.person },
  { header: "Products", width: 34, value: (r) => r.productsRaw },
  { header: "Phone number(s)", width: 30, value: (r) => join(r.phones.map((p) => p.value)) },
  {
    header: "Phone — international",
    width: 24,
    value: (r) => join(r.phones.map((p) => p.e164 || "")),
  },
  { header: "WeChat / messenger ID", width: 24, value: (r) => join(r.handles.map((h) => h.value)) },
  { header: "Website", width: 22, value: (r) => join(r.webs.map((w) => w.value)) },
  { header: "Address", width: 60, value: (r) => r.address },
  { header: "Contact — exactly as recorded", width: 34, value: (r) => r.contactRaw },
  { header: "Notes", width: 40, value: notes },
];

export function buildSupplierWorkbook(records: SupplierRecord[]): Buffer {
  const sheet: XLSX.WorkSheet = {};
  const lastCol = COLUMNS.length - 1;
  const lastRow = records.length; // header occupies row 0

  COLUMNS.forEach((col, c) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c })] = { t: "s", v: col.header };
  });

  records.forEach((record, i) => {
    COLUMNS.forEach((col, c) => {
      const raw = col.value(record);
      const address = XLSX.utils.encode_cell({ r: i + 1, c });
      if (raw === null || raw === "") return; // leave genuinely empty cells empty
      // S.No is a real number so the column sorts numerically. Everything else
      // is declared text — that is what stops Excel reading "+86…" as a formula
      // and stops it turning a long run of digits into 8.61254E+12.
      sheet[address] = typeof raw === "number" ? { t: "n", v: raw } : { t: "s", v: String(raw) };
    });
  });

  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } });
  sheet["!cols"] = COLUMNS.map((col) => ({ wch: col.width }));
  // Dropdown filters on the header row, so the file is usable as a working
  // list rather than a dump.
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } }),
  };

  const book = XLSX.utils.book_new();
  book.Props = {
    Title: "Affhan supplier book",
    Author: "Affhan International",
    CreatedDate: new Date(),
  };
  XLSX.utils.book_append_sheet(book, sheet, "Suppliers");

  return XLSX.write(book, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export function exportFilename(selected: boolean): string {
  const day = new Date().toISOString().slice(0, 10);
  return `affhan-suppliers-${selected ? "selected-" : ""}${day}.xlsx`;
}

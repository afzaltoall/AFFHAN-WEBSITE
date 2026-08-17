import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { groupCustomers, buildCustomerSheet } from "@/lib/customerGroups";

export const dynamic = "force-dynamic";

// Master export for the admin "All" view. Reads the ENTIRE database (not the
// 200-row page the console loads) and produces one .xlsx workbook with a sheet
// per data type, plus a de-duplicated "Customers" sheet where each unique
// customer (keyed by phone) is a single row listing every product they asked
// about.
//
//   GET /api/admin/export/all                -> full multi-sheet workbook
//   GET /api/admin/export/all?only=customers -> just the grouped Customers sheet
//
// Deleted rows are excluded (status !== "deleted"). Phone/code cells are forced
// to TEXT so Excel never turns 9163000000 into "9.16E+11".

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// Split a stored phone ("+91 7810012345" or bare digits) into dialing code +
// local number by parsing a leading "+NN".
function splitPhone(raw: string): { code: string; number: string } {
  const s = (raw || "").trim();
  const m = s.match(/^(\+\d{1,4})[\s-]*(.*)$/);
  if (m) return { code: m[1], number: m[2].trim() };
  return { code: "", number: s };
}

export async function GET(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const only = new URL(req.url).searchParams.get("only");

  try {
    const [inquiries, contacts, jobAlerts] = await Promise.all([
      prisma.inquiry.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" } }),
      prisma.contactMessage.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" } }),
      prisma.jobAlert.findMany({ where: { status: { not: "deleted" } }, orderBy: { createdAt: "desc" } }),
    ]);

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Force given 0-based columns of a sheet to text format, row by row.
    const forceTextCols = (ws: any, rowCount: number, cols: number[]) => {
      for (let r = 1; r <= rowCount; r++) {
        for (const c of cols) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (cell) { cell.t = "s"; cell.z = "@"; cell.v = String(cell.v ?? ""); }
        }
      }
    };

    // --- Customers (grouped, de-duplicated by phone) -------------------------
    // Each customer is a BLOCK of rows: their identity (name, phone, email…) is
    // written once on the first row and MERGED down across every one of their
    // products, so each product sits on its own clean line underneath — a
    // "table within a table". Merges are the one bit of formatting SheetJS's
    // free build reliably writes, so we lean on them instead of wrap-text.
    const groups = groupCustomers(
      inquiries.map((i) => ({
        customerName: i.customerName,
        companyName: i.companyName,
        email: i.email,
        country: i.country,
        phone: i.phone,
        productName: i.productName,
        quantity: i.quantity,
        createdAt: i.createdAt,
        status: i.status,
      }))
    );
    // Layout (no merged cells — merges bottom-align in Excel and read wrong):
    // each customer is a HEADER row carrying their contact details, followed by
    // their numbered product rows, then a blank separator. Reads top-down as a
    // clean per-customer table.
    //
    //   #  Customer            Country  Code  Phone        Inquiries  Total Qty
    //   ── Karthikeyan  ────── India    +91   7502699892   1          50
    //           Product 1  Children's Bow Hair Clip …                 Qty 50
    //   (blank row)
    //   ── Navin Kumar ─────── India    +91   8946050558   2          40
    //           Product 1  20000mah mobile power …                    Qty 20
    //           Product 2  20000mah mobile power …                    Qty 20
    const { aoa: custAoa, cols: custCols, textCols: custTextCols } = buildCustomerSheet(groups);
    const custWs = XLSX.utils.aoa_to_sheet(custAoa);
    forceTextCols(custWs, custAoa.length - 1, custTextCols); // Code, Phone → text
    custWs["!cols"] = custCols;
    XLSX.utils.book_append_sheet(wb, custWs, "Customers");

    if (only === "customers") {
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="customers-grouped-${new Date().toISOString().split("T")[0]}.xlsx"`,
        },
      });
    }

    // --- Inquiries (raw, one row per product) --------------------------------
    const inqHeaders = ["Date", "Customer", "Company", "Email", "Country", "Country Code", "Phone", "Product", "Quantity", "Message", "Status"];
    const inqRows: (string | number)[][] = inquiries.map((i) => {
      const { code, number } = splitPhone(i.phone);
      return [fmtDate(i.createdAt), i.customerName, i.companyName || "", i.email || "", i.country, code, number, i.productName, i.quantity, i.message || "", i.status];
    });
    const inqWs = XLSX.utils.aoa_to_sheet([inqHeaders, ...inqRows]);
    forceTextCols(inqWs, inqRows.length, [5, 6]);
    inqWs["!cols"] = inqHeaders.map((h) => ({ wch: h === "Message" || h === "Product" ? 40 : h === "Email" ? 26 : Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, inqWs, "Inquiries");

    // --- Contact Us ----------------------------------------------------------
    const conHeaders = ["Date", "Full Name", "Email", "Company", "Country", "Code", "Phone", "Message", "Status"];
    const conRows: (string | number)[][] = contacts.map((c) => {
      const { code, number } = splitPhone(c.phone);
      return [fmtDate(c.createdAt), c.fullName, c.email, c.companyName || "", c.country, code, number, c.message, c.status];
    });
    const conWs = XLSX.utils.aoa_to_sheet([conHeaders, ...conRows]);
    forceTextCols(conWs, conRows.length, [5, 6]); // Code, Phone → text
    conWs["!cols"] = conHeaders.map((h) => ({ wch: h === "Message" ? 50 : h === "Email" ? 26 : Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, conWs, "Contact Us");

    // --- Careers (job alerts) ------------------------------------------------
    const carHeaders = ["Date", "Email", "Status"];
    const carRows: (string | number)[][] = jobAlerts.map((j) => [fmtDate(j.createdAt), j.email, j.status]);
    const carWs = XLSX.utils.aoa_to_sheet([carHeaders, ...carRows]);
    carWs["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, carWs, "Careers");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="affhan-all-export-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Master export error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

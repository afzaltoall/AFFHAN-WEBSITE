import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const inquiries = await prisma.inquiry.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (!inquiries || inquiries.length === 0) {
      return new NextResponse("No data found to export.", { status: 404 });
    }

    // Format data for Excel
    const data = inquiries.map((inq) => ({
      Date: new Date(inq.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      Product: inq.productName,
      Quantity: inq.quantity,
      Customer: inq.customerName,
      Country: inq.country,
      Phone: inq.phone,
    }));

    // Generate Excel file buffer
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set explicit column widths so text isn't cut off
    const columnWidths = [
      { wch: 15 }, // Date
      { wch: 35 }, // Product
      { wch: 10 }, // Quantity
      { wch: 25 }, // Customer
      { wch: 15 }, // Country
      { wch: 20 }, // Phone
    ];
    worksheet["!cols"] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inquiries");
    
    // Create buffer directly
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    // Return the Excel file
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="inquiries_export.xlsx"',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, productName, quantity, customerName, companyName, email, country, phone, message } = body;

    // Basic validation
    if (!productName || !customerName || !phone) {
      return NextResponse.json(
        { error: "Missing required fields (productName, customerName, phone)" },
        { status: 400 }
      );
    }

    // Save to PostgreSQL via Prisma
    const newInquiry = await prisma.inquiry.create({
      data: {
        productId: productId ? parseInt(productId, 10) : null,
        productName,
        quantity: quantity ? parseInt(quantity, 10) : 1, // default to 1 if missing for now
        customerName,
        companyName: companyName || null,
        email: email || null,
        country: country || "Unknown",
        phone,
        message: message || null,
      },
    });

    return NextResponse.json(
      { message: "Inquiry saved successfully", inquiry: newInquiry },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error saving inquiry:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}

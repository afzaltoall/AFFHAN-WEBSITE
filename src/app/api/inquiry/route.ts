import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, productName, quantity, customerName, companyName, email, country, phone, message } = body;

    if (!productName || !quantity || !customerName || !country || !phone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Save to PostgreSQL via Prisma
    const newInquiry = await prisma.inquiry.create({
      data: {
        productId: productId ? parseInt(productId, 10) : undefined,
        productName,
        quantity: parseInt(quantity, 10),
        customerName,
        companyName,
        email,
        country,
        phone,
        message
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

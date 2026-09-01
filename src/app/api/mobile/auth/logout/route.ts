import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractBearerToken, hashMobileToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawToken = extractBearerToken(request);
    
    if (rawToken) {
      const tokenHash = hashMobileToken(rawToken);
      // Delete session from database
      await prisma.mobileSession.deleteMany({
        where: { tokenHash },
      });
    }

    // Return success even if token wasn't found (idempotent logout)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mobile Logout Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

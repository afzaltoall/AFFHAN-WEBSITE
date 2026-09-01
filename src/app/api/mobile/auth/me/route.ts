import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider,
        profileImage: user.profileImage,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Mobile Current User Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

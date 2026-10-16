import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { profileOf } from "@/lib/account-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Every key this has always sent (phone null meaning no number yet, as in the Google sign-in's reply), and
    // the company, address and hasPassword the app's "Complete your profile" reads (lib/account-profile.ts).
    return NextResponse.json({ user: profileOf(user) });
  } catch (error) {
    console.error("Mobile Current User Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

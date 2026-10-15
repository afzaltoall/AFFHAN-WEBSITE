import { NextResponse } from "next/server";
import { saveContactPhone } from "@/lib/contact-phone";
import { publicUser } from "@/lib/web-session";

export const dynamic = "force-dynamic";

/**
 * Save the signed-in customer's mobile number as typed, no code (lib/contact-phone.ts).
 *
 * For the phone dialog: after a Google sign-in on an account with no number,
 * and from Account to add or change one. `{ phone: "+919876543210" }`; the
 * answer carries the account as /me shows it.
 */
export async function POST(request: Request) {
  try {
    const result = await saveContactPhone(request, "WEB");
    if (!result.ok) return result.response;
    return NextResponse.json({ success: true, user: publicUser(result.user) });
  } catch (error) {
    console.error("Save phone error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

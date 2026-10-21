import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSupplier } from "@/lib/supplier-session";
import { checkSupplierApplyRateLimit, limitReached } from "@/lib/rate-limit";
import { readProfile } from "@/lib/supplier-offer";

export const dynamic = "force-dynamic";

const NOT_SIGNED_IN = { error: "Your session has ended. Sign in again.", reason: "signed_out" };

/** The signed-in supplier's account: the email and the contact details. Never the password hash. */
export async function GET() {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });
  return NextResponse.json({ supplier }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Change the contact details: the name and the mobile, and the company, WeChat ID and address, which are
 * optional here (the first application asks for them). The email is the sign-in and stays as registered.
 * Applications already sent keep the details they were sent with (they copy them); the next one starts from these.
 */
export async function PATCH(request: Request) {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const limit = await checkSupplierApplyRateLimit(supplier.id);
  if (!limit.success) return limitReached("You have saved a lot of changes in the last hour.", limit);

  try {
    const body = await request.json().catch(() => ({}));
    const profile = readProfile(body && typeof body === "object" ? body : {});
    if (!profile.ok) return NextResponse.json({ error: profile.error, field: profile.field }, { status: 400 });

    const saved = await prisma.supplierAccount.update({
      where: { id: supplier.id },
      data: profile.value,
      select: { id: true, email: true, name: true, companyName: true, mobile: true, wechatId: true, companyAddress: true, createdAt: true },
    });
    return NextResponse.json({ supplier: saved });
  } catch (error) {
    console.error("Supplier profile save error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Your changes did not save. Try again." }, { status: 500 });
  }
}

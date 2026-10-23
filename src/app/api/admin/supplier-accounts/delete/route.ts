import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { supplierLoginKey } from "@/lib/password";
import { removeSupplierPhotos } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 500;

/**
 * Delete the chosen supplier accounts for good, from the New Suppliers board's selection (the owner,
 * 2026-10-22). Admins only.
 *
 * Everything that is theirs goes with them, so nothing is left behind: their applications, their photos in the
 * bucket, their failed sign-ins (the lockout's rows), and their reset and sign-up codes. A deleted supplier's cookie stops
 * working at once (the account it names is gone), and the email is free to register again.
 *
 * The rows go in one transaction; the photos after it, best effort (removeSupplierPhotos), since a photo left
 * in the bucket harms nothing and must not undo a delete the admin asked for.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))] : [];
  if (!ids.length) return NextResponse.json({ error: "Choose at least one supplier." }, { status: 400 });
  if (ids.length > MAX) return NextResponse.json({ error: `Delete at most ${MAX} suppliers at a time.` }, { status: 400 });

  try {
    const accounts = await prisma.supplierAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, offers: { select: { photos: true } } },
    });
    if (!accounts.length) return NextResponse.json({ error: "Those suppliers are already deleted." }, { status: 404 });

    const found = accounts.map((a) => a.id);
    const emails = accounts.map((a) => a.email);
    const [offers, deleted] = await prisma.$transaction([
      prisma.supplierOffer.deleteMany({ where: { supplierId: { in: found } } }),
      prisma.supplierAccount.deleteMany({ where: { id: { in: found } } }),
      prisma.loginAttempt.deleteMany({ where: { email: { in: emails.map(supplierLoginKey) } } }),
      prisma.emailOtp.deleteMany({ where: { email: { in: emails }, purpose: { in: ["SUPPLIER_PASSWORD_RESET", "SUPPLIER_SIGNUP"] } } }),
    ]);
    const photos = await removeSupplierPhotos(accounts.flatMap((a) => a.offers.flatMap((o) => o.photos)));

    return NextResponse.json({ deleted: deleted.count, applications: offers.count, photos, ids: found });
  } catch (error) {
    console.error("supplier delete failed:", error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown");
    return NextResponse.json({ error: "The suppliers were not deleted. Try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The signed-in user's own submitted quote requests.
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ inquiries: [] }, { status: 401 });

  const rows = await prisma.$queryRaw<Array<{
    id: string; productName: string; quantity: number; country: string; phone: string; createdAt: Date;
  }>>`
    SELECT "id","productName","quantity","country","phone","createdAt"
    FROM "Inquiry" WHERE "userId" = ${session.id}
    ORDER BY "createdAt" DESC
  `;

  return NextResponse.json({
    inquiries: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
}

import { NextResponse } from "next/server";
import { createCargo, listCargo, readCargoActor } from "@/lib/cargo";
import { PRIVATE, bodyOf, cargoFailure } from "@/lib/cargo-http";

export const dynamic = "force-dynamic";

/** The cargo-tracking sheet: every consignment with its newest update. Assigners and admins (lib/cargo.ts). */
export async function GET() {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  try {
    return NextResponse.json({ shipments: await listCargo() }, { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "list");
  }
}

/** A new consignment and its first update. */
export async function POST(request: Request) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const body = await bodyOf(request);
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400, headers: PRIVATE });
  try {
    return NextResponse.json({ shipment: await createCargo(body, auth.actor) }, { status: 201, headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "create");
  }
}

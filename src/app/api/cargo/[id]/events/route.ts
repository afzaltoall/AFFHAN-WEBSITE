import { NextResponse } from "next/server";
import { addCargoEvent, readCargoActor } from "@/lib/cargo";
import { PRIVATE, bodyOf, cargoFailure, isCargoId } from "@/lib/cargo-http";

export const dynamic = "force-dynamic";

/** A new update on a consignment's timeline: the date, what happened, the stage. The customer sees it at once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id } = await params;
  if (!isCargoId(id)) return NextResponse.json({ error: "That consignment is no longer on the sheet." }, { status: 404, headers: PRIVATE });
  const body = await bodyOf(request);
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400, headers: PRIVATE });
  try {
    return NextResponse.json({ shipment: await addCargoEvent(id, body, auth.actor) }, { status: 201, headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "add update");
  }
}

import { NextResponse } from "next/server";
import { deleteCargoEvent, editCargoEvent, readCargoActor } from "@/lib/cargo";
import { PRIVATE, bodyOf, cargoFailure, isCargoId } from "@/lib/cargo-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; eventId: string }> };
const gone = () => NextResponse.json({ error: "That update is no longer on the timeline." }, { status: 404, headers: PRIVATE });

/** A correction to an update: its date, its words or its stage. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id, eventId } = await params;
  if (!isCargoId(id) || !isCargoId(eventId)) return gone();
  const body = await bodyOf(request);
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400, headers: PRIVATE });
  try {
    return NextResponse.json({ shipment: await editCargoEvent(id, eventId, body, auth.actor) }, { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "correct update");
  }
}

/** An update taken off the timeline (never the last one). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id, eventId } = await params;
  if (!isCargoId(id) || !isCargoId(eventId)) return gone();
  try {
    return NextResponse.json({ shipment: await deleteCargoEvent(id, eventId, auth.actor) }, { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "remove update");
  }
}

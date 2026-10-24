import { NextResponse } from "next/server";
import { deleteCargo, getCargo, readCargoActor, updateCargo } from "@/lib/cargo";
import { PRIVATE, bodyOf, cargoFailure, isCargoId } from "@/lib/cargo-http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const gone = () => NextResponse.json({ error: "That consignment is no longer on the sheet." }, { status: 404, headers: PRIVATE });

/** One consignment: the sheet's fields, its timeline, and what has been changed on it. */
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id } = await params;
  if (!isCargoId(id)) return gone();
  try {
    const shipment = await getCargo(id);
    return shipment ? NextResponse.json({ shipment }, { headers: PRIVATE }) : gone();
  } catch (error) {
    return cargoFailure(error, "read");
  }
}

/** The sheet's fields: number, customer, type, ports, ETD, ETA. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id } = await params;
  if (!isCargoId(id)) return gone();
  const body = await bodyOf(request);
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400, headers: PRIVATE });
  try {
    return NextResponse.json({ shipment: await updateCargo(id, body, auth.actor) }, { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "update");
  }
}

/** Off the sheet for good. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await readCargoActor();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: PRIVATE });
  const { id } = await params;
  if (!isCargoId(id)) return gone();
  try {
    await deleteCargo(id, auth.actor);
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (error) {
    return cargoFailure(error, "delete");
  }
}

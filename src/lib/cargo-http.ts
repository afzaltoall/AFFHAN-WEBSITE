import "server-only";
import { NextResponse } from "next/server";
import { CargoError } from "@/lib/cargo";

/** Every cargo answer is the asker's own and changes by the minute: never cached anywhere. */
export const PRIVATE = { "Cache-Control": "private, no-store" };

/** An id as the sheet issues them (uuid), or nothing worth a query. */
export const isCargoId = (id: string) => /^[0-9a-f-]{8,64}$/i.test(id);

/** A refusal in its own words and status; anything else is logged and answered as a plain failure. */
export function cargoFailure(error: unknown, what: string): NextResponse {
  if (error instanceof CargoError) return NextResponse.json({ error: error.message }, { status: error.status, headers: PRIVATE });
  console.error(`cargo ${what}:`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500, headers: PRIVATE });
}

/** The body as an object, or null for anything that is not one. */
export async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

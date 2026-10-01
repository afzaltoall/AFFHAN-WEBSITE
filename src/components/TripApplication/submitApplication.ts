import type { FieldErrors, TripApplicationPayload } from "@/lib/trip-application";

/**
 * The one door an application goes out through. The screens call this and
 * nothing else, so the transport can change (a CRM, a queue, another API)
 * without touching the UI.
 *
 * Real by default: POST /api/trip-applications/, which validates everything
 * again, stores it, and returns the reference number the database wrote.
 *
 * The mock below runs only when NEXT_PUBLIC_TRIP_APPLICATION_MOCK is "on", for
 * building and demonstrating the screens without writing to the database. It
 * never invents a reference number, so a demonstration can't be mistaken for
 * a recorded application.
 */

export type SubmitResult =
  | { ok: true; referenceNo: string | null }
  /** The server refused some answers: back to that step, errors in place. */
  | { ok: false; reason: "invalid"; message: string; fields: FieldErrors }
  /** Too many applications from this connection. */
  | { ok: false; reason: "limited"; message: string }
  /** One application per person: there is already one from this email or mobile. */
  | { ok: false; reason: "duplicate"; message: string }
  /** Outside the application window, by the server's clock. */
  | { ok: false; reason: "closed"; message: string }
  /** The request never arrived, or the server couldn't record it. */
  | { ok: false; reason: "network" | "server"; message: string };

const ENDPOINT = "/api/trip-applications/";
const MOCK = process.env.NEXT_PUBLIC_TRIP_APPLICATION_MOCK === "on";

export async function submitApplication(payload: TripApplicationPayload): Promise<SubmitResult> {
  if (MOCK) return mockSubmit();

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, reason: "network", message: "" };
  }

  let data: { referenceNo?: unknown; error?: unknown; fields?: unknown; reason?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    /* an empty or non-JSON body: the status still says what happened */
  }

  if (res.ok) return { ok: true, referenceNo: typeof data.referenceNo === "string" ? data.referenceNo : null };
  const message = typeof data.error === "string" ? data.error : "";
  if (res.status === 400 && data.fields && typeof data.fields === "object") {
    return { ok: false, reason: "invalid", message, fields: data.fields as FieldErrors };
  }
  if (res.status === 429) return { ok: false, reason: "limited", message };
  if (res.status === 409 && data.reason === "duplicate") return { ok: false, reason: "duplicate", message };
  if (res.status === 403 && data.reason === "closed") return { ok: false, reason: "closed", message };
  return { ok: false, reason: "server", message };
}

/** Stands in for the API: a realistic wait, then success without a reference. */
async function mockSubmit(): Promise<SubmitResult> {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return { ok: true, referenceNo: null };
}

import "server-only";
import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { getCurrentUser } from "@/lib/session";
import { CHECK_NOTE_MAX, FOLLOWERS_MAX, POSTS_MAX, countOf } from "@/lib/instagram-task-shared";
import { InstagramTaskError, isInstagramTracker, isMissingInstagramTables, type CheckDecision, type InstagramActor } from "@/lib/server/instagram-task";

/**
 * Who is asking, for the Instagram task's routes, and their answers when something is refused.
 *
 * Two doors, never one: the staff routes (/api/instagram-task/) read only the staff cookie, and the console's
 * (/api/admin/instagram-task/) only the admin's. readWorkspaceAuth would read either, preferring the staff cookie, so
 * a console tab in a browser also signed in as an employee would check accounts as that employee.
 */

type Refusal = { ok: false; response: NextResponse };

/** The signed-in employee, and whether they track (HR). */
export async function readInstagramEmployee(): Promise<{ ok: true; actor: Extract<InstagramActor, { kind: "employee" }> } | Refusal> {
  const auth = await readEmployeeAuth();
  if (!auth.ok) return { ok: false, response: NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 }) };
  const tracker = await isInstagramTracker(auth.employee.id);
  return { ok: true, actor: { kind: "employee", id: auth.employee.id, name: auth.employee.name, tracker } };
}

/** The signed-in admin, as the task's trail names them. */
export async function readInstagramAdmin(): Promise<{ ok: true; actor: Extract<InstagramActor, { kind: "admin" }> } | Refusal> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { ok: false, response: new NextResponse("Unauthorized", { status: 401 }) };
  return { ok: true, actor: { kind: "admin", name: admin.name || admin.email || "Administrator" } };
}

/** A refusal in words, a database the migration has not reached, or the error itself (a 500). */
export function instagramErrorResponse(e: unknown): NextResponse {
  if (e instanceof InstagramTaskError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (isMissingInstagramTables(e)) return NextResponse.json({ error: "The Instagram task isn't set up on this database yet." }, { status: 503 });
  throw e;
}

/** What a check says, from its body: what was seen on Instagram, or why it does not count. A string is the refusal. */
export function readCheckDecision(body: Record<string, unknown>): CheckDecision | string {
  if (body.state === "checked") {
    const posts = countOf(body.posts, POSTS_MAX);
    const followers = countOf(body.followers, FOLLOWERS_MAX);
    if (posts === null || followers === null) return "Type the posts and followers the account shows on Instagram, as whole numbers.";
    return { state: "checked", posts, followers };
  }
  if (body.state === "rejected") {
    const note = typeof body.note === "string" ? body.note.trim().replace(/\s+/g, " ") : "";
    if (!note) return "Say why it doesn't count.";
    if (note.length > CHECK_NOTE_MAX) return `Keep the reason under ${CHECK_NOTE_MAX} characters.`;
    return { state: "rejected", note };
  }
  return "Say what you saw: the counts, or that it doesn't count.";
}

export const noStore = { "Cache-Control": "no-store" } as const;

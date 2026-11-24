import { NextResponse } from "next/server";
import { FOLLOWERS_MAX, POSTS_MAX, countOf, handleFromInputs, passwordProblem } from "@/lib/instagram-task-shared";
import { addInstagramAccount } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/**
 * The Instagram task (2026-11-23): an employee adds one of their accounts. Its username, its profile's link, or both
 * (2026-11-24, the owner: "give usernam and account password entry and url option"), which must then name the same
 * account; its password, which is sealed at once and never sent back to anyone but an admin through the vault; and the
 * posts and followers it shows now. Their own only, while the task runs, up to the task's number of accounts
 * (lib/server/instagram-task.ts). Staff sessions only.
 */
export async function POST(req: Request) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // "handle" is what a page from before the link field sends.
  const named = handleFromInputs(body.username ?? body.handle, body.link);
  if ("error" in named) return NextResponse.json({ error: named.error }, { status: 400 });
  const posts = countOf(body.posts ?? 0, POSTS_MAX);
  const followers = countOf(body.followers ?? 0, FOLLOWERS_MAX);
  if (posts === null || followers === null) return NextResponse.json({ error: "Posts and followers are whole numbers." }, { status: 400 });
  const problem = passwordProblem(body.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    return NextResponse.json(await addInstagramAccount(who.actor, { handle: named.handle, posts, followers, password: body.password as string }), { status: 201 });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}

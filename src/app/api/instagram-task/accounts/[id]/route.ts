import { NextResponse } from "next/server";
import { FOLLOWERS_MAX, POSTS_MAX, countOf, parseInstagramHandle } from "@/lib/instagram-task-shared";
import { removeInstagramAccount, renameInstagramAccount, reportInstagramAccount } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One of an employee's own accounts: { posts, followers } is what it shows now; { handle } is its new username (its
 * check goes, to be made again under the new name). Staff sessions only, their own accounts only.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if ("handle" in body) {
      const handle = typeof body.handle === "string" ? parseInstagramHandle(body.handle) : null;
      if (!handle) return NextResponse.json({ error: "Type the account's username (letters, numbers, . and _) or paste its profile link." }, { status: 400 });
      return NextResponse.json(await renameInstagramAccount(who.actor, id, handle));
    }
    const posts = countOf(body.posts, POSTS_MAX);
    const followers = countOf(body.followers, FOLLOWERS_MAX);
    if (posts === null || followers === null) return NextResponse.json({ error: "Posts and followers are whole numbers." }, { status: 400 });
    return NextResponse.json(await reportInstagramAccount(who.actor, id, { posts, followers }));
  } catch (e) {
    return instagramErrorResponse(e);
  }
}

/** Takes one of their own accounts out of the task (its history stays). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  const { id } = await params;
  try {
    await removeInstagramAccount(who.actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { FOLLOWERS_MAX, POSTS_MAX, countOf, parseInstagramHandle } from "@/lib/instagram-task-shared";
import { addInstagramAccount } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramEmployee } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/**
 * The Instagram task (2026-11-23): an employee adds one of their accounts, by its username or its profile's link, with
 * the posts and followers it shows now. Their own only, while the task runs, up to the task's number of accounts
 * (lib/server/instagram-task.ts). Staff sessions only.
 */
export async function POST(req: Request) {
  const who = await readInstagramEmployee();
  if (!who.ok) return who.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const handle = typeof body.handle === "string" ? parseInstagramHandle(body.handle) : null;
  if (!handle) return NextResponse.json({ error: "Type the account's username (letters, numbers, . and _) or paste its profile link." }, { status: 400 });
  const posts = countOf(body.posts ?? 0, POSTS_MAX);
  const followers = countOf(body.followers ?? 0, FOLLOWERS_MAX);
  if (posts === null || followers === null) return NextResponse.json({ error: "Posts and followers are whole numbers." }, { status: 400 });
  try {
    return NextResponse.json(await addInstagramAccount(who.actor, { handle, posts, followers }), { status: 201 });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}

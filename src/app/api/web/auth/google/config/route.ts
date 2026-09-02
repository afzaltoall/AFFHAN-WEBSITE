import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The Google Web client id, read at request time.
 *
 * This exists because the browser's copy is a NEXT_PUBLIC_ variable, and those
 * are compiled into the bundle at build time rather than read when the page
 * runs. A production build that happened before the variable was set therefore
 * ships an empty string permanently — the sign-in button renders "not
 * configured yet" and no amount of setting the variable afterwards changes it
 * until somebody rebuilds. That is exactly what happened on affhan.com: the
 * server had GOOGLE_WEB_CLIENT_ID and verified tokens fine, while the page had
 * nothing to render a button with.
 *
 * Reading it here instead means setting the variable takes effect on the next
 * request. Nothing is exposed by doing so: an OAuth *client id* is public by
 * design — Google's own script puts it in the page of every site that uses it.
 * The client *secret* is a different value, and this codebase does not use one.
 */
export async function GET() {
  const clientId =
    process.env.GOOGLE_WEB_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

  return NextResponse.json(
    { clientId },
    {
      // Short cache: long enough that a page load does not wait on this twice,
      // short enough that fixing the variable does not need a purge.
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    }
  );
}

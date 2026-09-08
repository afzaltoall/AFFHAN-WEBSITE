import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";

// Drops the catalogue caches on demand.
//
// revalidateTag() only exists inside Next's server runtime, and the things that
// change the catalogue — the EPROLO merge, the thumbnail backfill, the
// moderation tooling — are standalone Node scripts that never enter it. This
// route is the bridge: a script finishes its transaction and POSTs here, and
// the caches are gone within the same operation rather than an hour later.
//
// Authenticated with CRON_SECRET, the same bearer the sync cron uses, because
// this is the same kind of caller: a machine, not a browser. Without that,
// anyone could clear the caches of a million-product catalogue at will.

const TAGS: Record<string, string> = {
  categories: TAG_CATEGORIES,
  products: TAG_PRODUCTS,
};

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed. An unset secret must not mean "open to everyone".
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?tags=categories,products — default is both, which is what a category
  // merge or a moderation change needs.
  const requested = (request.nextUrl.searchParams.get("tags") ?? "categories,products")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const unknown = requested.filter((t) => !(t in TAGS));
  if (unknown.length) {
    return NextResponse.json(
      { error: `unknown tag(s): ${unknown.join(", ")}`, valid: Object.keys(TAGS) },
      { status: 400 }
    );
  }

  // Next 16 takes a cache-life profile as the second argument, and it decides
  // how OLD an entry has to be before this call expires it — it is not a purge
  // switch. Passing the named "max" profile therefore does nothing to an entry
  // written seconds ago, which is exactly the case here: a script writes to the
  // database and immediately asks for the cache to go. { expire: 0 } is what
  // actually drops it regardless of age.
  for (const t of requested) revalidateTag(TAGS[t], { expire: 0 });

  return NextResponse.json({
    revalidated: requested.map((t) => TAGS[t]),
    at: new Date().toISOString(),
  });
}

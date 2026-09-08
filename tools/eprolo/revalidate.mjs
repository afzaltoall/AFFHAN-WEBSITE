import 'dotenv/config';

// Drops the catalogue caches after a write, from a plain Node script.
//
// Scripts here run outside Next, so they cannot call revalidateTag() directly;
// they POST to /api/revalidate, which can. Call this at the end of any
// operation that changes what the catalogue shows — a category merge, a
// thumbnail backfill, a moderation change, a product moving categories — in the
// same run as the write, not as a step someone has to remember afterwards.
//
// Deliberately does NOT throw. The write has already committed by the time this
// runs; failing the script here would report a successful change as a failure.
// A miss degrades to the old behaviour — the caches expire on their own hour —
// so it is loud on stdout and soft in effect.

const DEFAULT_BASE = process.env.REVALIDATE_URL
  ?? process.env.NEXT_PUBLIC_BASE_URL
  ?? 'http://localhost:3000';

export async function revalidateCatalogue(tags = 'categories,products', { base = DEFAULT_BASE } = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log('  [revalidate] CRON_SECRET not set — skipped; caches will expire on their own (up to 1h)');
    return { ok: false, reason: 'no-secret' };
  }

  const url = `${base.replace(/\/$/, '')}/api/revalidate?tags=${encodeURIComponent(tags)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.text();
    if (!res.ok) {
      console.log(`  [revalidate] HTTP ${res.status} from ${base} — ${body.slice(0, 120)}`);
      return { ok: false, reason: `http-${res.status}` };
    }
    console.log(`  [revalidate] ${body.slice(0, 160)}`);
    return { ok: true };
  } catch (e) {
    console.log(`  [revalidate] could not reach ${base}: ${e.message}`);
    console.log('  [revalidate] caches will expire on their own (up to 1h)');
    return { ok: false, reason: 'unreachable' };
  }
}

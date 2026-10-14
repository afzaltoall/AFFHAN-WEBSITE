import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { suppressionsFromBrevo, tokenMatches } from "@/lib/brevo-events";

export const dynamic = "force-dynamic";

/**
 * Brevo's transactional webhook: hard bounces, invalid addresses, blocked
 * sends and spam complaints go into EmailSuppression, and lib/email.ts sends
 * nothing to those addresses again (lib/brevo-events.ts says which events and
 * what is saved).
 *
 * Set it up in Brevo (Transactional > Settings > Webhook) for the events
 * "Hard bounce", "Invalid email", "Blocked" and "Marked as spam", with the URL
 *
 *   https://affhan.com/api/brevo/webhook/?token=<BREVO_WEBHOOK_SECRET>
 *
 * with the trailing slash: the site redirects the other spelling, and a POST
 * redirected is a POST lost. The token can come as `Authorization: Bearer
 * <secret>` instead, where a sender can set headers. Without
 * BREVO_WEBHOOK_SECRET every call is refused.
 *
 * Addresses are never written to the log.
 */

/** A batch of events is a few hundred bytes each; this is far above any batch Brevo sends. */
const MAX_BYTES = 1024 * 1024;

const refused = () => NextResponse.json({ error: "Not accepted." }, { status: 403 });

export async function POST(request: Request) {
  const secret = process.env.BREVO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[brevo] BREVO_WEBHOOK_SECRET is not set: webhook calls are refused until it is.");
    return refused();
  }
  const auth = request.headers.get("authorization");
  const given = new URL(request.url).searchParams.get("token") ?? (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null);
  if (!tokenMatches(given, secret)) {
    console.warn("[brevo] webhook call refused: missing or wrong token.");
    return refused();
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }

  const { events, suppress } = suppressionsFromBrevo(payload);
  try {
    // One row per address, kept current by the latest event; Brevo delivering
    // the same event twice changes nothing.
    for (const s of suppress) {
      await prisma.emailSuppression.upsert({
        where: { email: s.email },
        create: { email: s.email, reason: s.reason, detail: s.detail, feedbackId: s.feedbackId, snsMessageId: null },
        update: { reason: s.reason, detail: s.detail, feedbackId: s.feedbackId, snsMessageId: null },
      });
    }
  } catch (error) {
    // 5xx, so Brevo tries again.
    console.error("[brevo] could not save to the suppression list:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Try again." }, { status: 500 });
  }
  const counted = Object.entries(events.reduce<Record<string, number>>((n, e) => ({ ...n, [e]: (n[e] ?? 0) + 1 }), {}))
    .map(([e, n]) => `${e} x${n}`)
    .join(", ");
  console.info(`[brevo] ${counted || "no events"}: ${suppress.length} address(es) added to the suppression list.`);
  return NextResponse.json({ ok: true, saved: suppress.length });
}

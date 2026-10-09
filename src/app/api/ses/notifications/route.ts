import { NextResponse } from "next/server";
import { handleSnsPost, saveSuppressions } from "@/lib/ses-notifications";

export const dynamic = "force-dynamic";

/**
 * Amazon SES bounce and complaint notifications, delivered by SNS
 * (lib/ses-notifications.ts says what is checked and what is saved).
 *
 * Subscribe the topic to https://affhan.com/api/ses/notifications/ with the
 * trailing slash: the site redirects the other spelling, and SNS does not
 * follow redirects. Raw message delivery must stay off; the SNS envelope is
 * what carries the signature.
 */

/** SNS caps a message at 256 KB; the envelope around it adds a little. */
const MAX_BYTES = 512 * 1024;

/** A GET to an address lib/sns-message.ts has already checked is on SNS. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "error" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return NextResponse.json({ error: "Too large." }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });

  const out = await handleSnsPost(raw, {
    topicArn: process.env.AWS_SES_SNS_TOPIC_ARN?.trim() || undefined,
    fetchText,
    save: saveSuppressions,
  });
  return NextResponse.json(out.body, { status: out.status });
}

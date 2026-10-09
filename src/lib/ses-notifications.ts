import { prisma } from "@/lib/prisma";
import {
  isSigningCertUrl,
  isSnsCertificate,
  isSubscribeUrl,
  parseSnsMessage,
  verifySnsSignature,
} from "@/lib/sns-message";
import { suppressionsFrom, type Suppression } from "@/lib/ses-events";

/**
 * SES bounce and complaint notifications, as SNS delivers them to
 * /api/ses/notifications.
 *
 * The configuration set "affhan-transactional" publishes Bounce and Complaint
 * events to an SNS topic, and the topic posts each one here. A message is acted
 * on only when it comes from that topic (AWS_SES_SNS_TOPIC_ARN) and SNS's
 * signature over it verifies against SNS's own certificate. Then:
 *
 * - a subscription confirmation is confirmed by fetching its SubscribeURL,
 *   which must be on SNS;
 * - a notification's permanently bounced and complaining addresses go into
 *   EmailSuppression, and lib/email.ts sends nothing to them again.
 *
 * Addresses are never written to the log.
 */

export interface SnsDeps {
  /** The one topic accepted (AWS_SES_SNS_TOPIC_ARN). Unset: everything is refused. */
  topicArn: string | undefined;
  /** GET a URL, returning its body; throws on anything but a 2xx answer. */
  fetchText: (url: string) => Promise<string>;
  /** Saves suppressions, returning how many addresses were saved. */
  save: (suppress: Suppression[], snsMessageId: string) => Promise<number>;
}

export interface SnsOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** SNS signing certificates, by URL, kept once they have checked out. They change every few years. */
const certificates = new Map<string, string>();

const refuse = (why: string): SnsOutcome => {
  console.warn(`[ses] SNS message refused: ${why}.`);
  return { status: 403, body: { error: "Not accepted." } };
};

export async function handleSnsPost(raw: string, deps: SnsDeps): Promise<SnsOutcome> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "Not JSON." } };
  }
  const m = parseSnsMessage(parsed);
  if (!m) return { status: 400, body: { error: "Not an SNS message." } };

  if (!deps.topicArn) {
    console.error("[ses] AWS_SES_SNS_TOPIC_ARN is not set: SNS messages are refused until it is.");
    return { status: 403, body: { error: "Not accepted." } };
  }
  if (m.TopicArn !== deps.topicArn) return refuse("not from the configured topic");
  if (!isSigningCertUrl(m.SigningCertURL)) return refuse("signing certificate not hosted on SNS");

  let pem = certificates.get(m.SigningCertURL);
  if (!pem) {
    try {
      pem = await deps.fetchText(m.SigningCertURL);
    } catch {
      // 5xx, so SNS tries again later.
      console.error("[ses] could not fetch the SNS signing certificate.");
      return { status: 502, body: { error: "Try again." } };
    }
    if (!isSnsCertificate(pem)) return refuse("certificate is not SNS's or is out of date");
    certificates.set(m.SigningCertURL, pem);
  }
  if (!verifySnsSignature(m, pem)) return refuse("signature did not verify");

  if (m.Type === "SubscriptionConfirmation") {
    if (!m.SubscribeURL || !isSubscribeUrl(m.SubscribeURL)) return refuse("confirmation link not on SNS");
    try {
      await deps.fetchText(m.SubscribeURL);
    } catch {
      console.error("[ses] could not confirm the SNS subscription.");
      return { status: 502, body: { error: "Try again." } };
    }
    console.info(`[ses] SNS subscription to ${m.TopicArn} confirmed.`);
    return { status: 200, body: { confirmed: true } };
  }

  if (m.Type === "UnsubscribeConfirmation") {
    console.warn(`[ses] this endpoint was unsubscribed from ${m.TopicArn}.`);
    return { status: 200, body: { ok: true } };
  }

  let event: unknown;
  try {
    event = JSON.parse(m.Message);
  } catch {
    console.warn("[ses] notification whose message is not JSON; ignored.");
    return { status: 200, body: { ok: true, saved: 0 } };
  }
  const { kind, suppress } = suppressionsFrom(event);
  const saved = suppress.length ? await deps.save(suppress, m.MessageId) : 0;
  console.info(`[ses] ${kind}: ${saved} address(es) added to the suppression list.`);
  return { status: 200, body: { ok: true, kind, saved } };
}

/**
 * One row per address, kept current by the latest event. Upserts, so SNS
 * delivering the same notification twice changes nothing.
 */
export async function saveSuppressions(suppress: Suppression[], snsMessageId: string): Promise<number> {
  for (const s of suppress) {
    await prisma.emailSuppression.upsert({
      where: { email: s.email },
      create: { email: s.email, reason: s.reason, detail: s.detail, feedbackId: s.feedbackId, snsMessageId },
      update: { reason: s.reason, detail: s.detail, feedbackId: s.feedbackId, snsMessageId },
    });
  }
  return suppress.length;
}

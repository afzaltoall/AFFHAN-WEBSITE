import crypto from "node:crypto";

/**
 * Amazon SNS messages, checked the way AWS documents ("Verifying the
 * signatures of Amazon SNS messages"), for the SES bounce and complaint
 * notifications that /api/ses/notifications receives.
 *
 * Anyone can POST to that URL, and what it does with a notification is stop
 * emailing an address, so a message is believed only when SNS's signature
 * over it checks out against a certificate fetched from SNS itself. Pure apart
 * from node:crypto: the route does the fetching and the database work.
 *
 * Kept free of path aliases, so tests can load it as it is.
 */

export type SnsType = "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";

export interface SnsMessage {
  Type: SnsType;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

/** The message, if `body` has the shape of one SNS sends; null otherwise. */
export function parseSnsMessage(body: unknown): SnsMessage | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const m = body as Record<string, unknown>;
  const str = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : undefined);
  const type = str("Type");
  if (type !== "Notification" && type !== "SubscriptionConfirmation" && type !== "UnsubscribeConfirmation") return null;
  for (const k of ["MessageId", "TopicArn", "Message", "Timestamp", "SignatureVersion", "Signature", "SigningCertURL"]) {
    if (!str(k)) return null;
  }
  if (type !== "Notification" && (!str("SubscribeURL") || !str("Token"))) return null;
  return {
    Type: type,
    MessageId: str("MessageId")!,
    TopicArn: str("TopicArn")!,
    Message: str("Message")!,
    Timestamp: str("Timestamp")!,
    SignatureVersion: str("SignatureVersion")!,
    Signature: str("Signature")!,
    SigningCertURL: str("SigningCertURL")!,
    ...(str("Subject") !== undefined ? { Subject: str("Subject") } : {}),
    ...(str("SubscribeURL") ? { SubscribeURL: str("SubscribeURL") } : {}),
    ...(str("Token") ? { Token: str("Token") } : {}),
  };
}

/**
 * The exact text SNS signed: each field's name and value, one per line, in the
 * order AWS documents. A notification's Subject is included only when the
 * message has one.
 */
export function stringToSign(m: SnsMessage): string {
  const keys: Array<keyof SnsMessage> =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? (["Subject"] as const) : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((k) => `${k}\n${m[k] ?? ""}\n`).join("");
}

/** sns.<region>.amazonaws.com, e.g. sns.ap-south-1.amazonaws.com, and nothing that merely contains it. */
const SNS_HOST = /^sns\.[a-z]{2}(-[a-z]+)+-\d\.amazonaws\.com$/;

function snsUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && SNS_HOST.test(u.hostname) && !u.username && !u.password && !u.port ? u : null;
  } catch {
    return null;
  }
}

/** A signing certificate's address: https, on an SNS host, a SimpleNotificationService-*.pem path. */
export function isSigningCertUrl(raw: string): boolean {
  const u = snsUrl(raw);
  return !!u && /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(u.pathname) && !u.search;
}

/** A subscription's confirmation address: https, on an SNS host, Action=ConfirmSubscription. */
export function isSubscribeUrl(raw: string): boolean {
  const u = snsUrl(raw);
  return !!u && u.pathname === "/" && u.searchParams.get("Action") === "ConfirmSubscription" && !!u.searchParams.get("Token");
}

/** Whether the PEM is an SNS certificate in its validity period. */
export function isSnsCertificate(pem: string, now: Date = new Date()): boolean {
  try {
    const cert = new crypto.X509Certificate(pem);
    return /sns\.[a-z0-9.-]*amazonaws\.com/i.test(cert.subject) && now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);
  } catch {
    return false;
  }
}

/** Whether the message carries a valid SNS signature (SignatureVersion 1: SHA1withRSA; 2: SHA256withRSA) made with the key in `pem`. */
export function verifySnsSignature(m: SnsMessage, pem: string): boolean {
  const hash = m.SignatureVersion === "1" ? "sha1" : m.SignatureVersion === "2" ? "sha256" : null;
  if (!hash) return false;
  try {
    return crypto.verify(hash, Buffer.from(stringToSign(m), "utf8"), pem, Buffer.from(m.Signature, "base64"));
  } catch {
    return false;
  }
}

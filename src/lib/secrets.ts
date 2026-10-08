import crypto from "crypto";

/**
 * The two secrets the server signs and checks with, read in one place (the
 * security audit of 2026-10-08, H1).
 *
 * Both used to be read where they were used. AUTH_SECRET came with a fallback,
 * a fixed development key written into the code, and the repository is
 * public: any deployment that ever ran without the variable signed admin
 * sessions, password-reset links and sign-up tokens with a key anyone could
 * read, and accepted any token signed with it. CRON_SECRET was compared as
 * `Bearer ${process.env.CRON_SECRET}`, which without the variable is the
 * literal string "Bearer undefined".
 *
 * Neither has a default now. Each is checked when it is used rather than when a
 * module loads, so a build, or a page that never signs anything, does not need
 * it; and a server that does need it fails at once, with an error that names
 * the variable, instead of carrying on with a key it should not have.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

export const MIN_SECRET_LENGTH = 32;

type SecretName = "AUTH_SECRET" | "CRON_SECRET";

export class SecretMissingError extends Error {
  readonly variable: SecretName;
  constructor(variable: SecretName, reason: string) {
    super(
      `${variable} ${reason}. Set it in the environment (on Vercel: Settings → Environment Variables, ` +
        `for Production and Preview) to a random value of at least ${MIN_SECRET_LENGTH} characters, ` +
        "for example the output of `openssl rand -base64 48`.",
    );
    this.name = "SecretMissingError";
    this.variable = variable;
  }
}

function read(variable: SecretName): string {
  const value = process.env[variable];
  if (!value) throw new SecretMissingError(variable, "is not set");
  if (value.length < MIN_SECRET_LENGTH) throw new SecretMissingError(variable, `is shorter than ${MIN_SECRET_LENGTH} characters`);
  return value;
}

/** The key sessions, reset links and sign-up tokens are signed with. Throws SecretMissingError when missing or short. */
export function authSecret(): string {
  return read("AUTH_SECRET");
}

const reported = new Set<SecretName>();
/**
 * The same key for a check rather than a signature: null when it is missing or
 * short, which every reader treats as "no valid token". A token cannot be
 * trusted without the key, so nothing is accepted; and a public page that only
 * asks "is anyone signed in?" answers "no" instead of failing. Logged once per
 * server, so the reason is in the logs without filling them.
 */
export function authSecretOrNull(): string | null {
  try {
    return authSecret();
  } catch (e) {
    if (e instanceof SecretMissingError && !reported.has(e.variable)) {
      reported.add(e.variable);
      console.error(`[secrets] ${e.message}`);
    }
    if (e instanceof SecretMissingError) return null;
    throw e;
  }
}

/** The bearer token the cron jobs and the revalidate hook are called with. Throws SecretMissingError when missing or short. */
export function cronSecret(): string {
  return read("CRON_SECRET");
}

/**
 * Whether an Authorization header is exactly `Bearer <CRON_SECRET>`, compared
 * in constant time (both sides hashed first, so their lengths match and the
 * comparison leaks nothing about how much of a guess was right). Throws
 * SecretMissingError when the secret itself is missing, so a route can answer
 * 503 and say why, rather than 401 as if the caller were at fault.
 */
export function cronAuthorized(header: string | null): boolean {
  const expected = `Bearer ${cronSecret()}`;
  const digest = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest();
  return crypto.timingSafeEqual(digest(header ?? ""), digest(expected));
}

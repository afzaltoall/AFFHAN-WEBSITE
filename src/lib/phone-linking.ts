/**
 * Which account a proved phone number may enter (security audit 2026-10-08,
 * C1). Pure: no database here, so the rule can be tested on its
 * own; the routes do the reads and writes.
 *
 * The rule under it: an account is entered by proving one of the things it is
 * keyed by (its email, through Google or a password set by whoever proved it;
 * its phone, through a code), and never by typing a value that merely matches it.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

/**
 * What a phone number that has just been proved by a code may do.
 *
 * The number's own account is entered. A new number with no name or email yet
 * is asked for them. A new number whose email already belongs to an account
 * is refused: the code proves the phone, not the email, so it can neither
 * enter that account nor attach itself to it. The owner of that account signs
 * in to it (password or Google) and adds the number from Account, where the
 * number is proved again. Anything else is a new account.
 */
export type PhonePlan = { kind: "sign_in" } | { kind: "needs_profile" } | { kind: "email_taken" } | { kind: "create" };

export function phonePlan(input: { accountForPhone: boolean; hasProfile: boolean; emailTaken: boolean }): PhonePlan {
  if (input.accountForPhone) return { kind: "sign_in" };
  if (!input.hasProfile) return { kind: "needs_profile" };
  if (input.emailTaken) return { kind: "email_taken" };
  return { kind: "create" };
}

/** What the refused case says, in the customer's words. */
export const EMAIL_TAKEN_MESSAGE =
  "That email already has an AFFHAN account. Sign in to it with your password or Google, then add this number from your Account page.";

/**
 * Whether a number just proved by a code may open the account that already
 * holds it: only when that account proved the number too (2026-10-15).
 *
 * A number saved without a code, at password sign-up or as a contact number
 * (lib/contact-phone.ts), is how our team reaches the customer, not a way into
 * the account. The code proves who holds the phone, not whose account it is,
 * so a typo, or somebody else's number typed on purpose, would otherwise hand
 * the account to whoever holds that phone. Asked wherever a proved number
 * opens a session on an existing account: authenticateByPhone
 * (lib/phone-auth.ts) and /api/web/auth/complete-profile.
 */
export function provedPhoneMayEnter(holder: { phoneVerified: boolean }): boolean {
  return holder.phoneVerified;
}

/** What that refusal says. */
export const CONTACT_ONLY_MESSAGE =
  "That number is on an AFFHAN account for our team to reach its owner, not to sign in with. Sign in with your email and password, or with Google.";

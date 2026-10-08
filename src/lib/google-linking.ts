/**
 * Which account a sign-in with Google may enter (security audit 2026-10-08,
 * H2). Pure: no database here, so the rule can be tested on its
 * own; the routes do the reads and writes.
 *
 * The rule under it: an account is entered by proving one of the things it is
 * keyed by (its email, through Google or a password set by whoever proved it;
 * its phone, through a code), and never by typing a value that merely matches it.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

export interface LinkableAccount {
  emailVerified: boolean;
  googleId: string | null;
  authProvider: string;
}

/**
 * What a sign-in with Google does to the account that already holds its email.
 *
 * Google has just proved the person owns the address. If the account had
 * proved it too (emailVerified), this is its owner: Google is linked, or the
 * person simply signs in. If it had not — the address was typed at sign-up,
 * or changed to it later, and nobody showed they own it — then whoever set
 * the account up may not be this person, and anything they could sign in with
 * goes: the password, every open session, and the phone number on it. The
 * owner then has the account, and sets a password from Account if they want
 * one.
 *
 * That last part goes one step past "the password and the sessions": a phone
 * number left on the account would let whoever attached it back in with a
 * text-message code, once those are switched on.
 */
export type GooglePlan =
  | { kind: "sign_in" }
  | { kind: "link"; authProvider: string }
  | { kind: "claim"; authProvider: string };

export function googlePlan(account: LinkableAccount): GooglePlan {
  if (!account.emailVerified) return { kind: "claim", authProvider: "GOOGLE" };
  if (account.googleId) return { kind: "sign_in" };
  return { kind: "link", authProvider: account.authProvider.includes("GOOGLE") ? account.authProvider : `${account.authProvider}_AND_GOOGLE` };
}

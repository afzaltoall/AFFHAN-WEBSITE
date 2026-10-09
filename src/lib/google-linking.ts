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
 * the account up may not be this person, and their password and every open
 * session go. The owner then has the account, and sets a password from
 * Account if they want one.
 *
 * The phone number stays (the owner's decision, 2026-10-09): it is how the
 * sales team reaches the customer and what their customer number is made
 * from. The cost, accepted: if whoever set the account up attached their own
 * number, text-message sign-in, once it is switched on, would let them in.
 */
export type GooglePlan =
  | { kind: "sign_in" }
  | { kind: "link"; authProvider: string }
  | { kind: "claim"; authProvider: string };

export function googlePlan(account: LinkableAccount): GooglePlan {
  // A claim keeps the phone, so a phone sign-in the account had stays one.
  if (!account.emailVerified) return { kind: "claim", authProvider: account.authProvider.includes("PHONE") ? "GOOGLE_AND_PHONE" : "GOOGLE" };
  if (account.googleId) return { kind: "sign_in" };
  return { kind: "link", authProvider: account.authProvider.includes("GOOGLE") ? account.authProvider : `${account.authProvider}_AND_GOOGLE` };
}

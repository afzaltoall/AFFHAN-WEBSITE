// ---------------------------------------------------------------------------
// What counts as an acceptable password.
//
// Separate from lib/password.ts, which does the hashing and the throttling,
// because this half runs in the browser and that half cannot. The sign-up
// form, the reset page and the account page all check as you type, and
// importing the server module for one pure function pulled PrismaClient into
// the client bundle — the login page died with "PrismaClient is unable to run
// in this browser environment".
//
// So: no imports here, ever. That is the whole discipline of this file.
// ---------------------------------------------------------------------------

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/**
 * Whether a password is acceptable, and if not, what to say.
 *
 * Deliberately short. Long composition rules — an uppercase, a digit, a
 * symbol, no repeats — reliably produce "Passw0rd!" and little else; length
 * plus "not all one kind of character" gets more real entropy without teaching
 * people to game a checklist. The upper bound exists because bcrypt only reads
 * the first 72 bytes and because a megabyte of "a" is a denial of service, not
 * a password.
 */
export function checkPasswordStrength(
  password: unknown
): { ok: true } | { ok: false; error: string } {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Choose a password." };
  }
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, error: "That password is too long." };
  }

  const classes = [/[a-z]/, /[A-Z]/, /d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) {
    return { ok: false, error: "Mix letters with numbers or symbols." };
  }

  // Catches "aaaaaaaa" and "11111111", which pass every length test.
  if (new Set(password).size < 4) {
    return { ok: false, error: "That password repeats too few characters." };
  }

  return { ok: true };
}

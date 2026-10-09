import { Prisma, type MobileUser } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { googlePlan } from "@/lib/google-linking";

/** Google's identity (its `sub`) is already on another AFFHAN account. */
export class GoogleIdentityTaken extends Error {}

/**
 * The account a verified Google sign-in enters, for the website and the app
 * alike (security audit 2026-10-08, H2). lib/google-linking.ts decides which,
 * and why; this does the reads and writes.
 *
 * - No account holds the email: a new Google account.
 * - The account holds it and proved it: Google is linked, or it is simply
 *   signed in to, as before.
 * - The account holds it but never proved it: claimed. Before this, Google
 *   was merged into it as it stood, so whoever registered somebody else's
 *   address first kept their password, and with it the owner's account. Now
 *   the password and every open session go, in one transaction with the link;
 *   the email is marked proved; and the password's removal is written to the
 *   account's AccountChange trail. The phone number stays (lib/google-linking.ts
 *   says why). The owner can set a password from Account afterwards.
 *
 * A suspended account is returned untouched, for the route to refuse.
 */
export async function accountForGoogle(input: {
  email: string;
  googleId: string;
  name?: string | null;
  picture?: string | null;
  source: "WEB" | "APP";
}): Promise<MobileUser> {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.mobileUser.findUnique({ where: { email } });
  // One Google identity, one account: asked first rather than left to the
  // unique index, so the answer is a clear refusal and not a failed
  // transaction. The index stays behind it for two sign-ins at the same moment.
  const holder = await prisma.mobileUser.findUnique({ where: { googleId: input.googleId }, select: { id: true } });
  if (holder && holder.id !== existing?.id) {
    throw new GoogleIdentityTaken("That Google account is already linked to another AFFHAN account.");
  }
  try {
    if (!existing) {
      return await prisma.mobileUser.create({
        data: {
          name: input.name || "Google User",
          email,
          authProvider: "GOOGLE",
          googleId: input.googleId,
          profileImage: input.picture ?? null,
          emailVerified: true,
        },
      });
    }
    if (existing.accountStatus !== "ACTIVE") return existing;

    const plan = googlePlan(existing);
    if (plan.kind === "sign_in") return existing;
    if (plan.kind === "link") {
      return await prisma.mobileUser.update({
        where: { id: existing.id },
        data: {
          googleId: input.googleId,
          authProvider: plan.authProvider,
          profileImage: existing.profileImage || input.picture || null,
          emailVerified: true,
        },
      });
    }

    const trail: Prisma.AccountChangeCreateManyInput[] = [
      ...(existing.passwordHash ? [{ userId: existing.id, field: "password", fromValue: null, toValue: null, source: input.source }] : []),
    ];
    const [claimed] = await prisma.$transaction([
      prisma.mobileUser.update({
        where: { id: existing.id },
        data: {
          googleId: input.googleId,
          authProvider: plan.authProvider,
          emailVerified: true,
          passwordHash: null,
          profileImage: existing.profileImage || input.picture || null,
        },
      }),
      prisma.mobileSession.deleteMany({ where: { userId: existing.id } }),
      prisma.accountChange.createMany({ data: trail }),
    ]);
    console.info(`[google] account ${existing.id} claimed by its verified email; ${trail.length} credential(s) removed, sessions revoked`);
    return claimed;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new GoogleIdentityTaken("That Google account is already linked to another AFFHAN account.");
    }
    throw e;
  }
}

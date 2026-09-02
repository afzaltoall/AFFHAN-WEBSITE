import { prisma } from "@/lib/prisma";

export type ChangeField = "name" | "email" | "phone" | "password" | "status";
export type ChangeSource = "WEB" | "APP" | "ADMIN";

interface Change {
  field: ChangeField;
  from?: string | null;
  to?: string | null;
}

/**
 * Record what a customer changed about their own account.
 *
 * Called from the routes that actually change something, rather than inferred
 * from a diff somewhere central — only the route knows which client the change
 * came from, and "where from" is half of what makes the trail worth reading.
 *
 * Never throws into the caller. An audit row is worth having, but not worth
 * failing a save the customer already completed: losing the record of a change
 * is bad, undoing the change itself is worse.
 *
 * A password change passes no values. The row says it happened; that is the
 * whole question it exists to answer, and the answer needs no secret.
 */
export async function recordAccountChanges(
  userId: string,
  source: ChangeSource,
  changes: Change[]
): Promise<void> {
  // Nothing actually moved — a save where every field came back the same is
  // not a change, and logging it would bury the real ones.
  const real = changes.filter(
    (c) => c.field === "password" || normalise(c.from) !== normalise(c.to)
  );
  if (real.length === 0) return;

  try {
    await prisma.accountChange.createMany({
      data: real.map((c) => ({
        userId,
        source,
        field: c.field,
        fromValue: c.field === "password" ? null : (c.from ?? null),
        toValue: c.field === "password" ? null : (c.to ?? null),
      })),
    });
  } catch (error) {
    console.error("Account audit write failed:", error);
  }
}

/** Empty string and null are the same absence; trailing spaces are not a change. */
function normalise(value: string | null | undefined): string {
  return (value ?? "").trim();
}

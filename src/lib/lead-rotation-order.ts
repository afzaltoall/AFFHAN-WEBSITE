// ---------------------------------------------------------------------------
// Whose turn it is.
//
// The decision the rotation queue makes, with none of the doing: given who is
// active, who has already been asked and how many times the team has been
// round, say what should happen to this customer next. No imports, no
// database, no clock — so it can be read in one sitting and tested against a
// team of any shape, including the ones that are awkward on purpose.
// ---------------------------------------------------------------------------

export interface RotationMember {
  id: string;
  name: string;
}

export type RotationDecision =
  | { action: "hand-over"; to: RotationMember; passes: number; passCompleted: boolean }
  | { action: "park"; reason: string; passes: number; passCompleted: boolean }
  | { action: "invalid"; passes: number; passCompleted: true };

export interface RotationInput {
  /** Active employees, oldest first, ties broken by id. */
  pool: RotationMember[];
  /** Who held this customer last — where the order carries on from. */
  lastEmployeeId: string | null;
  /** Who is letting go of it now: the decliner, or the silent holder. */
  leavingId: string | null;
  /** Who has already been offered this customer during the current pass. */
  seen: Set<string>;
  /** Completed passes so far. */
  passes: number;
  /** How many times the whole team may be asked before giving up. */
  maxPasses: number;
}

/**
 * The next member of the pool after `lastEmployeeId`, skipping anyone already
 * asked this pass and anyone excluded.
 *
 * The order carries on from whoever held it rather than starting at the top
 * every time, so the work spreads across the team instead of always landing on
 * the same two people. When the last holder is no longer in the pool — left,
 * deactivated — the order simply starts at the beginning, which is where a
 * customer new to the rotation starts anyway.
 */
export function nextInOrder(
  pool: RotationMember[],
  lastEmployeeId: string | null,
  seen: Set<string>,
  exclude: string | null
): RotationMember | null {
  const at = lastEmployeeId ? pool.findIndex((e) => e.id === lastEmployeeId) : -1;
  const order = at >= 0 ? [...pool.slice(at + 1), ...pool.slice(0, at + 1)] : pool;
  return order.find((e) => !seen.has(e.id) && e.id !== exclude) ?? null;
}

/**
 * What happens to this customer now.
 *
 * Three answers, in the order they are considered:
 *
 *   hand over  somebody in the pool has not been asked this pass. Give it to
 *              the next of them in order.
 *   park       there is nobody to give it to — an empty team, or a team of
 *              one, which means the only candidate is the person who just let
 *              it go. Handing it straight back to them is not a rotation, it
 *              is a loop, so the customer waits for an administrator instead.
 *   invalid    the whole team has now been asked `maxPasses` times over. The
 *              customer stops moving and becomes the office's problem rather
 *              than the queue's.
 *
 * A pass completes the moment nobody is left to ask, and that is also when the
 * cap is tested — so with two passes allowed the team is asked twice over, not
 * twice plus a few stragglers.
 *
 * One asymmetry worth naming: when a pass completes, the person who was
 * holding the customer is not first in the queue for the new pass. They have
 * just this moment let it lapse; handing it back to them a second later would
 * be the same loop the park case exists to avoid.
 */
export function decideRotation(input: RotationInput): RotationDecision {
  const { pool, lastEmployeeId, leavingId, seen, passes, maxPasses } = input;

  const candidate = nextInOrder(pool, lastEmployeeId, seen, leavingId);
  if (candidate) return { action: "hand-over", to: candidate, passes, passCompleted: false };

  // Nobody left this pass. Is there anybody at all?
  const eligible = pool.filter((e) => e.id !== leavingId);
  if (eligible.length === 0) {
    return {
      action: "park",
      reason: pool.length === 0 ? "no active employees" : "nobody else active to hand it to",
      passes,
      passCompleted: false,
    };
  }

  const completed = passes + 1;
  if (completed >= maxPasses) return { action: "invalid", passes: completed, passCompleted: true };

  // A fresh pass: everybody is eligible again except whoever is letting go.
  const next = nextInOrder(pool, lastEmployeeId, new Set(leavingId ? [leavingId] : []), leavingId);
  return next
    ? { action: "hand-over", to: next, passes: completed, passCompleted: true }
    : { action: "park", reason: "nobody else active to hand it to", passes: completed, passCompleted: true };
}

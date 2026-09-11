// Re-export of the live moderation rules in src/lib/moderation.ts.
//
// This used to be a hand-maintained COPY of that file, and it had drifted: it
// carried no BLOCKED_PRODUCT_IDS at all, so every tool built on it — including
// 23-moderation-gate.mjs, whose whole job is to prove nothing leaks — was
// checking the site against a rule set the site does not use.
//
// Nothing is duplicated here now. tools/audit/rules.mjs reads the TypeScript
// source directly, so there is one definition and it is the one that ships.
import { isCategoryBlocked } from '../audit/rules.mjs';

export {
  BLOCKED_CATEGORY_PATTERNS,
  BLOCKED_NAME_KEYWORDS,
  BLOCKED_PRODUCT_IDS,
  GENERIC_CATEGORY_NAMES,
  REVIEW_NAME_TERMS,
  isCategoryBlocked,
  isNameBlocked,
  isProductIdBlocked,
  isGenericBucket,
  needsReview,
} from '../audit/rules.mjs';

/// A category is blocked if its own name matches, or its parent's does.
///
/// Signature unchanged from the mirror this replaced — 05-create-categories.mjs
/// calls it as isBlockedDeep(name, parentName), working on EPROLO's raw feed
/// where there is no id tree to walk yet.
export function isBlockedDeep(name, parentName) {
  return isCategoryBlocked(name) || isCategoryBlocked(parentName);
}

import fs from 'fs';

// Moderation blocklist for the EPROLO pipeline, read from the real source:
// src/lib/moderation.ts.
//
// scripts/moderate_categories.mjs keeps its own literal copy of these patterns
// "so the script has no dependency on the TS build". That was fine for one
// script; a third copy is how blocklists drift, and a moderation list that
// silently disagrees with itself is worse than no list. So this parses the TS
// instead — no build step, still one source of truth — and throws loudly if the
// shape it expects is gone, because a moderation gate that quietly degrades to
// "allow everything" is the exact failure that put 165 adult products live.

const TS_PATH = new URL('../../src/lib/moderation.ts', import.meta.url);

function extractArray(src, name) {
  const start = src.indexOf(`${name} = [`);
  if (start === -1) throw new Error(`moderation.ts: ${name} not found — refusing to run without a blocklist`);
  const body = src.slice(start + `${name} = [`.length);
  const end = body.indexOf('];');
  if (end === -1) throw new Error(`moderation.ts: ${name} is not terminated — refusing to run`);
  // String literals only; the // comments between entries are skipped by this.
  const items = [...body.slice(0, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!items.length) throw new Error(`moderation.ts: ${name} parsed empty — refusing to run`);
  return items;
}

const src = fs.readFileSync(TS_PATH, 'utf8');
export const BLOCKED_CATEGORY_PATTERNS = extractArray(src, 'BLOCKED_CATEGORY_PATTERNS');
export const BLOCKED_NAME_KEYWORDS = extractArray(src, 'BLOCKED_NAME_KEYWORDS');

/// True if a category name contains any blocked pattern.
///
/// Substring matching, exactly as isCategoryBlocked() does it. This is why the
/// patterns are full phrases ("sex product") and never bare words: "sex" alone
/// would swallow "Unisex Dresses", "Unisex Jeans" and every other Unisex
/// category — 3,079 entirely legitimate products.
export function isCategoryBlocked(name) {
  if (!name) return false;
  const n = String(name).trim().toLowerCase();
  return BLOCKED_CATEGORY_PATTERNS.some((p) => n.includes(p));
}

/// True if a product name carries an adult keyword, for items mis-filed into
/// an otherwise clean category.
export function isNameBlocked(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return BLOCKED_NAME_KEYWORDS.some((k) => n.includes(k));
}

/// Blocked if the category's own name matches, or any ancestor's does.
/// Mirrors blockedCategoryIdSet(): products hang off leaves, so blocking a
/// parent has to take its whole subtree with it.
export function isBlockedDeep(name, parentName) {
  return isCategoryBlocked(name) || isCategoryBlocked(parentName);
}

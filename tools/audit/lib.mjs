// Shared helpers for the catalogue audit tooling.
import 'dotenv/config';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

/// Query with a retry on transient connection failures.
///
/// Neon's hostname intermittently fails to resolve from this machine
/// (getaddrinfo ENOTFOUND), which killed two long-running audit passes
/// mid-flight. These are read-mostly analytical queries, so retrying is safe;
/// writes go through explicit scripts that report what they did.
const TRANSIENT = new Set(['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED']);

export async function q(sql, params, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return (await pool.query(sql, params)).rows;
    } catch (err) {
      lastErr = err;
      if (!TRANSIENT.has(err.code)) throw err;
      const wait = 500 * 2 ** i;
      console.error(`  [retry ${i + 1}/${attempts - 1}] ${err.code}; waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export const close = () => pool.end();

/// Strip an EPROLO HTML description down to readable text.
export function descText(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/// The blocked-category set, descendant-aware, straight from the live tree.
export async function blockedCategoryIds(isCategoryBlocked) {
  const cats = await q(`SELECT id, name, "parentId" FROM "Category"`);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const memo = new Map();
  const deep = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    const c = byId.get(id);
    if (!c) return false;
    const b = isCategoryBlocked(c.name) || (c.parentId ? deep(c.parentId, seen) : false);
    memo.set(id, b);
    return b;
  };
  return { cats, blocked: new Set(cats.filter((c) => deep(c.id)).map((c) => c.id)) };
}

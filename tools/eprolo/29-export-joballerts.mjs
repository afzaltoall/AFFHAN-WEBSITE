import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// Exports the JobAlert subscribers before the feature is removed.
//
// Three real people asked to be told about job openings. The table is being
// dropped, so this is the only remaining record of them — it is written before
// anything is deleted, and verified by reading it back.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const rows = (await pool.query(
  `SELECT id, email, status, "createdAt" FROM "JobAlert" ORDER BY "createdAt" ASC`
)).rows;

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const cols = ['id', 'email', 'status', 'createdAt'];
const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');

fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const out = `tools/eprolo/moderation/job-alert-subscribers-${stamp}.csv`;
fs.writeFileSync(out, csv + '\n');

console.log(`exported ${rows.length} subscriber(s) -> ${out}`);
for (const r of rows) console.log(`  ${r.email}  (${r.status}, ${new Date(r.createdAt).toISOString().slice(0, 10)})`);

// Read back and verify, rather than trusting the write.
const back = fs.readFileSync(out, 'utf8').trim().split('\n');
const ok = back.length === rows.length + 1 && rows.every((r) => back.some((l) => l.includes(r.email)));
console.log(`\nverified on disk: ${back.length - 1} data rows, every email present: ${ok}`);
if (!ok) { console.error('EXPORT VERIFICATION FAILED — do not drop the table'); process.exit(1); }

await pool.end();

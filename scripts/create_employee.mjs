// Create or update a staff account.
//
//   node scripts/create_employee.mjs --email sara@affhan.com --name "Sara K" --password "..." [--region Dubai] [--rank ADMIN]
//   node scripts/create_employee.mjs --email sara@affhan.com --deactivate
//   node scripts/create_employee.mjs --list
//
// Until the admin screens for this exist (phase 3), this is how a staff account
// comes into being. Re-running it for an address that already exists updates
// that row rather than failing, so it doubles as "reset this person's password".
//
// Setting a password bumps tokenVersion, which is what signs the account out
// everywhere it is currently signed in — the same thing the reset flow does,
// for the same reason.
//
// Twelve bcrypt rounds, matching src/lib/password.ts. The login route verifies
// against that cost, so this is not a number to pick freely here.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};

const email = typeof flag('--email') === 'string' ? flag('--email').trim().toLowerCase() : null;

if (flag('--list') || (!email && !argv.length)) {
  const all = await prisma.employee.findMany({
    orderBy: { createdAt: 'asc' },
    select: { email: true, name: true, role: true, region: true, isActive: true, lastLoginAt: true, tokenVersion: true },
  });
  if (!all.length) console.log('No staff accounts yet.');
  for (const e of all) {
    console.log(
      `${e.isActive ? ' ' : '✕'} ${e.email.padEnd(32)} ${e.name.padEnd(22)} ${e.role.padEnd(9)} ${(e.region ?? '—').padEnd(12)} ` +
      `last login ${e.lastLoginAt ? e.lastLoginAt.toISOString() : 'never'}  tokenVersion ${e.tokenVersion}`
    );
  }
  await prisma.$disconnect();
  process.exit(0);
}

if (!email) {
  console.error('Need --email. See the usage lines at the top of this file.');
  await prisma.$disconnect();
  process.exit(1);
}

if (flag('--deactivate') || flag('--reactivate')) {
  const isActive = Boolean(flag('--reactivate'));
  const updated = await prisma.employee.update({
    where: { email },
    // Deactivating bumps the version too: "switched off" has to mean "signed
    // out", not "signed out whenever the cookie happens to lapse".
    data: isActive ? { isActive } : { isActive, tokenVersion: { increment: 1 } },
    select: { email: true, isActive: true },
  });
  console.log(`${updated.email} is now ${updated.isActive ? 'active' : 'deactivated'}`);
  await prisma.$disconnect();
  process.exit(0);
}

const password = typeof flag('--password') === 'string' ? flag('--password') : null;
const name = typeof flag('--name') === 'string' ? flag('--name') : null;
const region = typeof flag('--region') === 'string' ? flag('--region') : null;
const rank = typeof flag('--rank') === 'string' ? flag('--rank').toUpperCase() : null;

if (rank && !['ADMIN', 'EMPLOYEE'].includes(rank)) {
  console.error('--rank must be ADMIN or EMPLOYEE');
  await prisma.$disconnect();
  process.exit(1);
}

const existing = await prisma.employee.findUnique({ where: { email }, select: { id: true } });

if (!existing && (!password || !name)) {
  console.error('A new account needs --name and --password.');
  await prisma.$disconnect();
  process.exit(1);
}
if (password && password.length < 8) {
  console.error('Use at least 8 characters.');
  await prisma.$disconnect();
  process.exit(1);
}

const data = {
  ...(name ? { name } : {}),
  ...(region !== null ? { region } : {}),
  ...(rank ? { role: rank } : {}),
  ...(password ? { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } } : {}),
};

const saved = existing
  ? await prisma.employee.update({ where: { email }, data, select: { email: true, name: true, role: true, region: true } })
  : await prisma.employee.create({
      data: { email, name, region, role: rank ?? 'EMPLOYEE', passwordHash: await bcrypt.hash(password, 12) },
      select: { email: true, name: true, role: true, region: true },
    });

console.log(`${existing ? 'Updated' : 'Created'} ${saved.email} (${saved.name}, ${saved.role}${saved.region ? `, ${saved.region}` : ''})`);
if (password) console.log('Password set — any existing sessions for this account are now invalid.');
await prisma.$disconnect();

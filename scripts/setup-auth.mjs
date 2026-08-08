// One-time setup: create the User table via raw SQL (so we don't need to
// regenerate the Prisma client while the Windows dev server holds a lock)
// and seed the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

// Load .env manually (a bare node script doesn't auto-load it).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT,
    "image" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'credentials',
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('✓ "User" table ready');

const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (adminEmail && adminPassword) {
  const hash = await bcrypt.hash(adminPassword, 10);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" ("id","name","email","passwordHash","provider","role")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'credentials', 'admin')
     ON CONFLICT ("email") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "role" = 'admin', "name" = EXCLUDED."name";`,
    "Affhan Admin",
    adminEmail,
    hash
  );
  console.log(`✓ admin seeded: ${adminEmail}`);
}

const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "User";`);
console.log("✓ total users:", count[0].c);
await prisma.$disconnect();

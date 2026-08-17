import fs from "fs";
import { PrismaClient } from "@prisma/client";

const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const prisma = new PrismaClient();
const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

// Which account to use for these lookups — pick one that has spare points.
const USE_KEY = process.env.USE_KEY === "2" ? "CJ_API_KEY_2" : process.env.USE_KEY === "3" ? "CJ_API_KEY_3" : "CJ_API_KEY";
const API_KEY = process.env[USE_KEY];

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function getToken() {
  const res = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`Auth error: ${json.message}`);
  return json.data.accessToken;
}

async function getCategoryTotal(token, categoryId, retries = 4) {
  try {
    const res = await fetch(
      `${CJ_API_URL}/product/list?categoryId=${categoryId}&pageNum=1&pageSize=1`,
      { headers: { "CJ-Access-Token": token } }
    );
    const json = await res.json();
    if (!json.result) {
      if (json.message && json.message.includes("Too Many Requests") && retries > 0) {
        await delay(4000);
        return getCategoryTotal(token, categoryId, retries - 1);
      }
      return null;
    }
    return json.data.total;
  } catch {
    return null;
  }
}

async function run() {
  console.log(`Using account: ${USE_KEY}`);
  const token = await getToken();

  // Get all PARTIAL_LIMIT_REACHED categories (the ones still being worked through)
  const partial = await prisma.syncProgress.findMany({
    where: { status: "PARTIAL_LIMIT_REACHED" },
    include: { category: true },
  });

  console.log(`Checking totals for ${partial.length} remaining categories...\n`);

  const results = [];
  for (const p of partial) {
    await delay(2000);
    const total = await getCategoryTotal(token, p.categoryId);
    console.log(`  ${p.category.name}: ${total === null ? "ERROR" : total} products`);
    if (total !== null) {
      results.push({ name: p.category.name, id: p.categoryId, total });
    }
  }

  results.sort((a, b) => b.total - a.total);

  console.log("\n=== SORTED LARGEST TO SMALLEST ===");
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name} (${r.id}): ${r.total} products`);
  });

  await prisma.$disconnect();
}

run().catch(console.error);

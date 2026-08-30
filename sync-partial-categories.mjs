import fs from "fs";
import { PrismaClient } from "@prisma/client";

// ---- Load .env (same pattern as populate-all-categories.mjs) ----
const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const prisma = new PrismaClient();
const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

// ---- Optional: set this to test on ONE category first ----
// e.g. TEST_CATEGORY_ID=2410110350161600700 node sync-partial-categories.mjs
const TEST_CATEGORY_ID = process.env.TEST_CATEGORY_ID || null;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ---- Auth (same as cj.ts) ----
let cachedToken = null;
let tokenExpiry = null;
async function getToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 600000) return cachedToken;

  const apiKey = process.env.CJ_API_KEY;
  const res = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`Auth error: ${json.message}`);
  cachedToken = json.data.accessToken;
  const expiryParsed = new Date(json.data.accessTokenExpiryDate).getTime();
  tokenExpiry = isNaN(expiryParsed) ? now + 14 * 24 * 60 * 60 * 1000 : expiryParsed;
  return cachedToken;
}

// ---- Moderation filter (mirrors route.ts logic) ----
const explicitWords = ['vibrator', 'dildo', 'masturbator', 'fleshlight', 'anal', 'penis', 'vagina', 'sex doll', 'bdsm', 'bondage', 'nipple clamp', 'cock ring', 'adult toy', 'sex toy', 'butt plug', 'anal plug'];
const lingerieWords = ['bra', 'lingerie', 'camisole', 'corset', 'latex bodysuit', 'shapewear', 'waist trainer', 'girdle', 'bikini', 'g-string', 'gstring'];
const fetishWords = ['patent leather bodysuit', 'harness'];
const standardRegex = new RegExp(`\\b(${[...explicitWords, ...lingerieWords, ...fetishWords].join('|')})\\b`, 'i');

const blockedCategoryIds = [
  '95C53342-6277-4FEC-B450-6D3F9EEDD6A1',
  '2409230541301627300',
  '7D611AF5-5135-4BBB-86F6-E80179F8E5B8',
  'ECDBD4C4-7467-4831-9F55-740E3C7968BE',
  '7B69E34F-43A3-4143-A22D-30786EE97998'
];

function checkModeration(name, categoryName) {
  const hasExclusion = ['wiring harness', 'dog harness', 'pet harness', 'safety harness', 'latex toy', 'cleaning glove', 'disposable latex glove', 'goalkeeper glove', 'latex glove'].some(ex => name.toLowerCase().includes(ex));
  if (hasExclusion) return { blocked: false };

  const match = name.toLowerCase().match(standardRegex);
  if (match) return { blocked: true, keyword: match[0] };
  if (standardRegex.test(categoryName || '')) return { blocked: true, keyword: 'Category Name Match' };
  return { blocked: false };
}

// ---- CJ listV2 fetch ----
async function fetchListV2(categoryId, minPrice, maxPrice, page, size, retries = 4) {
  const token = await getToken();
  const params = new URLSearchParams({
    categoryId,
    page: String(page),
    size: String(size),
    startSellPrice: String(minPrice),
    endSellPrice: String(maxPrice),
  });

  try {
    const res = await fetch(`${CJ_API_URL}/product/listV2?${params.toString()}`, {
      headers: { "CJ-Access-Token": token },
    });
    const json = await res.json();

    if (!json.result) {
      if (json.message && json.message.includes("Insufficient API points")) {
        throw new Error("PointsLimitReached");
      }
      if (json.message && (json.message.includes("Too Many Requests") || json.message.includes("QPS limit"))) {
        throw new Error("RateLimited");
      }
      throw new Error(`API Error: ${json.message}`);
    }
    return json.data;
  } catch (err) {
    if (err.message === "RateLimited" && retries > 0) {
      await delay(2000);
      return fetchListV2(categoryId, minPrice, maxPrice, page, size, retries - 1);
    }
    throw err;
  }
}

// Recursively narrow a price band until each slice has <= 6000 products,
// then page through it fully and collect items into `seen` (deduped by id).
async function collectSlice(categoryId, minPrice, maxPrice, seen, depth = 0) {
  await delay(1100);
  const probe = await fetchListV2(categoryId, minPrice, maxPrice, 1, 1);
  const total = probe.totalRecords || 0;

  console.log(`${"  ".repeat(depth + 1)}$${minPrice}-$${maxPrice}: ${total} products`);

  if (total === 0) return;

  if (total > 5900 && (maxPrice - minPrice) > 0.02) {
    const mid = Math.round(((minPrice + maxPrice) / 2) * 100) / 100;
    await delay(1200);
    await collectSlice(categoryId, minPrice, mid, seen, depth + 1);
    await delay(1200);
    await collectSlice(categoryId, mid, maxPrice, seen, depth + 1);
    return;
  }

  const pageSize = 100;
  const pages = Math.ceil(Math.min(total, 6000) / pageSize);

  for (let p = 1; p <= pages; p++) {
    const data = await fetchListV2(categoryId, minPrice, maxPrice, p, pageSize);
    const items = (data.content || []).flatMap((c) => c.productList || []);
    for (const item of items) {
      if (item.id) seen.set(item.id, item);
    }
    await delay(1200);
  }
}

async function upsertProduct(item, categoryId, fallbackCategoryName) {
  const cjPid = item.id;
  if (!cjPid) return "skipped";

  const name = item.nameEn || "Unknown Product";
  const categoryName = item.threeCategoryName || fallbackCategoryName;

  if (blockedCategoryIds.includes(categoryId)) return "blocked";

  const mod = checkModeration(name, categoryName);
  if (mod.blocked) {
    try {
      await prisma.moderationLog.create({
        data: {
          cjPid: String(cjPid),
          name,
          categoryName,
          flaggedKeyword: mod.keyword,
        },
      });
    } catch {
      // likely already logged before, ignore
    }
    return "moderated";
  }

  await prisma.product.upsert({
    where: { cjPid: String(cjPid) },
    update: {
      name,
      sku: item.sku || null,
      imageUrl: item.bigImage || null,
      categoryId,
      category: categoryName,
      lastSynced: new Date(),
    },
    create: {
      cjPid: String(cjPid),
      name,
      sku: item.sku || null,
      imageUrl: item.bigImage || null,
      categoryId,
      category: categoryName,
    },
  });
  return "saved";
}

async function run() {
  try {
    let categories;

    if (TEST_CATEGORY_ID) {
      categories = await prisma.category.findMany({
        where: { id: TEST_CATEGORY_ID },
      });
      console.log(`TEST MODE: running only category ${TEST_CATEGORY_ID}`);
    } else {
      const partial = await prisma.syncProgress.findMany({
        where: { status: "PARTIAL_LIMIT_REACHED" },
        include: { category: true },
      });
      categories = partial.map((p) => p.category);
      console.log(`Found ${categories.length} PARTIAL_LIMIT_REACHED categories to reprocess.`);
    }

    let grandTotalSaved = 0;
    let grandTotalModerated = 0;

    for (const cat of categories) {
      console.log(`\n=== Category: ${cat.name} (${cat.id}) ===`);
      const seen = new Map();

      const maxPriceCeiling = Number(process.env.MAX_PRICE || 100000);
      try {
        await collectSlice(cat.id, 0, maxPriceCeiling, seen);
      } catch (err) {
        if (err.message === "PointsLimitReached") {
          console.log("Daily API points exhausted. Stopping here — safe to resume tomorrow.");
          await prisma.$disconnect();
          process.exit(0);
        }
        console.error(`Failed slicing category ${cat.name}:`, err.message);
        continue;
      }

      console.log(`Collected ${seen.size} unique products for ${cat.name}. Saving to DB...`);

      let saved = 0;
      let moderated = 0;
      for (const item of seen.values()) {
        try {
          const result = await upsertProduct(item, cat.id, cat.name);
          if (result === "saved") saved++;
          if (result === "moderated") moderated++;
        } catch (e) {
          console.error(`Upsert failed for pid ${item.id}:`, e.message);
        }
      }

      console.log(`Category ${cat.name} done. Saved: ${saved}, Moderated: ${moderated}`);
      grandTotalSaved += saved;
      grandTotalModerated += moderated;
    }

    console.log(`\n=== ALL DONE ===`);
    console.log(`Total new products saved: ${grandTotalSaved}`);
    console.log(`Total moderated/skipped: ${grandTotalModerated}`);
  } catch (e) {
    console.error("Fatal error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

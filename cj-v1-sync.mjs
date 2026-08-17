import fs from "fs";
import { PrismaClient } from "@prisma/client";

// ---- Load .env ----
const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const prisma = new PrismaClient();
const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

// ---- Which account to use ----
// USE_KEY=2 node cj-v1-sync.mjs   -> uses CJ_API_KEY_2 (new account)
// (default)                        -> uses CJ_API_KEY   (old account)
const USE_KEY = process.env.USE_KEY === "2" ? "CJ_API_KEY_2" : process.env.USE_KEY === "3" ? "CJ_API_KEY_3" : "CJ_API_KEY";
const API_KEY = process.env[USE_KEY];
if (!API_KEY) {
  console.error(`Missing ${USE_KEY} in .env`);
  process.exit(1);
}
console.log(`Using account: ${USE_KEY}`);

// ASSIGN_KEY controls which category "bucket" (1/2/3-way split) this run
// pulls from — independent of which credentials (USE_KEY) are used to
// authenticate. Lets a fresh-quota account help clear another account's
// remaining categories. Defaults to same as USE_KEY if not set.
const ASSIGN_KEY = process.env.ASSIGN_KEY
  ? (process.env.ASSIGN_KEY === "2" ? "CJ_API_KEY_2" : process.env.ASSIGN_KEY === "3" ? "CJ_API_KEY_3" : "CJ_API_KEY")
  : USE_KEY;
if (ASSIGN_KEY !== USE_KEY) {
  console.log(`Category assignment bucket: ${ASSIGN_KEY} (borrowing its remaining categories)`);
}

// ---- Progress file (separate per account, so both can run independently) ----
const PROGRESS_FILE = `./v1-sync-progress-${USE_KEY}.json`;
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch {
    return { doneCategories: [], categoryCursor: {} };
  }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---- Scan cache: remembers which price bands have already been resolved
// (either as a "leaf" band <=5800 products, or split into two smaller
// bands) so an interrupted scan resumes instantly instead of re-probing
// from $0-$100000 every time. This is shared across accounts since price
// bands are a structural property of the category, not the API key. ----
const SCAN_CACHE_FILE = "./v1-scan-cache.json";
function loadScanCache() {
  try {
    return JSON.parse(fs.readFileSync(SCAN_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function saveScanCache(cache) {
  fs.writeFileSync(SCAN_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ---- Daily request budget (stay under CJ's 1000/day V1 limit, with safety margin) ----
const MAX_REQUESTS_THIS_RUN = Number(process.env.MAX_REQUESTS || 800);
let requestsUsed = 0;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ---- Auth ----
let cachedToken = null;
let tokenExpiry = null;
async function getToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 600000) return cachedToken;

  const res = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: API_KEY }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`Auth error: ${json.message}`);
  cachedToken = json.data.accessToken;
  const expiryParsed = new Date(json.data.accessTokenExpiryDate).getTime();
  tokenExpiry = isNaN(expiryParsed) ? now + 14 * 24 * 60 * 60 * 1000 : expiryParsed;
  return cachedToken;
}

// ---- Moderation (same rules as route.ts) ----
const explicitWords = ['vibrator', 'dildo', 'masturbator', 'fleshlight', 'anal', 'penis', 'vagina', 'sex doll', 'bdsm', 'bondage', 'nipple clamp', 'cock ring', 'adult toy', 'sex toy', 'butt plug', 'anal plug'];
const lingerieWords = ['bra', 'lingerie', 'camisole', 'corset', 'latex bodysuit', 'shapewear', 'waist trainer', 'girdle', 'bikini', 'g-string', 'gstring'];
const fetishWords = ['patent leather bodysuit', 'harness'];
const standardRegex = new RegExp(`\\b(${[...explicitWords, ...lingerieWords, ...fetishWords].join('|')})\\b`, 'i');
const blockedCategoryIds = [
  '95C53342-6277-4FEC-B450-6D3F9EEDD6A1',
  '2409230541301627300',
  '7D611AF5-5135-4BBB-86F6-E80179F8E5B8',
  'ECDBD4C4-7467-4831-9F55-740E3C7968BE',
  '7B69E34F-43A3-4143-A22D-30786EE97998',
  '3B8946E7-B608-4DAB-B2F0-C425B7875035' // Skirts — excluded per user request
];

// Very large / slow-to-scan categories — process these LAST, after smaller
// ones finish, so a fresh daily budget isn't burned entirely on scanning one
// giant category (e.g. Home Office Storage has 238k+ products with very
// deep price clustering near $0-3, requiring many recursive splits).
// Ordered largest-to-smallest based on actual CJ totals discovered.
// Biggest categories get processed first (most likely to have the most
// untouched/new products). Known-saturated small categories go last.
const priorityCategoryIds = [
  '87CF251F-8D11-4DE0-A154-9694D9858EB3', // Home Office Storage — 238,483
  'D2432903-0D4E-4787-886F-D3D9DA7890D9', // Lady Dresses — 92,223
  '95D9F317-1DB3-4E42-A031-02223215B9C5', // Necklace & Pendants — 50,849 (already mostly done)
  'D28405AE-66C6-42E6-BFF0-D6FDCB5C083C', // Earrings — 50,113
  '2410301014451618100',                   // Furniture — 44,848
  '56B4F8B6-8600-4A18-913E-53F2F693EC2C', // Rings — 38,366
  '0615F8DB-C10F-4BEF-892B-1C5B04268938', // Bracelets & Bangles — 31,013 (already mostly done)
  '5A3E7341-18B5-4C61-BFCD-8965B3479A9A', // Blouses & Shirts — 26,782
  '79F47CD1-F813-4B4D-8D21-2B35966FBA66', // Sports Accessories — 22,837 (already mostly done)
];

const deferredCategoryIds = [
  '552F095A-904C-40E4-A43B-0CD1CE15D29F', // 925 Silver Jewelry — 99.98% already had
  '63584B9B-5275-4268-8BEA-7D3C7A7BB925', // Woman Jeans — 99.9% already had
  'AAB54987-4E92-40C7-B0F5-5E814C1E6980', // Woman Sandals — 99.96% already had
  '638284D0-3651-4FC9-9F25-B0A0BA323D83', // Pumps — high already-had
  '07398ADB-FC5E-4CC4-AD00-EB230E779E88', // Blazers — 99.8% already had
  '8A22518D-0C6F-430D-8CD9-7E043062A279', // Woman Shorts — small, likely saturated
  '633E1860-7C63-4006-AB35-3FC16BECFA62', // Body Jewelry — small
  'DD918287-C279-466A-B9C6-56079DE4B37A', // Stuffed & Plush Animals — small
];
function checkModeration(name, categoryName) {
  const hasExclusion = ['wiring harness', 'dog harness', 'pet harness', 'safety harness', 'latex toy', 'cleaning glove', 'disposable latex glove', 'goalkeeper glove', 'latex glove'].some(ex => name.toLowerCase().includes(ex));
  if (hasExclusion) return { blocked: false };
  const match = name.toLowerCase().match(standardRegex);
  if (match) return { blocked: true, keyword: match[0] };
  if (standardRegex.test(categoryName || '')) return { blocked: true, keyword: 'Category Name Match' };
  return { blocked: false };
}

// ---- V1 fetch with retry on rate limit ----
async function fetchV1(categoryId, pageNum, pageSize, minPrice, maxPrice, retries = 6) {
  if (requestsUsed >= MAX_REQUESTS_THIS_RUN) throw new Error("BudgetExhausted");

  const token = await getToken();
  const params = new URLSearchParams({
    categoryId,
    pageNum: String(pageNum),
    pageSize: String(pageSize),
  });
  if (minPrice !== undefined) params.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));

  requestsUsed++;
  try {
    const res = await fetch(`${CJ_API_URL}/product/list?${params.toString()}`, {
      headers: { "CJ-Access-Token": token },
    });
    const json = await res.json();

    if (!json.result) {
      if (json.message && json.message.includes("Too Many Requests")) throw new Error("RateLimited");
      if (json.message && json.message.includes("max offset")) throw new Error("MaxOffsetLimit");
      if (json.message && json.message.includes("Insufficient")) throw new Error("PointsLimitReached");
      throw new Error(`API Error: ${json.message}`);
    }
    return json.data;
  } catch (err) {
    if (err.message === "RateLimited" && retries > 0) {
      await delay(4000);
      return fetchV1(categoryId, pageNum, pageSize, minPrice, maxPrice, retries - 1);
    }
    throw err;
  }
}

// Resolves a category's price bands (splitting until each is <=5800
// products), then pages through each UNFETCHED band, saving each page's
// items to the DB immediately (not batched at the end). This means an
// interrupted run only needs to redo the ONE band it was mid-way through —
// every previously completed band's data is already safely in the DB.
async function collectSlice(cat, scanCache, existingPids) {
  const categoryId = cat.id;
  if (!scanCache[categoryId]) {
    scanCache[categoryId] = { pending: [[0, 100000]], resolved: [], fetched: [], complete: false };
    saveScanCache(scanCache);
  }
  const catCache = scanCache[categoryId];
  if (!catCache.fetched) catCache.fetched = []; // backward-compat for older cache files

  if (!catCache.complete) {
    while (catCache.pending.length > 0) {
      const [minPrice, maxPrice] = catCache.pending.shift();
      await delay(2000);
      const probe = await fetchV1(categoryId, 1, 1, minPrice, maxPrice);
      const total = probe.total || 0;
      console.log(`  $${minPrice}-$${maxPrice}: ${total} products`);

      if (total === 0) {
        // discard, nothing here
      } else if (total > 5800 && (maxPrice - minPrice) > 0.02) {
        const mid = Math.round(((minPrice + maxPrice) / 2) * 100) / 100;
        catCache.pending.push([minPrice, mid], [mid, maxPrice]);
      } else {
        catCache.resolved.push([minPrice, maxPrice, total]);
      }
      saveScanCache(scanCache); // persist after every single step
    }
    catCache.complete = true;
    saveScanCache(scanCache);
  } else {
    console.log(`  (Using cached price bands — ${catCache.resolved.length} bands total, ${catCache.fetched.length} already fetched+saved)`);
  }

  const pageSize = 200;
  const SAVE_CONCURRENCY = 20;
  let saved = 0, moderated = 0, alreadyExists = 0, totalProcessed = 0;
  let earlyExit = false;

  const fetchedSet = new Set(catCache.fetched.map((b) => JSON.stringify(b)));
  const wasFreshCategory = catCache.fetched.length === 0; // never touched before this run
  let bandsToProcess = catCache.resolved
    .map((b, idx) => ({ band: b, idx }))
    .filter(({ band }) => !fetchedSet.has(JSON.stringify(band)));

  // Optional: split THIS category's remaining bands across multiple accounts
  // (e.g. BAND_SPLIT=1/3 means "take every 3rd band starting at index 0").
  if (process.env.BAND_SPLIT) {
    const [part, totalParts] = process.env.BAND_SPLIT.split("/").map(Number);
    bandsToProcess = bandsToProcess.filter(({ idx }) => idx % totalParts === (part - 1));
    console.log(`  BAND_SPLIT ${process.env.BAND_SPLIT}: processing ${bandsToProcess.length} of the remaining bands.`);
  }

  let bandNum = 0;
  let budgetExhausted = false;
  for (const { band } of bandsToProcess) {
    const [minPrice, maxPrice, total] = band;
    bandNum++;
    const pages = Math.ceil(Math.min(total, 6000) / pageSize);

    try {
      for (let p = 1; p <= pages; p++) {
        await delay(2000);
        const data = await fetchV1(categoryId, p, pageSize, minPrice, maxPrice);
        const items = (data.list || []).filter((item) => item.pid);

        // Save this page's items right now — don't wait for the whole category.
        for (let i = 0; i < items.length; i += SAVE_CONCURRENCY) {
          const chunk = items.slice(i, i + SAVE_CONCURRENCY);
          const results = await Promise.allSettled(
            chunk.map((item) =>
              Promise.race([
                upsertProduct(item, categoryId, cat.name, existingPids),
                new Promise((_, reject) => setTimeout(() => reject(new Error("UpsertTimeout")), 10000)),
              ])
            )
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              if (r.value === "saved") { saved++; existingPids.add(String(chunk[idx].pid)); }
              if (r.value === "moderated") { moderated++; existingPids.add(String(chunk[idx].pid)); }
              if (r.value === "already-exists") alreadyExists++;
            } else {
              console.error(`Upsert failed/timed out for ${chunk[idx].pid}:`, r.reason?.message);
            }
          });
          totalProcessed += chunk.length;
        }

        if (p % 5 === 0 || p === pages) {
          console.log(`  Band ${bandNum}/${bandsToProcess.length} ($${minPrice}-$${maxPrice}): page ${p}/${pages} | NEW saved: ${saved}, already had: ${alreadyExists}, moderated: ${moderated}`);
        }

        if (totalProcessed >= 1000 && alreadyExists / totalProcessed > 0.98) {
          if (wasFreshCategory) {
            console.log(`  Category appears ${((alreadyExists / totalProcessed) * 100).toFixed(1)}% already-saved after ${totalProcessed} items (fresh category) — marking all remaining bands done and skipping.`);
          } else {
            console.log(`  This band appears ${((alreadyExists / totalProcessed) * 100).toFixed(1)}% already-saved — moving to next band only (category was already partially fetched before, so not skipping the rest).`);
          }
          earlyExit = true;
          break;
        }
      }
    } catch (err) {
      if (err.message === "BudgetExhausted" || err.message === "PointsLimitReached") {
        budgetExhausted = true;
        break;
      }
      throw err;
    }

    catCache.fetched.push(band);
    saveScanCache(scanCache);

    if (earlyExit && wasFreshCategory) {
      catCache.fetched = catCache.resolved.slice(); // safe to mark whole fresh category done
      saveScanCache(scanCache);
      break;
    }
    earlyExit = false; // reset so the next band still gets a fair chance
  }

  return { saved, moderated, alreadyExists, processed: totalProcessed, budgetExhausted };
}

function parseName(nameStr) {
  if (!nameStr) return null;
  if (typeof nameStr === "string" && nameStr.startsWith("[") && nameStr.endsWith("]")) {
    try {
      const parsed = JSON.parse(nameStr);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
    } catch {}
  }
  return String(nameStr);
}

async function upsertProduct(item, categoryId, fallbackCategoryName, existingPids) {
  const cjPid = item.pid;
  if (!cjPid) return "skipped";
  if (blockedCategoryIds.includes(categoryId)) return "blocked";

  // Skip products we already have — no need to re-fetch/re-write them.
  if (existingPids.has(String(cjPid))) return "already-exists";

  const name = parseName(item.productNameEn || item.productName) || "Unknown Product";
  const categoryName = item.categoryName || fallbackCategoryName;

  const mod = checkModeration(name, categoryName);
  if (mod.blocked) {
    try {
      await prisma.moderationLog.create({
        data: { cjPid: String(cjPid), name, categoryName, flaggedKeyword: mod.keyword },
      });
    } catch {}
    return "moderated";
  }

  await prisma.product.create({
    data: {
      cjPid: String(cjPid),
      name,
      sku: item.productSku || null,
      imageUrl: item.productImage || null,
      categoryId,
      category: categoryName,
    },
  });
  return "saved";
}

async function run() {
  const progress = loadProgress();

  try {
    console.log("Loading existing product IDs from DB (one-time, for fast skip)...");
    const existingRows = await prisma.product.findMany({ select: { cjPid: true } });
    const existingPids = new Set(existingRows.map((r) => r.cjPid));
    const existingModRows = await prisma.moderationLog.findMany({ select: { cjPid: true } });
    existingModRows.forEach((r) => existingPids.add(r.cjPid));
    console.log(`Loaded ${existingPids.size} existing product IDs (Product + ModerationLog). These will be skipped.\n`);

    // Women's clothing categories carry the highest risk of explicit/adult
    // content (lingerie, costumes, revealing dresses etc). Rather than
    // filtering product-by-product, we exclude these categories entirely
    // going forward — safer for a general B2B catalog.
    const blockedWomensClothingNames = new Set([
      "Women's Short-Sleeved Shirts",
      "Women's Long-Sleeved Shirts",
      "Woman Shorts",
      "Bikini Sets",
      "One-Piece Suits",
      "Two-Piece Suits",
      "Evening Dresses",
      "Prom Dresses",
      "Wedding Dresses",
      "Lady Dresses",
      "Blouses & Shirts",
      "Woman Hoodies & Sweatshirts",
    ]);
    console.log(`${blockedWomensClothingNames.size} women's clothing category names excluded (high 18+ risk).\n`);

    const scanCache = loadScanCache();

    const partial = await prisma.syncProgress.findMany({
      where: { status: "PARTIAL_LIMIT_REACHED" },
      include: { category: true },
      orderBy: { categoryId: "asc" },
    });
    let allCategories = partial.map((p) => p.category);

    // Split work between accounts so they never touch the same category
    // at the same time: 0 = CJ_API_KEY, 1 = CJ_API_KEY_2, 2 = CJ_API_KEY_3
    const keyIndex = ASSIGN_KEY === "CJ_API_KEY_2" ? 1 : ASSIGN_KEY === "CJ_API_KEY_3" ? 2 : 0;
    const totalKeys = 3;
    allCategories = allCategories.filter((_, idx) => idx % totalKeys === keyIndex);

    let categories = allCategories.filter(
      (c) =>
        !progress.doneCategories.includes(c.id) &&
        !blockedCategoryIds.includes(c.id) &&
        !blockedWomensClothingNames.has(c.name)
    );

    // Override: force-target ONE specific category regardless of normal
    // bucket assignment (used together with BAND_SPLIT to have multiple
    // accounts work different price-bands of the same huge category).
    if (process.env.ONLY_CATEGORY) {
      const forced = await prisma.category.findUnique({ where: { id: process.env.ONLY_CATEGORY } });
      categories = forced ? [forced] : [];
    }

    // If borrowing another account's category bucket, also skip categories
    // that account has already finished (per its own progress file).
    if (ASSIGN_KEY !== USE_KEY) {
      const assignProgressFile = `./v1-sync-progress-${ASSIGN_KEY}.json`;
      try {
        const assignProgress = JSON.parse(fs.readFileSync(assignProgressFile, "utf8"));
        categories = categories.filter((c) => !assignProgress.doneCategories.includes(c.id));
      } catch {
        // no progress file for that account yet — nothing to exclude
      }
    }

    // Priority categories first (in the exact order listed above), then
    // normal categories, then deferred (saturated) categories last.
    categories.sort((a, b) => {
      const aPriorityIdx = priorityCategoryIds.indexOf(a.id);
      const bPriorityIdx = priorityCategoryIds.indexOf(b.id);
      const aDeferred = deferredCategoryIds.includes(a.id) ? 1 : 0;
      const bDeferred = deferredCategoryIds.includes(b.id) ? 1 : 0;

      if (aPriorityIdx !== -1 || bPriorityIdx !== -1) {
        if (aPriorityIdx === -1) return 1;
        if (bPriorityIdx === -1) return -1;
        return aPriorityIdx - bPriorityIdx;
      }
      return aDeferred - bDeferred;
    });

    console.log(`${categories.length} categories assigned to ${USE_KEY} remaining (of ${allCategories.length} assigned total).`);
    console.log(`Budget for this run: ${MAX_REQUESTS_THIS_RUN} requests.\n`);

    let totalSaved = 0;
    let totalModerated = 0;

    for (const cat of categories) {
      console.log(`\n=== Category: ${cat.name} (${cat.id}) ===`);

      let result;
      try {
        result = await collectSlice(cat, scanCache, existingPids);
      } catch (err) {
        console.error(`Failed on category ${cat.name}:`, err.message);
        continue;
      }

      totalSaved += result.saved;
      totalModerated += result.moderated;

      if (result.budgetExhausted) {
        console.log(`\nDaily request budget used up (${requestsUsed}/${MAX_REQUESTS_THIS_RUN}).`);
        console.log(`Category ${cat.name} partially done this run — NEW saved: ${result.saved}, Moderated: ${result.moderated}, Already had: ${result.alreadyExists}. Already-fetched bands won't be re-fetched next time.`);
        console.log(`\n=== RUN SUMMARY (stopped early — budget exhausted) ===`);
        console.log(`Total new products saved this run: ${totalSaved}`);
        console.log(`Total moderated: ${totalModerated}`);
        console.log(`Total requests used: ${requestsUsed}`);
        console.log("Run again (tomorrow, or with a fresh budget) to continue.");
        saveProgress(progress);
        await prisma.$disconnect();
        process.exit(0);
      }

      console.log(`Category ${cat.name} done. NEW Saved: ${result.saved}, Moderated: ${result.moderated}, Already had: ${result.alreadyExists}. (Requests used so far: ${requestsUsed})`);

      progress.doneCategories.push(cat.id);
      saveProgress(progress);
    }

    console.log(`\n=== RUN COMPLETE ===`);
    console.log(`Total new products saved this run: ${totalSaved}`);
    console.log(`Total moderated: ${totalModerated}`);
    console.log(`Total requests used: ${requestsUsed}`);
  } catch (e) {
    console.error("Fatal error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

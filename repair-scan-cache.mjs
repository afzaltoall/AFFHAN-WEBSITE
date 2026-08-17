import fs from "fs";

const CACHE_FILE = "./v1-scan-cache.json";
const CATEGORY_ID = "87CF251F-8D11-4DE0-A154-9694D9858EB3"; // Home Office Storage
const KNOWN_GOOD_BAND_COUNT = 28; // confirmed correct from account 1's earlier log

const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

if (!cache[CATEGORY_ID]) {
  console.log("No cache entry found for this category — nothing to repair.");
  process.exit(0);
}

const cat = cache[CATEGORY_ID];
console.log(`Before repair: ${cat.fetched.length} bands marked as fetched (out of ${cat.resolved.length} total resolved bands).`);

// Reset "fetched" to only the first N bands (in resolved order), which is
// exactly what account 1 genuinely completed before the bug incorrectly
// marked everything else as done too.
cat.fetched = cat.resolved.slice(0, KNOWN_GOOD_BAND_COUNT);

fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

console.log(`After repair: ${cat.fetched.length} bands marked as fetched.`);
console.log(`Remaining bands to fetch: ${cat.resolved.length - cat.fetched.length}`);
console.log("Repair complete. Next run will correctly resume from band 29 onward.");

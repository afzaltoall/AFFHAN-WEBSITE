import fs from 'fs';

async function runFullSync() {
  console.log("Starting full catalog backfill via local API...");
  console.log("Make sure your Next.js dev server (npm run dev) is running!\n");

  let isComplete = false;
  let totalBatches = 0;
  let totalProductsSynced = 0;
  let currentCategory = "";
  let zeroSyncCount = 0;

  while (!isComplete) {
    try {
      console.log(`[Batch ${totalBatches + 1}] Fetching next batch...`);
      
      const res = await fetch("http://localhost:3000/api/cron/sync?test=true");
      
      if (!res.ok) {
        if (res.status === 429) {
          console.log("\n🛑 DAILY CJ API POINTS LIMIT REACHED!");
          console.log("The sync has automatically paused and saved its progress.");
          console.log("Please re-run this script tomorrow when your points reset.");
          break;
        }
        
        console.error(`HTTP Error: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.error(text);
        console.log("Waiting 10 seconds before retrying...");
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const data = await res.json();
      
      if (data.message === "All categories completed.") {
        isComplete = true;
        console.log("\n✅ FULL SYNC COMPLETE! All categories have been successfully fetched.");
        console.log(`Total batches run: ${totalBatches}`);
        console.log(`Total products synced in this session: ${totalProductsSynced}`);
        
        // console.log("\n🔍 Running automated post-sync moderation audit...");
        // try {
        //   const { execSync } = await import('child_process');
        //   execSync('node comprehensive_scan.js', { stdio: 'inherit' });
        //   console.log("✅ Post-sync audit complete! Check contamination_report.json.");
        // } catch (e) {
        //   console.error("Failed to run post-sync audit:", e);
        // }
        
        break;
      }

      // If it just initialized the categories or did a force completion
      if (data.message && (data.message.includes("Initialized") || data.message.includes("Forced"))) {
        console.log(`👉 ${data.message}`);
        continue; // Immediately fetch again to start syncing
      }

      // Normal progress update
      if (data.synced !== undefined) {
        totalProductsSynced += data.synced;
        console.log(`👉 Synced ${data.synced} products in category: ${data.category}`);
        console.log(`   Status: ${data.status} | Pages: ${data.lastPageFetched} / ${data.totalPages}`);
        
        // Safety net: Check for consecutive zero-syncs
        if (data.synced === 0 && data.status === "IN_PROGRESS") {
          if (currentCategory === data.category) {
            zeroSyncCount++;
          } else {
            currentCategory = data.category;
            zeroSyncCount = 1;
          }
          
          if (zeroSyncCount >= 3) {
            console.log(`🚨 HARD SAFETY NET: 3 consecutive zero syncs on ${data.category}. Forcing completion...`);
            await fetch(`http://localhost:3000/api/cron/sync?test=true&forcePartial=${encodeURIComponent(data.category)}`);
            zeroSyncCount = 0;
          }
        } else {
          currentCategory = data.category;
          zeroSyncCount = 0;
        }

        totalBatches++;
      } else {
        // Fallback log if response structure is unexpected
        console.log(data);
      }

      // Small 2.5 second delay between batches to protect against API rate limits
      await new Promise(r => setTimeout(r, 2500));

    } catch (err) {
      console.error("Fetch failed (is your dev server running?):", err.message);
      console.log("Retrying in 5 seconds...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

runFullSync().catch(console.error);

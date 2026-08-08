import fs from "fs";
import { PrismaClient } from "@prisma/client";

// Load env
const env = fs.readFileSync(".env", "utf8");
env.split("\n").forEach(line => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const prisma = new PrismaClient();
const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

async function getCjToken() {
  const apiKey = process.env.CJ_API_KEY;
  const response = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const json = await response.json();
  if (!json.result) {
    throw new Error(`CJ API Auth Error: ${json.message}`);
  }
  return json.data.accessToken;
}

async function run() {
  try {
    console.log("Fetching access token...");
    const token = await getCjToken();
    
    console.log("Fetching CJ category tree...");
    const res = await fetch(`${CJ_API_URL}/product/getCategory`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
    });
    const json = await res.json();
    if (!json.result) throw new Error(json.message);
    
    let l1Count = 0;
    let l2Count = 0;
    let l3Count = 0;
    
    // Flat array to upsert
    const categoriesToInsert = [];
    const leafCategoryIds = new Set();
    
    json.data.forEach(l1 => {
      l1Count++;
      categoriesToInsert.push({
        id: l1.categoryFirstId,
        name: l1.categoryFirstName,
        parentId: null,
        parentName: null
      });
      
      if (l1.categoryFirstList && l1.categoryFirstList.length > 0) {
        l1.categoryFirstList.forEach(l2 => {
          l2Count++;
          categoriesToInsert.push({
            id: l2.categorySecondId,
            name: l2.categorySecondName,
            parentId: l1.categoryFirstId,
            parentName: l1.categoryFirstName
          });
          
          if (l2.categorySecondList && l2.categorySecondList.length > 0) {
            l2.categorySecondList.forEach(l3 => {
              l3Count++;
              categoriesToInsert.push({
                id: l3.categoryId,
                name: l3.categoryName,
                parentId: l2.categorySecondId,
                parentName: l2.categorySecondName
              });
              leafCategoryIds.add(l3.categoryId);
            });
          } else {
            // L2 is a leaf
            leafCategoryIds.add(l2.categorySecondId);
          }
        });
      } else {
        // L1 is a leaf
        leafCategoryIds.add(l1.categoryFirstId);
      }
    });
    
    console.log(`Parsed ${categoriesToInsert.length} categories.`);
    console.log(`Leaf categories identified: ${leafCategoryIds.size}`);
    
    // Upsert categories
    console.log("Upserting into Category table...");
    for (const cat of categoriesToInsert) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: {
          name: cat.name,
          parentId: cat.parentId,
          parentName: cat.parentName
        },
        create: {
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          parentName: cat.parentName
        }
      });
    }
    console.log("All categories upserted.");
    
    // Fetch existing SyncProgress rows
    const existingSyncProgress = await prisma.syncProgress.findMany({
      select: { categoryId: true }
    });
    const existingIds = new Set(existingSyncProgress.map(sp => sp.categoryId));
    
    // Create SyncProgress for missing leaf categories
    let syncProgressCreated = 0;
    for (const cat of categoriesToInsert) {
      if (leafCategoryIds.has(cat.id)) {
        if (!existingIds.has(cat.id)) {
          await prisma.syncProgress.create({
            data: {
              categoryId: cat.id,
              status: "PENDING",
              totalPages: 1, // Will be updated on first sync
              lastPageFetched: 0
            }
          });
          syncProgressCreated++;
        }
      }
    }
    
    console.log(`Successfully added ${syncProgressCreated} new categories to SyncProgress queue.`);
    
  } catch(e) {
    console.error("Error populating categories:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

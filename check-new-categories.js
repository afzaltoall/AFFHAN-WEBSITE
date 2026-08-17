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

async function getToken() {
  const res = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const json = await res.json();
  return json.data.accessToken;
}

async function run() {
  const token = await getToken();

  console.log("Fetching current CJ category tree...");
  const res = await fetch(`${CJ_API_URL}/product/getCategory`, {
    headers: { "CJ-Access-Token": token },
  });
  const json = await res.json();

  const leafCategories = [];
  json.data.forEach((l1) => {
    if (l1.categoryFirstList && l1.categoryFirstList.length > 0) {
      l1.categoryFirstList.forEach((l2) => {
        if (l2.categorySecondList && l2.categorySecondList.length > 0) {
          l2.categorySecondList.forEach((l3) => {
            leafCategories.push({ id: l3.categoryId, name: l3.categoryName });
          });
        } else {
          leafCategories.push({ id: l2.categorySecondId, name: l2.categorySecondName });
        }
      });
    } else {
      leafCategories.push({ id: l1.categoryFirstId, name: l1.categoryFirstName });
    }
  });

  console.log(`CJ currently has ${leafCategories.length} leaf categories.`);

  const existingIds = new Set(
    (await prisma.category.findMany({ select: { id: true } })).map((c) => c.id)
  );

  const newOnes = leafCategories.filter((c) => !existingIds.has(c.id));

  console.log(`\nCategories already in our DB: ${existingIds.size}`);
  console.log(`NEW categories not yet in our DB: ${newOnes.length}`);

  if (newOnes.length > 0) {
    console.log("\nNew category names:");
    newOnes.forEach((c) => console.log(`  - ${c.name} (${c.id})`));
  }

  await prisma.$disconnect();
}

run().catch(console.error);

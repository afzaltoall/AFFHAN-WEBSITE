import fs from "fs";

const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";
const CATEGORY_ID = "CB255FA6-9B4C-4542-82CC-F774DE8F8C68";

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

  console.log("=== V1 /product/list ===");
  const v1res = await fetch(
    `${CJ_API_URL}/product/list?categoryId=${CATEGORY_ID}&pageNum=1&pageSize=1`,
    { headers: { "CJ-Access-Token": token } }
  );
  const v1json = await v1res.json();
  console.log("V1 total:", v1json.data?.total);
  console.log("V1 sample product categoryId:", v1json.data?.list?.[0]?.categoryId);
  console.log("V1 sample product categoryName:", v1json.data?.list?.[0]?.categoryName);

  await new Promise((r) => setTimeout(r, 1200));

  console.log("\n=== V2 /product/listV2 ===");
  const v2res = await fetch(
    `${CJ_API_URL}/product/listV2?categoryId=${CATEGORY_ID}&page=1&size=1`,
    { headers: { "CJ-Access-Token": token } }
  );
  const v2json = await v2res.json();
  console.log("V2 totalRecords:", v2json.data?.totalRecords);
  console.log("Full V2 response:", JSON.stringify(v2json, null, 2));
}

run().catch(console.error);

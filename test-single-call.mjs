import fs from "fs";

const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

async function run() {
  console.log("Getting fresh token...");
  const authRes = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY }),
  });
  const authJson = await authRes.json();
  console.log("Auth result:", authJson.message);

  if (!authJson.result) {
    console.log("Auth failed, stopping.");
    return;
  }

  const token = authJson.data.accessToken;

  console.log("Waiting 5 seconds before single test call...");
  await new Promise((r) => setTimeout(r, 5000));

  console.log("Making ONE single product/list call...");
  const res = await fetch(
    `${CJ_API_URL}/product/list?categoryId=C992BFAB-12A9-4C61-A1DA-6E09C926BB81&pageNum=1&pageSize=1`,
    { headers: { "CJ-Access-Token": token } }
  );
  const json = await res.json();
  console.log("Result:", JSON.stringify(json, null, 2));
}

run().catch(console.error);

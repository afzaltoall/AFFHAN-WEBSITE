const fs = require('fs');
const key = fs.readFileSync('.env', 'utf8').match(/CJ_API_KEY="([^"]+)"/)[1];

fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({apiKey: key})
})
.then(r=>r.json())
.then(auth => {
  console.log("Auth Response:", auth.message || "OK");
  const token = auth.data.accessToken;

  // No categoryId — ask for the whole catalog, just 1 result per page,
  // we only care about the "total" count in the pagination response.
  return fetch('https://developers.cjdropshipping.com/api2.0/v1/product/list?pageNum=1&pageSize=1', {
    headers: {'CJ-Access-Token': token}
  });
})
.then(r=>r.json())
.then(data => {
  console.log("Full response:", JSON.stringify(data, null, 2));
  if (data.data) {
    console.log("\n=== TOTAL PRODUCTS IN CJ CATALOG:", data.data.total, "===");
  }
})
.catch(console.error);

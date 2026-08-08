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
  return fetch('https://developers.cjdropshipping.com/api2.0/v1/product/list?categoryId=95C53342-6277-4FEC-B450-6D3F9EEDD6A1&pageNum=1&pageSize=50', {
    headers: {'CJ-Access-Token': auth.data.accessToken}
  })
})
.then(r=>r.json())
.then(data => console.log("Category Fetch Response:", data))
.catch(console.error);

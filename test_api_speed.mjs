async function testEndpoint(url, label) {
  console.log(`\nTesting ${label} (${url}):`);
  for (let i = 1; i <= 5; i++) {
    const start = Date.now();
    try {
      const res = await fetch(url);
      await res.json();
      console.log(`Request ${i}: ${Date.now() - start}ms`);
    } catch (e) {
      console.log(`Request ${i}: Error - ${e.message}`);
    }
  }
}

async function run() {
  await testEndpoint('http://localhost:3001/api/products?limit=24', '/api/products');
  await testEndpoint('http://localhost:3001/api/categories', '/api/categories');
}

run();

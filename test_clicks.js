const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Capture all console logs and errors
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  console.log("Navigated to localhost:3000");

  // Wait for the All Categories button and click it
  try {
    console.log("Clicking All Categories button...");
    const allCategoriesSelector = 'button:has-text("All Categories")';
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find(b => b.innerText.includes('All Categories'));
      if (target) {
        target.click();
      } else {
        console.log("All Categories button not found");
      }
    });
    await new Promise(r => setTimeout(r, 1000));
    console.log("After clicking All Categories");
  } catch (e) {
    console.error("Failed to click All Categories", e);
  }

  // To test Avatar dropdown, we need to inject the auth cookie or fake it
  console.log("Injecting auth cookie to simulate logged-in user...");
  await page.setCookie({
    name: 'logistics_session',
    value: 'fake_token_for_testing',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });
  
  // But the UI needs the API to return the user. 
  // We can just manually find the button with the chevron and click it, 
  // but if the API isn't mocked, it might log us out.
  // Let's just see if there's any hydration errors or global errors first.

  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
  console.log("Done.");
})();

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Throttle CPU to simulate a slower device and make hydration delay visible
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  
  let paintTime = 0;
  let hydrateTime = 0;

  // Intercept console messages to detect React hydration if possible, 
  // or we can inject a script to listen for hydration.
  
  await page.evaluateOnNewDocument(() => {
    window.__TIME_START__ = performance.now();
    // We will consider it hydrated when the Navbar search form is interactive
    // Or we can just repeatedly poll for React to attach event listeners
  });

  const startTime = Date.now();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'domcontentloaded' });
  
  // Wait for the first paint
  const paintMetrics = await page.evaluate(() => {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        resolve(performance.now());
      });
    });
  });
  console.log(`Visually painted in: ${Date.now() - startTime}ms`);
  
  // Poll until the "All Categories" button has the event listener attached or reacts
  const hydrationDelay = await page.evaluate(async () => {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('All Categories'));
        if (btn) {
          // In React 18, event listeners are attached to the root, not the button.
          // But we can check if the JS bundle has executed by looking for a global variable or just
          // seeing if a specific state has been initialized.
          // A better way: check if Next.js hydration is done. Next.js sets `__NEXT_DATA__`.
          // But hydration finishes when React finishes rendering.
          
          // Let's just dispatch a click and see if the menu opens.
          btn.click();
          const menu = document.querySelector('.bg-white.rounded-2xl.shadow-xl'); // Mega menu
          if (menu) {
            clearInterval(interval);
            resolve(performance.now());
          } else {
             // Close it if it opened unexpectedly? Actually wait, it only opens if React handles it.
             // Wait, clicking it might do nothing if not hydrated.
          }
        }
      }, 100);
    });
  });
  
  console.log(`React Hydration & Interactivity complete in: ${hydrationDelay}ms relative to navigation start`);
  
  await browser.close();
})();

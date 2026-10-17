const { chromium } = require('playwright');

async function testAllRoutes() {
  console.log('[Browser Route Test] Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const routes = [
    { name: 'Customer View (Home)', url: 'http://localhost:3000/' },
    { name: 'Merchant Portal', url: 'http://localhost:3000/?role=merchant' },
    { name: 'Driver Portal', url: 'http://localhost:3000/?role=driver' },
    { name: 'Admin Portal', url: 'http://localhost:3000/?role=admin' },
    { name: 'Shop Admin Portal', url: 'http://localhost:3000/?page=shop-admin' },
    { name: 'Merchant Register Page', url: 'http://localhost:3000/?page=merchant-register' }
  ];

  let allPassed = true;

  for (const route of routes) {
    console.log(`\n--- Testing ${route.name} (${route.url}) ---`);
    const page = await browser.newPage();
    const pageErrors = [];

    page.on('pageerror', err => {
      pageErrors.push(err.message || String(err));
      console.error(`  [PageError]:`, err.message || err);
    });

    try {
      await page.goto(route.url, { waitUntil: 'networkidle', timeout: 10000 });
    } catch (e) {
      // ignore networkidle timeout if SSE/poll
    }

    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => {
      const loader = document.getElementById('tumpang-initial-loader');
      const root = document.getElementById('root');
      return {
        loaderRemoved: !loader,
        rootInnerLength: root ? root.innerHTML.length : 0,
        textSnippet: document.body.innerText.replace(/\s+/g, ' ').substring(0, 160)
      };
    });

    const routeOk = pageErrors.length === 0 && state.loaderRemoved && state.rootInnerLength > 100;
    console.log(`  State: loaderRemoved=${state.loaderRemoved}, htmlLength=${state.rootInnerLength}`);
    console.log(`  Preview text: "${state.textSnippet}..."`);
    console.log(`  Result: ${routeOk ? '✅ PASSED' : '❌ FAILED'}`);

    if (!routeOk) allPassed = false;
    await page.close();
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`ALL PORTALS BROWSER TEST: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
  console.log(`========================================`);
  process.exit(allPassed ? 0 : 1);
}

testAllRoutes().catch(err => {
  console.error('[Browser Fatal]:', err);
  process.exit(1);
});

const { chromium } = require('playwright');

async function dumpRequests(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = [];
  page.on('request', (req) => {
    requests.push(req.url());
  });

  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Simulate real user behavior: scroll down the page gradually
  console.log('Simulating scroll...');
  await page.mouse.move(200, 200);
  await page.mouse.move(400, 400);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(800);
  }

  await page.waitForTimeout(5000);

  console.log(`\nTotal requests captured: ${requests.length}`);
  console.log('\n--- Requests matching hotjar/rudder ---');
  const matches = requests.filter((u) => /hotjar|rudder/i.test(u));
  if (matches.length === 0) {
    console.log('None found.');
  } else {
    matches.forEach((u) => console.log(u));
  }

  // Also check: does this page detect us as headless?
  const webdriverFlag = await page.evaluate(() => navigator.webdriver);
  console.log(`\nnavigator.webdriver flag: ${webdriverFlag}`);

  await browser.close();
}

dumpRequests(process.argv[2]);

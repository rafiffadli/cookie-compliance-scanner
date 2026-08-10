const { chromium } = require('playwright');

async function inspect(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  console.log(`Navigating to ${url}...`);
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('HTTP status:', response ? response.status() : 'no response object');
  console.log('Final URL after navigation:', page.url());

  const title = await page.title();
  console.log('Page title:', title);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('Body text (first 300 chars):', bodyText);

  const cookies = await page.context().cookies();
  console.log('Cookies at this point:', cookies);

  await browser.close();
}

inspect(process.argv[2]);

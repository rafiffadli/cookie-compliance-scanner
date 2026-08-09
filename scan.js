const { chromium } = require('playwright');
const { buildTrackerLookup } = require('./trackerLookup.js');

const COMPLIANCE_RELEVANT_CATEGORIES = [
  'Analytics',
  'Advertising',
  'FingerprintingGeneral',
  'FingerprintingInvasive',
  'Social',
  'Cryptomining',
  'EmailAggressive',
];

const KNOWN_CMP_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '.cky-btn-accept',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '.osano-cm-accept-all',
  '#qc-cmp2-ui button[mode="primary"]',
  '.termly-accept-btn',
];

const ACCEPT_TEXT_PATTERNS = [
  /^accept all$/i,
  /^accept cookies$/i,
  /^accept$/i,
  /^i agree$/i,
  /^allow all$/i,
  /^got it$/i,
];

async function findConsentButton(page) {
  for (const selector of KNOWN_CMP_SELECTORS) {
    const el = await page.$(selector);
    if (el) {
      return { element: el, method: `known CMP selector (${selector})` };
    }
  }

  const candidates = await page.$$('button, a, [role="button"]');
  for (const el of candidates) {
    const text = (await el.textContent())?.trim() || '';
    if (ACCEPT_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      return { element: el, method: `text match ("${text}")` };
    }
  }

  return null;
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function classifyDomain(domain, lookup) {
  if (!domain) return null;
  if (lookup[domain]) return lookup[domain];
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (lookup[candidate]) return lookup[candidate];
  }
  return null;
}

function computeRiskLevel(findings, consentFound) {
  if (findings.length === 0) return 'none';
  if (!consentFound) return 'high';
  return 'medium';
}

async function scanPage(url) {
  const lookup = buildTrackerLookup();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = [];
  page.on('request', (req) => {
    requests.push({ url: req.url(), resourceType: req.resourceType(), timestamp: Date.now() });
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const cookiesBefore = await context.cookies();
  const requestsBefore = [...requests];

  const consentResult = await findConsentButton(page);
  let consentMechanism = { found: false, method: null };

  if (consentResult) {
    consentMechanism = { found: true, method: consentResult.method };
    await consentResult.element.click();
    await page.waitForTimeout(2000);
  }

  const cookiesAfter = await context.cookies();

  const newCookiesAfterConsent = cookiesAfter
    .filter((after) => !cookiesBefore.some((before) => before.name === after.name))
    .map((c) => c.name);

  const summary = {};
  requestsBefore.forEach((r) => {
    const domain = getDomain(r.url);
    const matches = classifyDomain(domain, lookup);
    if (!matches) return;
    matches.forEach((m) => {
      if (!COMPLIANCE_RELEVANT_CATEGORIES.includes(m.category)) return;
      const key = `${domain}|${m.category}|${m.company}`;
      if (!summary[key]) {
        summary[key] = {
          domain,
          company: m.company,
          category: m.category,
          requestCount: 0,
          firedBeforeConsent: true,
        };
      }
      summary[key].requestCount += 1;
    });
  });

  const findings = Object.values(summary);

  const result = {
    url,
    scannedAt: new Date().toISOString(),
    consentMechanism,
    findings,
    preConsentCookies: cookiesBefore.map((c) => c.name),
    newCookiesAfterConsent,
    summary: {
      totalFindings: findings.length,
      hasConsentMechanism: consentMechanism.found,
      riskLevel: computeRiskLevel(findings, consentMechanism.found),
    },
  };

  await browser.close();
  return result;
}

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.log('Usage: node scan.js <url>');
  process.exit(1);
}

scanPage(targetUrl)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error('Scan failed:', err.message);
    process.exit(1);
  });

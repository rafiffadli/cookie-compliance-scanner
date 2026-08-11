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

// Known CSS selectors for major commercial consent-management platforms (CMPs).
// NOTE: this cannot detect CMPs that render inside Shadow DOM or iframes
// (e.g. some Usercentrics/Sourcepoint/TrustArc setups) -- those require a
// different technical approach entirely, not just more selectors.
// NOTE: custom, in-house-built consent banners (e.g. BBC's own system) are
// never covered by this list -- there is no selector for bespoke code.
const KNOWN_CMP_SELECTORS = [
  '#onetrust-accept-btn-handler',               // OneTrust
  '.cky-btn-accept',                             // CookieYes
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '.CybotCookiebotDialogBodyButton',             // Cookiebot (alt)
  '.osano-cm-accept-all',                        // Osano
  '#qc-cmp2-ui button[mode="primary"]',          // Quantcast Choice
  '.termly-accept-btn',                          // Termly
  '#didomi-notice-agree-button',                 // Didomi
  '#truste-consent-button',                      // TrustArc
  '.iubenda-cs-accept-btn',                      // iubenda
  '.cmplz-btn.cmplz-accept',                     // Complianz
  '.cn-accept',                                  // Klaro
  '.cm-btn-success',                             // Klaro (alt)
  '#ccc-notify-accept',                          // Cookie Control (Civic UK)
  '.ccc-accept',                                 // Cookie Control (alt)
  '#cookiescript_accept',                        // CookieScript
  '.cc-btn.cc-allow',                            // Cookieconsent (Insites/vanilla)
  '#cookie-law-info-bar .cli_action_button',     // Cookie Law Info (WordPress)
];

const ACCEPT_TEXT_PATTERNS = [
  /^accept all$/i,
  /^accept all cookies$/i,
  /^accept cookies$/i,
  /^accept$/i,
  /^i agree$/i,
  /^agree$/i,
  /^allow all$/i,
  /^allow all cookies$/i,
  /^allow cookies$/i,
  /^got it$/i,
  /^i understand$/i,
  /^ok, got it$/i,
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

function computeRiskLevel(findings, consentFound, likelyBlocked) {
  if (likelyBlocked) return 'unknown';
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

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const httpStatus = response ? response.status() : null;
  const likelyBlocked = httpStatus === 403 || httpStatus === 429 || httpStatus === 503;
  await page.waitForTimeout(10000);

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

  const consentNote = consentMechanism.found
    ? null
    : 'No consent mechanism detected using known selectors or common text patterns. This may mean the site has no consent mechanism, OR that it uses an unrecognized custom banner. Manual verification recommended before treating this as a confirmed finding.';

  const result = {
    url,
    scannedAt: new Date().toISOString(),
    httpStatus,
    likelyBlocked,
    consentMechanism,
    consentNote,
    findings,
    allCookies: cookiesAfter.map(c => ({ name: c.name, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })),
    preConsentCookies: cookiesBefore.map((c) => c.name),
    newCookiesAfterConsent,
    summary: {
      totalFindings: findings.length,
      totalCookies: cookiesAfter.length,
      hasConsentMechanism: consentMechanism.found,
      riskLevel: computeRiskLevel(findings, consentMechanism.found, likelyBlocked),
    },
  };

  await browser.close();
  return result;
}

module.exports = { scanPage };

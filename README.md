# Cookie Compliance Scanner

Automated tool that detects trackers firing before a user gives cookie consent.

**Live demo:** https://cookiescanner.rafifmtt.my

## How it works

### 1. Page load and network capture

The scanner uses [Playwright](https://playwright.dev/) to load a target URL in a headless Chromium browser. Before navigation starts, it attaches a listener to every outgoing network request, recording the URL, resource type, and timestamp of each one as it fires.

### 2. Pre-consent snapshot

After the page loads (`domcontentloaded`, with a fixed wait afterward for async trackers to fire), the scanner takes two snapshots:
- Every cookie currently set (`context.cookies()`)
- Every network request captured so far

This is the "before consent" baseline — anything present here fired without the user taking any action.

### 3. Consent button detection

The scanner tries to find and click the site's cookie-consent "Accept" button, using two strategies in order:

- **Known selectors** — a list of documented CSS selectors from major consent-management platforms (OneTrust, Cookiebot, Osano, Quantcast, Termly). Tried first because these are unambiguous, low-risk matches.
- **Text-pattern fallback** — if no known selector matches, the scanner scans all visible buttons/links on the page and checks their text against common accept-button phrasing ("Accept", "Accept All", "I Agree", "Allow All", "Got It"). Used only as a fallback, since text matching carries more risk of clicking the wrong element.

If a button is found and clicked, the scanner waits again, then takes a second, "after consent" snapshot of cookies for comparison.

### 4. Tracker classification

Every domain seen in the pre-consent request list is checked against a flattened lookup table built from the [Disconnect.me tracker protection list](https://github.com/disconnectme/disconnect-tracking-protection) — an open-source dataset mapping known tracker domains to their owning company and category (Analytics, Advertising, Fingerprinting, Social, etc.).

- Domain matching checks the exact domain first, then walks up parent domains (e.g. `sub.hotjar.com` → `hotjar.com`) to catch trackers on subdomains.
- A domain can legitimately belong to multiple categories (e.g. Google's domains span Analytics, Email, and Fingerprinting) — the lookup stores all matches per domain rather than only the last one seen.
- Only categories considered compliance-relevant (Analytics, Advertising, Fingerprinting, Social, Cryptomining, Aggressive Email) are reported as findings. CDN/content-delivery categories are excluded, since serving a static asset from a shared domain is not a tracking violation.

### 5. Bot-detection / block handling

The scanner checks the HTTP status code of the page's main response. A 403, 429, or 503 status is flagged as a likely block (`likelyBlocked: true`) — common with sites behind bot-protection services like Cloudflare, which may serve a challenge page instead of the real site to automated browsers. When this happens, the risk level is reported as `"unknown"` rather than `"none"`, since a blocked scan cannot confirm a site is actually clean.

### 6. Risk scoring
if scan was likely blocked → "unknown"
else if no findings → "none"
else if no consent mechanism found → "high"
else → "medium"

### 7. Output

The scan produces a single structured JSON result containing: the target URL, scan timestamp, HTTP status, consent mechanism status, classified findings (domain, company, category, request count), pre- and post-consent cookie lists, and a computed risk summary.

This JSON is:
- Returned directly by the backend API (`POST /api/scan`)
- Rendered into the browser UI
- Exportable as CSV, JSON, or PDF from the frontend

## Architecture
public.html → fetch() → server.js (Express) → scanner.js (Playwright + classification)
↓
trackerLookup.js (Disconnect list parser)

- **`scanner.js`** — core scanning logic, exports `scanPage(url)`
- **`server.js`** — Express API wrapping `scanner.js`, exposes `POST /api/scan`
- **`trackerLookup.js`** — parses `trackers.json` (Disconnect list) into a flat domain → [company, category] lookup table
- **`public.html`** — frontend: URL input, results display, CSV/JSON/PDF export (via [jsPDF](https://github.com/parallax/jsPDF))
- **`scan.js`** — CLI entry point for running a scan directly from the terminal

## Running it locally

```bash
git clone https://github.com/rafiffadli/cookie-compliance-scanner.git
cd cookie-compliance-scanner
npm install
npx playwright install
curl -o trackers.json https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json

# Terminal 1: start the API
node server.js

# Then open the frontend
open public.html
```

Or run a scan directly from the CLI:

```bash
node scan.js https://example.com
```

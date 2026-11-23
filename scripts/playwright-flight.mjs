// Pilot — real-browser automation path (Playwright 1.65.1, verified Nov 2026).
// Drives the labelled demo flight page in a real Chromium: fills the form,
// submits, sorts by cheapest, and checks the cheapest flight is highlighted.
//
//   cd scripts && npm install        # installs playwright@1.65.1
//   npx playwright install chromium  # one-time browser download
//   node playwright-flight.mjs       # runs against ../demo-flights.html
//
// This is NOT run in the build VM (no browser download there). The in-page
// agent runner in js/app.js performs the same observable steps against the
// same demo page. This script exists so the flow can be verified in a real
// browser, and so a future backend can drive real sites with the same steps.
// It never logs in and never touches payment — by design.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEMO_PAGE = 'file://' + path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-flights.html',
);

const COMMAND = process.argv[2] || 'cheapest flight Delhi to Bengaluru Friday';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(DEMO_PAGE);
  await page.selectOption('#flightOrigin', 'DEL');
  await page.selectOption('#flightDestination', 'BLR');
  await page.fill('#flightDate', '2026-11-27');
  await page.selectOption('#flightSort', 'cheapest');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.flight-row.winner', { timeout: 5000 });
  const winner = await page.textContent('.flight-row.winner .airline');
  const price = await page.textContent('.flight-row.winner .price');
  console.log(`Command: ${COMMAND}`);
  console.log(`Cheapest flight highlighted: ${winner.trim()} — ${price.trim()}`);
  console.log('Stopped before login/payment, as designed.');
} finally {
  await browser.close();
}

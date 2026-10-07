// Run a snippet in the game page (headless Chrome, GPU) and print its result and any page errors.
// usage: node scripts/probe.mjs <url> <js-expression-or-async-body> [waitMs]
import puppeteer from 'puppeteer-core';
const [url, code, wait = '3000'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'], protocolTimeout: 60000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack ?? e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise((r) => setTimeout(r, Number(wait)));
  const result = await page.evaluate(`(async () => { ${code} })()`);
  console.log(JSON.stringify(result, null, 1));
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
}

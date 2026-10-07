// Plays each kitchen band live in headless Chrome for a few seconds and reports its output level
// (a quick smoke test of the real-time path; scripts/render-audio.mjs does the careful measuring).
// usage: node scripts/music-check.mjs [themes=0,1,2,...] [base=http://127.0.0.1:5180]
import puppeteer from 'puppeteer-core';
const themes = (process.argv[2] ?? '0,1,2,3,4,5,6,7').split(',');
const base = process.argv[3] ?? 'http://127.0.0.1:5180';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
for (const theme of themes) {
  const page = await browser.newPage();
  await page.goto(`${base}/review/music.html?theme=${theme}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'done', { timeout: 20000 });
  console.log('theme', theme, await page.evaluate(() => document.body.textContent));
  await page.close();
}
await browser.close();

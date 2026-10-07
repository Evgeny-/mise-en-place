// Dev check: real mouse input — tap a column, then the Undo button.
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:5180/?level=6&quiet';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], protocolTimeout: 60000,
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: false });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
const state = () => page.evaluate(() => ({ ptr: window.game.sim.ptr.join(','), moves: window.game.moves, dialogs: document.querySelectorAll('.dialog').length }));
console.log('start', await state());
const col = await page.evaluate(() => { const g = window.game; const c = g.sim.legalMoves()[0]; return g.view.columnAnchor(c); });
await page.mouse.click(col.x, col.y + 20);
await new Promise((r) => setTimeout(r, 900));
console.log('after tap', await state());
await page.screenshot({ path: (process.env.OUT ?? 'undo.png').replace('.png', '-before.png') });
const b = await page.evaluate(() => { const r = document.querySelector('.booster.b-undo').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const top = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? el.tagName + '.' + el.className : null; }, b);
console.log('element at undo', top);
await page.mouse.click(b.x, b.y);
await new Promise((r) => setTimeout(r, 900));
console.log('after undo click', await state());
await page.screenshot({ path: process.env.OUT ?? 'undo.png' });
if (errors.length) console.log('ERRORS', errors);
await browser.close();

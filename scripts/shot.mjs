// Screenshot a page in headless Chrome (WebGL via SwiftShader) after it has run for a while.
// usage: node scripts/shot.mjs <url> <out.png> [width,height] [waitMs] [dpr]
import puppeteer from 'puppeteer-core';

const [url, out, size = '390,844', wait = '3000', dpr = '2'] = process.argv.slice(2);
const [width, height] = size.split(',').map(Number);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  // The Mac's GPU through Metal: software WebGL is far too slow for the full scene.
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  protocolTimeout: 60000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: Number(dpr) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // SHOT_SCHEME=light|dark pins the colour scheme (night mode follows it on 'auto')
  if (process.env.SHOT_SCHEME) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SHOT_SCHEME }]);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  if (process.env.SHOT_DEBUG) console.log(await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c && c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'no webgl'; }));
  await new Promise((r) => setTimeout(r, Number(wait)));
  if (process.env.SHOT_FPS) {
    const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(Math.round(n / 1.5)); }; requestAnimationFrame(f); }));
    console.log('fps', fps);
  }
  await page.screenshot({ path: out });
  // SHOT_FRAMES=300,300,300 takes more screenshots that many ms apart: out-1.png, out-2.png…
  const frames = (process.env.SHOT_FRAMES ?? '').split(',').filter(Boolean).map(Number);
  for (let i = 0; i < frames.length; i++) {
    await new Promise((r) => setTimeout(r, frames[i]));
    await page.screenshot({ path: out.replace(/\.png$/, `-${i + 1}.png`) });
  }
  console.log('saved', out, frames.length ? `+${frames.length} frames` : '', errors.length ? `errors: ${errors.slice(0, 3).join(' | ')}` : '');
} finally {
  await browser.close();
}

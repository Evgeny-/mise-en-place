// Renders every sound effect and a 30 s excerpt of every kitchen band to WAV with the real engine
// (OfflineAudioContext in headless Chrome), and measures them.
//
//   node scripts/render-audio.mjs              all SFX + 30 s of each theme  → .cache/audio/*.wav, report.json
//   node scripts/render-audio.mjs --long 150   also measure 150 s of each theme (no WAV) for loudness
//   node scripts/render-audio.mjs --stems      per-instrument loudness of each band (balance check)
//   node scripts/render-audio.mjs --only bell,yum-cat --themes 0,2
//
// Starts its own Vite dev server (127.0.0.1:5185 or the next free port, no HMR), or pass --url http://host:port.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.cache/audio');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : (args[i + 1] ?? true);
};
const flag = (name) => args.includes(`--${name}`);
const only = opt('only', null)?.split(',');
const themesArg = opt('themes', null);
const long = Number(opt('long', 0));
const excerpt = Number(opt('seconds', 30));

let server = null;
let base = opt('url', null);
if (!base) {
  const { createServer } = await import('vite');
  // no HMR: other edits in the repo must not reload the page in the middle of a render
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5185, strictPort: false, hmr: false } });
  await server.listen();
  base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? 'http://127.0.0.1:5185';
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
  protocolTimeout: 600000,
});
// partial runs (--only, --themes, --stems) update their part of an existing report
const reportPath = join(outDir, 'report.json');
const report = { sfx: {}, music: {}, long: {}, stems: {}, ...(existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {}) };
const db = (v) => v.toFixed(1).padStart(6);
try {
  mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/review/audio.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.auditReady === true, { timeout: 60000 });
  const catalog = await page.evaluate(() => window.audit.catalog);
  const songs = await page.evaluate(() => window.audit.songs);

  if (!flag('stems') || flag('sfx')) {
    console.log('sound            len   peak    L50  momLUFS  maxStep  >4k%');
    for (let i = 0; i < catalog.length; i++) {
      if (only && !only.includes(catalog[i].label) && !only.includes(catalog[i].name)) continue;
      const r = await page.evaluate((k) => window.audit.sfx(k), i);
      writeFileSync(join(outDir, `${r.label}.wav`), Buffer.from(r.wav, 'base64'));
      report.sfx[r.label] = r.metrics;
      const m = r.metrics;
      console.log(`${r.label.padEnd(14)} ${m.seconds.toFixed(2).padStart(5)} ${db(m.peakDb)} ${db(m.l50Db)} ${db(m.momentaryMax)}   ${m.maxStep.toFixed(3)}  ${(m.highShare * 100).toFixed(1).padStart(5)}${m.clipped ? '  CLIP' : ''}`);
    }
  }

  const themes = themesArg ? themesArg.split(',').map(Number) : songs.map((_, i) => i);
  // the win jingle ends with the current kitchen's band: one preview per kitchen
  const winAt = catalog.findIndex((c) => c.label === 'win');
  if ((!flag('stems') || flag('sfx')) && (!only || only.includes('win'))) {
    for (const t of themes) {
      const r = await page.evaluate((k, th) => window.audit.sfx(k, { theme: th }), winAt, t);
      writeFileSync(join(outDir, `win-${songs[t].id}.wav`), Buffer.from(r.wav, 'base64'));
      report.sfx[`win-${songs[t].id}`] = r.metrics;
      console.log(`win-${songs[t].id}`.padEnd(14), r.metrics.seconds.toFixed(2).padStart(5), db(r.metrics.peakDb), db(r.metrics.l50Db), db(r.metrics.momentaryMax));
    }
  }
  if (!flag('stems') || flag('music')) {
    console.log(`\ntheme (first ${excerpt} s)   LUFS   momMax   peak   rms   render-ms`);
    for (const t of themes) {
      const r = await page.evaluate((k, s) => window.audit.music(k, s), t, excerpt);
      writeFileSync(join(outDir, `music-${t}-${songs[t].id}.wav`), Buffer.from(r.wav, 'base64'));
      report.music[songs[t].id] = r.metrics;
      const m = r.metrics;
      console.log(`${String(t).padStart(2)} ${songs[t].id.padEnd(12)} ${db(m.lufs)} ${db(m.momentaryMax)} ${db(m.peakDb)} ${db(m.rmsDb)}  ${Math.round(r.ms)}${m.clipped ? '  CLIP' : ''}`);
    }
  }

  if (long) {
    console.log(`\ntheme (${long} s, default volume)  LUFS  momMax  peak | at music volume 1: peak`);
    for (const t of themes) {
      const r = await page.evaluate((k, s) => window.audit.music(k, s, { wav: false }), t, long);
      const loud = await page.evaluate((k) => window.audit.music(k, 40, { wav: false, musicVolume: 1 }), t);
      report.long[songs[t].id] = { default: r.metrics, full: loud.metrics };
      console.log(`${String(t).padStart(2)} ${songs[t].id.padEnd(12)} ${db(r.metrics.lufs)} ${db(r.metrics.momentaryMax)} ${db(r.metrics.peakDb)} | ${db(loud.metrics.peakDb)}${loud.metrics.clipped ? ' CLIP' : ''}`);
    }
  }

  if (flag('stems')) {
    const groups = {
      trattoria: [['mandolin'], ['accordion'], ['guitar'], ['bass'], ['tambourine']],
      diner: [['steel'], ['piano'], ['oohs'], ['bass'], ['brush', 'brushTap', 'snap']],
      taqueria: [['requinto'], ['harp'], ['guitar'], ['guitarron'], ['shaker', 'clap']],
      bakery: [['musette'], ['gypsy'], ['bass'], ['brush']],
      wok: [['pipa'], ['erhu'], ['guzheng'], ['woodblock', 'tanggu', 'gong']],
      spice: [['oud'], ['ney'], ['qanun'], ['drone'], ['bass'], ['doum', 'tek', 'ka', 'tambourine']],
      cafeteria: [['flute'], ['rhodes'], ['guitar'], ['bass'], ['rim', 'shaker', 'kick']],
      dimsum: [['dizi'], ['guzheng'], ['sheng'], ['clapper', 'fingerCymbal']],
    };
    for (const t of themes) {
      const id = songs[t].id;
      const all = await page.evaluate((k) => window.audit.music(k, 90, { wav: false }), t);
      const line = [`${id.padEnd(10)} all ${all.metrics.lufs.toFixed(1)}`];
      report.stems[id] = { all: all.metrics.lufs };
      for (const g of groups[id] ?? []) {
        const r = await page.evaluate((k, solo) => window.audit.music(k, 90, { wav: false, solo }), t, g);
        report.stems[id][g.join('+')] = r.metrics.lufs;
        line.push(`${g.join('+')} ${r.metrics.lufs.toFixed(1)}`);
      }
      console.log(line.join(' | '));
    }
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 1));
  if (errors.length) console.log('\npage errors:', errors.slice(0, 5).join('\n'));
  console.log(`\nwrote ${outDir}`);
} finally {
  await browser.close();
  await server?.close();
}

// Audition page for the game's audio: every SFX, every kitchen band, a little in-context scene,
// and on-demand measurements. Also exposes `window.audit` for scripts/render-audio.mjs.
import { audio } from '../src/audio/audio';
import { measure, renderMusic, renderSfx, toWav, type Metrics } from '../src/audio/render';
import { GUEST_VOICES, sfxCatalog, type SfxName } from '../src/audio/sfx';
import { SONGS } from '../src/audio/songs';

const main = document.getElementById('main')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

let sfxVol = 0.8;
let musicVol = 0.5;
let muted = false;
const applyVolumes = () => {
  audio.setSfxVolume(muted ? 0 : sfxVol);
  audio.setMusicVolume(muted ? 0 : musicVol);
};
const unlock = () => {
  audio.unlock();
  applyVolumes();
};
window.addEventListener('pointerdown', unlock, { capture: true });

const muteBtn = document.getElementById('mute') as HTMLButtonElement;
muteBtn.onclick = () => {
  muted = !muted;
  muteBtn.classList.toggle('on', muted);
  muteBtn.textContent = muted ? 'Muted' : 'Mute';
  applyVolumes();
};
(document.getElementById('sfx') as HTMLInputElement).oninput = (e) => {
  sfxVol = Number((e.target as HTMLInputElement).value);
  applyVolumes();
};
(document.getElementById('music') as HTMLInputElement).oninput = (e) => {
  musicVol = Number((e.target as HTMLInputElement).value);
  applyVolumes();
};
const meter = document.querySelector('#meter i') as HTMLElement;
setInterval(() => {
  const { rms } = audio.level();
  meter.style.width = `${Math.min(100, Math.max(0, (20 * Math.log10(rms + 1e-6) + 50) * 2))}%`;
}, 80);

// ------------------------------------------------------------------ SFX

const GROUPS: [string, string, SfxName[]][] = [
  ['Menus', 'buttons, dialogs, the volume slider', ['button', 'tap', 'whoosh', 'invalid']],
  ['Cooking', 'taking from the pantry, landing, combining, lids', ['take', 'land', 'tile', 'plop', 'prep', 'fold', 'lid']],
  ['The pass and the guests', 'the service bell, bites, happy noises', ['bell', 'nom', 'yum']],
  ['Helpers', 'undo, hint, extra counter spot, stuck', ['undo', 'hint', 'booster', 'stuck']],
  ['Rewards', 'win (with the kitchen band’s flourish), stars, coins, unlocks', ['win', 'star', 'coin', 'unlock', 'pop', 'lose']],
];
const NOTES: Partial<Record<SfxName, string>> = {
  take: 'lift from the crate',
  land: 'onto the saucer',
  tile: 'level-start patter',
  plop: 'burger layer / taco filling',
  prep: 'sizzle + glass tings',
  fold: 'taco folds',
  lid: 'wooden crate lid',
  bell: 'desk bell on the pass',
  whoosh: 'dialog opens',
  invalid: 'can’t take that',
  booster: 'extra counter spot',
  win: 'cork, fizz, bell, band',
  lose: '(unused)',
  pop: '(spare)',
};
const catalog = sfxCatalog();
for (const [title, desc, names] of GROUPS) {
  main.append(el('h2', {}, title, el('small', { textContent: desc })));
  const grid = el('div', { className: 'grid' });
  for (const c of catalog.filter((c) => names.includes(c.name))) {
    const label = c.label.replace(/^(yum|nom)-/, '$1 · ');
    const b = el('button', {}, label, el('small', { textContent: c.label === c.name ? (NOTES[c.name] ?? '') : '' }));
    b.onclick = () => audio.play(c.name, c.opts);
    grid.append(b);
  }
  if (names.includes('land')) {
    const b = el('button', {}, 'land ×5 panned', el('small', { textContent: 'left to right' }));
    b.onclick = () => [-0.6, -0.3, 0, 0.3, 0.6].forEach((p, i) => setTimeout(() => audio.play('land', { pan: p }), i * 260));
    grid.append(b);
    const t = el('button', {}, 'tile patter', el('small', { textContent: 'a level starting' }));
    t.onclick = () => {
      for (let i = 0; i < 24; i++) setTimeout(() => audio.play('tile', { pan: ((i % 6) - 2.5) / 6, volume: 1 }), 30 + i * 55 + Math.random() * 30);
    };
    grid.append(t);
    const st = el('button', {}, 'stack a burger', el('small', { textContent: 'plop 1→5' }));
    st.onclick = () => [0, 1, 2, 3, 4].forEach((n, i) => setTimeout(() => audio.play('plop', { pitch: n }), i * 380));
    grid.append(st);
  }
  if (names.includes('star')) {
    const b = el('button', {}, '3 stars + coins', el('small', { textContent: 'the win dialog' }));
    b.onclick = () => {
      [0, 1, 2].forEach((i) => setTimeout(() => audio.play('star', { pitch: i }), 350 + i * 330));
      setTimeout(() => audio.play('coin'), 350 + 3 * 330 + 150);
    };
    grid.append(b);
  }
  main.append(grid);
}

// ------------------------------------------------------------------ a little scene

main.append(el('h2', {}, 'In context', el('small', { textContent: 'a few moves of a level over the current music' })));
const scene = el('div', { className: 'grid' });
const sceneBtn = el('button', {}, 'Play a few moves', el('small', { textContent: 'take, land, prep, serve, eat' }));
sceneBtn.onclick = () => {
  const guest = GUEST_VOICES[Math.floor(Math.random() * GUEST_VOICES.length)];
  const steps: [number, () => void][] = [
    [0, () => audio.play('take')], [380, () => audio.play('land', { pan: -0.3 })],
    [1300, () => audio.play('take')], [1680, () => audio.play('land', { pan: 0.1 })], [1900, () => audio.play('prep', { pitch: 0 })],
    [3100, () => audio.play('take')], [3480, () => audio.play('land', { pan: 0.35 })],
    [4300, () => audio.play('invalid')],
    [5200, () => audio.play('take')], [5580, () => audio.play('land', { pan: -0.1 })], [5800, () => audio.play('prep', { pitch: 1 })],
    [6500, () => audio.play('bell')],
    ...[0, 1, 2, 3].map((k): [number, () => void] => [7300 + k * 260, () => audio.play('nom', { voice: guest })]),
    [8500, () => audio.play('yum', { voice: guest })],
  ];
  for (const [t, f] of steps) setTimeout(f, t);
};
scene.append(sceneBtn);
const winBtn = el('button', {}, 'Win the level', el('small', { textContent: 'duck + win + stars + coins' }));
winBtn.onclick = () => {
  audio.duck(0.25, 2.5);
  audio.play('win');
  const t0 = 1800;
  [0, 1, 2].forEach((i) => setTimeout(() => audio.play('star', { pitch: i }), t0 + 350 + i * 330));
  setTimeout(() => audio.play('coin'), t0 + 350 + 3 * 330 + 150);
};
scene.append(winBtn);
main.append(scene);

// ------------------------------------------------------------------ music

const DESC: Record<string, string> = {
  trattoria: 'F major waltz · mandolin tremolo, accordion oom-pah, guitar, bass',
  diner: 'Bb 12/8 doo-wop ballad · lap steel, triplet piano, "ooh" singers, brushes, snaps',
  taqueria: 'D major 6/8 son · requinto in thirds, harp, strummed guitar, guitarrón, shaker, palmas',
  bakery: 'G major swing musette · accordion musette, gypsy guitar pompe, walking bass',
  wok: 'D pentatonic · pipa, erhu, guzheng, woodblock and drum',
  spice: 'D hijaz maqsum · oud, ney, qanun, harmonium drone, darbuka',
  cafeteria: 'C major bossa · flute, electric piano, nylon guitar, cross-stick, shaker',
  dimsum: 'G pentatonic teahouse · dizi, guzheng, sheng, wooden clapper',
};
main.append(el('h2', {}, 'Kitchen bands', el('small', { textContent: 'one per world; the form loops with variations (pass counter below)' })));
const themes = el('div', { className: 'themes' });
const playBtns: HTMLButtonElement[] = [];
const nows: HTMLElement[] = [];
SONGS.forEach((s, i) => {
  const play = el('button', {}, 'Play');
  const stop = el('button', {}, 'Stop');
  const now = el('div', { className: 'now' });
  play.onclick = () => {
    unlock();
    audio.startMusic(i);
    playBtns.forEach((b, j) => b.classList.toggle('on', j === i));
  };
  stop.onclick = () => {
    audio.stopMusic(0.8);
    playBtns.forEach((b) => b.classList.remove('on'));
  };
  playBtns.push(play);
  nows.push(now);
  themes.append(el('div', { className: 'theme' }, el('b', { textContent: `${i} · ${s.name}` }), el('div', { className: 'desc', textContent: DESC[s.id] ?? '' }), el('div', { className: 'row' }, play, stop), now));
});
main.append(themes);
setInterval(() => {
  const info = audio.musicInfo();
  nows.forEach((n, i) => {
    n.textContent = info && info.theme === i ? `${info.sec} · bar ${info.bar + 1} · pass ${info.pass + 1} · loop ${info.cycle + 1}` : '';
  });
}, 200);

// ------------------------------------------------------------------ measurements

main.append(el('h2', {}, 'Measurements', el('small', { textContent: 'offline renders at the default volumes' })));
const measureRow = el('div', { className: 'grid' });
const out = el('div', { className: 'wrap' });
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const table = (rows: [string, Metrics][]) => {
  const t = el('table');
  t.append(el('tr', {}, ...['sound', 'len s', 'peak dBFS', 'L50 dBFS', 'momentary LUFS', 'integrated LUFS', 'DC', 'max step', '>4 kHz %'].map((h) => el('th', { textContent: h }))));
  for (const [name, m] of rows) {
    t.append(el('tr', {}, el('td', { textContent: name }), el('td', { textContent: fmt(m.seconds, 2) }), el('td', { textContent: fmt(m.peakDb), className: m.peakDb > -1 ? 'warn' : '' }), el('td', { textContent: fmt(m.l50Db) }), el('td', { textContent: fmt(m.momentaryMax) }), el('td', { textContent: fmt(m.lufs) }), el('td', { textContent: m.dc.toExponential(1) }), el('td', { textContent: fmt(m.maxStep, 3) }), el('td', { textContent: fmt(m.highShare * 100) })));
  }
  return t;
};
const mSfx = el('button', {}, 'Measure all SFX');
mSfx.onclick = async () => {
  mSfx.disabled = true;
  const rows: [string, Metrics][] = [];
  for (const c of catalog) rows.push([c.label, measure(await renderSfx(c.name, c.opts))]);
  out.replaceChildren(table(rows));
  mSfx.disabled = false;
};
const mMus = el('button', {}, 'Measure all music (60 s each)');
mMus.onclick = async () => {
  mMus.disabled = true;
  const rows: [string, Metrics][] = [];
  for (let i = 0; i < SONGS.length; i++) rows.push([SONGS[i].id, measure(await renderMusic(i, 60))]);
  out.replaceChildren(table(rows));
  mMus.disabled = false;
};
measureRow.append(mSfx, mMus);
main.append(measureRow, out);

// ------------------------------------------------------------------ API for scripts/render-audio.mjs

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Object.assign(window, {
  audit: {
    catalog,
    songs: SONGS.map((s) => ({ id: s.id, name: s.name })),
    async sfx(i: number, o: { sfxVolume?: number; theme?: number } = {}) {
      const c = catalog[i];
      const buf = await renderSfx(c.name, c.opts, o);
      return { label: c.label, metrics: measure(buf), wav: b64(toWav(buf)) };
    },
    async music(theme: number, seconds: number, o: { musicVolume?: number; solo?: string[]; wav?: boolean; seed?: number } = {}) {
      const t0 = performance.now();
      const buf = await renderMusic(theme, seconds, o);
      const ms = performance.now() - t0;
      return { metrics: measure(buf), ms, wav: o.wav === false ? null : b64(toWav(buf)) };
    },
  },
});
document.title = 'Kitchen Sounds';
(window as unknown as { auditReady: boolean }).auditReady = true;

/**
 * Offline rendering and measurement for the audition page (review/audio.html) and
 * scripts/render-audio.mjs: render a sound or a stretch of a kitchen's music through the real
 * engine graph into an OfflineAudioContext, measure it, and encode WAV.
 */
import { AudioEngine, type PlayOpts } from './audio';
import type { SfxName } from './sfx';

export const RENDER_RATE = 48000;

export interface RenderOpts {
  sfxVolume?: number;
  musicVolume?: number;
  /** kitchen whose band plays the win flourish */
  theme?: number;
}

/** Render one sound effect through the full chain (SFX bus, master, compressor). */
export async function renderSfx(name: SfxName, opts: PlayOpts = {}, o: RenderOpts = {}): Promise<AudioBuffer> {
  const sec = name === 'win' ? 5 : name === 'bell' || name === 'unlock' || name === 'lose' || name === 'star' ? 3.5 : 2;
  const ctx = new OfflineAudioContext(2, Math.ceil(RENDER_RATE * sec), RENDER_RATE);
  const eng = new AudioEngine();
  eng.attach(ctx);
  eng.setSfxVolume(o.sfxVolume ?? 0.8);
  eng.setMusicVolume(o.musicVolume ?? 0.5);
  if (name === 'win') {
    // the flourish follows the kitchen whose music was last asked for
    eng.startMusicAt(o.theme ?? 0, 100);
  }
  eng.playAt(name, 0.03, opts);
  return trim(await ctx.startRendering());
}

/** Render `seconds` of a kitchen's music (from the start) at the given music volume. */
export async function renderMusic(theme: number, seconds: number, o: RenderOpts & { seed?: number; solo?: string[] } = {}): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(RENDER_RATE * seconds), RENDER_RATE);
  const eng = new AudioEngine();
  eng.attach(ctx);
  eng.setSfxVolume(o.sfxVolume ?? 0.8);
  eng.setMusicVolume(o.musicVolume ?? 0.5);
  eng.startMusicAt(theme, 0.05, { seed: o.seed ?? 1234 + theme, solo: o.solo });
  eng.pumpMusic(seconds);
  return ctx.startRendering();
}

/** Drop trailing silence (below -80 dBFS), keeping 50 ms. */
function trim(b: AudioBuffer): AudioBuffer {
  let end = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = d.length - 1; i > end; i--) if (Math.abs(d[i]) > 1e-4) {
      end = i;
      break;
    }
  }
  const len = Math.min(b.length, end + Math.round(0.05 * b.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, len), numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
  for (let ch = 0; ch < b.numberOfChannels; ch++) out.getChannelData(ch).set(b.getChannelData(ch).subarray(0, len));
  return out;
}

// ------------------------------------------------------------------ measurement

export interface Metrics {
  seconds: number;
  /** sample peak, dBFS */
  peakDb: number;
  /** samples at or above full scale */
  clipped: number;
  /** whole-file RMS, dBFS */
  rmsDb: number;
  /** loudest 50 ms RMS, dBFS (how loud a short sound feels) */
  l50Db: number;
  /** integrated loudness (BS.1770, gated), LUFS */
  lufs: number;
  /** loudest momentary (400 ms) loudness, LUFS */
  momentaryMax: number;
  /** largest DC offset over 100 ms windows */
  dc: number;
  /** largest sample-to-sample jump (clicks show up here) */
  maxStep: number;
  /** spectral balance: share of energy above 4 kHz (harshness) and below 200 Hz */
  highShare: number;
  lowShare: number;
}

const dbOf = (v: number) => (v > 0 ? 20 * Math.log10(v) : -120);

/** K-weighting (BS.1770) at 48 kHz, in place. */
function kWeight(x: Float32Array): Float32Array {
  const stages = [
    [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585],
    [1, -2, 1, -1.99004745483398, 0.99007225036621],
  ];
  const y = Float32Array.from(x);
  for (const [b0, b1, b2, a1, a2] of stages) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
  }
  return y;
}

/** One-pole split for a rough spectral balance. */
function bandShare(x: Float32Array, sr: number, f: number, high: boolean): number {
  const a = Math.exp((-2 * Math.PI * f) / sr);
  let z = 0, eb = 0, et = 0;
  for (let i = 0; i < x.length; i++) {
    z = x[i] * (1 - a) + z * a;
    const part = high ? x[i] - z : z;
    eb += part * part;
    et += x[i] * x[i];
  }
  return et > 0 ? eb / et : 0;
}

export function measure(b: AudioBuffer): Metrics {
  const sr = b.sampleRate;
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  let peak = 0, clipped = 0, sum = 0, maxStep = 0, dc = 0;
  for (const d of chans) {
    let prev = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += v * v;
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
    }
    const w = Math.round(0.1 * sr);
    for (let i = 0; i + w <= d.length; i += w) {
      let m = 0;
      for (let j = 0; j < w; j++) m += d[i + j];
      dc = Math.max(dc, Math.abs(m / w));
    }
  }
  const n = b.length;
  // loudest 50 ms
  const w50 = Math.round(0.05 * sr);
  let l50 = 0;
  for (let i = 0; i + w50 <= n; i += w50 >> 1) {
    let e = 0;
    for (const d of chans) for (let j = 0; j < w50; j++) e += d[i + j] * d[i + j];
    l50 = Math.max(l50, e / (w50 * chans.length));
  }
  // BS.1770: 400 ms blocks, 75 % overlap, absolute and relative gates
  const kw = chans.map(kWeight);
  const block = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const z: number[] = [];
  for (let i = 0; i + block <= n; i += hop) {
    let e = 0;
    for (const d of kw) {
      let s = 0;
      for (let j = 0; j < block; j++) s += d[i + j] * d[i + j];
      e += s / block;
    }
    z.push(e);
  }
  if (!z.length) {
    let e = 0;
    for (const d of kw) {
      let s = 0;
      for (let j = 0; j < n; j++) s += d[j] * d[j];
      e += s / n;
    }
    z.push(e);
  }
  const L = (e: number) => -0.691 + 10 * Math.log10(Math.max(e, 1e-12));
  const abs = z.filter((e) => L(e) > -70);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((e) => L(e) > rel);
  const mono = new Float32Array(n);
  for (const d of chans) for (let i = 0; i < n; i++) mono[i] += d[i] / chans.length;
  return {
    seconds: n / sr,
    peakDb: dbOf(peak),
    clipped,
    rmsDb: dbOf(Math.sqrt(sum / (n * chans.length))),
    l50Db: dbOf(Math.sqrt(l50)),
    lufs: gated.length ? L(mean(gated)) : -120,
    momentaryMax: L(Math.max(...z)),
    dc,
    maxStep,
    highShare: bandShare(mono, sr, 4000, true),
    lowShare: bandShare(mono, sr, 200, false),
  };
}

// ------------------------------------------------------------------ WAV

/** 16-bit PCM WAV with TPDF dither. */
export function toWav(b: AudioBuffer): ArrayBuffer {
  const ch = b.numberOfChannels;
  const n = b.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = data[c][i] * 32767 + (Math.random() - Math.random());
      v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(s))), true);
      o += 2;
    }
  }
  return buf;
}

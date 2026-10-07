/**
 * Mise en Place audio: kitchen foley and the kitchens' house bands, all synthesized in the browser.
 *
 * - SFX (sfx.ts) are physically-inspired foley baked once into small stereo buffers (a few variants
 *   each, in idle time), then played with a little pitch/level wobble so repeats never sound canned.
 * - Music (songs.ts) is one band per kitchen, scheduled bar by bar (song.ts) with baked plucked
 *   strings and percussion plus a few live oscillator voices (band.ts).
 * - Graph: SFX bus and music bus (ducked for big moments, with its own room reverb) into a gentle
 *   master compressor. The engine can also be attached to an OfflineAudioContext for renders.
 */
import { Band, Resources } from './band';
import { Rng } from './dsp';
import { bakeSfx, GUEST_VOICES, RATE, sfxKey, VARIANTS, type SfxName, type SfxParams } from './sfx';
import { Song } from './song';
import { SONGS } from './songs';

export type { SfxName } from './sfx';

export interface PlayOpts {
  /** sound-specific: pitch step (land, plop, prep, star) */
  pitch?: number;
  volume?: number;
  /** -1..1 */
  pan?: number;
  /** a guest kind for `yum` / `nom` (bear, cat, fox, bunny, panda, frog, pig, raccoon) */
  voice?: string;
}

export interface Audio {
  unlock(): void;
  play(name: SfxName, opts?: PlayOpts): void;
  startMusic(theme: number): void;
  stopMusic(fadeSec?: number): void;
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  duck(amount: number, sec: number): void;
  /** RMS and peak of the output right now (0..1) */
  level(): { rms: number; peak: number };
  readonly ready: boolean;
}

/** Music bus gain at music volume 1 (calibrated against the SFX, see docs/audio.md). */
const MUSIC_GAIN = 1.32;
/** The win flourish relative to the SFX bus. */
const TAG_GAIN = 0.55;
/** Pitch wobble per play (fraction): noisy foley can vary more than tuned glass and bells. */
const WOBBLE: Partial<Record<SfxName, number>> = { bell: 0.002, star: 0.003, prep: 0.004, hint: 0.004, unlock: 0.003, win: 0, lose: 0.003, yum: 0.015, coin: 0.01, stuck: 0.005 };

/** What to bake right after unlock (the most frequent sounds first). */
const PREWARM: [SfxName, SfxParams][] = [
  ['take', {}], ['land', {}], ['button', {}], ['tile', {}], ['plop', { pitch: 0 }], ['plop', { pitch: 1 }], ['plop', { pitch: 2 }],
  ['prep', { pitch: 0 }], ['prep', { pitch: 1 }], ['bell', {}], ['invalid', {}], ['undo', {}], ['whoosh', {}], ['lid', {}], ['fold', {}],
  ...GUEST_VOICES.flatMap((v): [SfxName, SfxParams][] => [['nom', { voice: v }], ['yum', { voice: v }]]),
  ['hint', {}], ['booster', {}], ['star', { pitch: 0 }], ['star', { pitch: 1 }], ['star', { pitch: 2 }], ['coin', {}], ['win', {}], ['unlock', {}],
  ['stuck', {}], ['tap', {}], ['plop', { pitch: 3 }], ['plop', { pitch: 4 }], ['prep', { pitch: 2 }],
];

const db = (d: number) => Math.pow(10, d / 20);

/** The limiter's curve covers ±HEADROOM of input. */
const HEADROOM = 2;
let clipCurve: Float32Array<ArrayBuffer> | null = null;
function softClip(): Float32Array<ArrayBuffer> {
  if (clipCurve) return clipCurve;
  const n = 4097;
  const knee = 0.708;
  clipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * HEADROOM;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    clipCurve[i] = (Math.sign(x) * y) / HEADROOM;
  }
  return clipCurve;
}
const mod = (n: number, m: number) => ((n % m) + m) % m;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class AudioEngine implements Audio {
  ctx: BaseAudioContext | null = null;
  res: Resources | null = null;
  private live: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private musicReverb: ConvolverNode | null = null;
  private sfxReverb: ConvolverNode | null = null;
  private sfxCache = new Map<string, AudioBuffer[]>();
  private pending = new Set<string>();
  private lastVariant = new Map<string, number>();
  private last = new Map<SfxName, number>();
  private sfxVol = 0.8;
  private musicVol = 0.5;
  private wantTheme: number | null = null;
  private song: Song | null = null;
  private songOut: GainNode | null = null;
  private songTheme = -1;
  private lastTheme = 0;
  private timer = 0;
  private suspendedByHide = false;
  private rnd = new Rng((Date.now() & 0xffff) + 1);
  private queue: (() => void)[] = [];
  private idle = false;

  get ready(): boolean {
    return !!this.live && this.live.state === 'running';
  }

  unlock(): void {
    try {
      if (!this.live) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        this.live = ctx;
        this.attach(ctx, ctx.destination);
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            if (ctx.state === 'running') {
              this.suspendedByHide = true;
              void ctx.suspend();
            }
          } else if (this.suspendedByHide) {
            this.suspendedByHide = false;
            void ctx.resume();
          }
        });
        for (const [n, p] of PREWARM) this.enqueue(() => this.variant(n, p, 0));
      }
      if (this.live.state === 'suspended' && !document.hidden) void this.live.resume();
      if (this.wantTheme !== null && !this.song) this.startMusic(this.wantTheme);
    } catch {
      /* no audio */
    }
  }

  /** Build the graph on a context (the live one, or an OfflineAudioContext for renders). */
  attach(ctx: BaseAudioContext, out: AudioNode = ctx.destination): void {
    this.ctx = ctx;
    this.res = new Resources(ctx);
    // Safety limiter: exactly linear up to -3 dBFS, then a soft knee. Levels are calibrated so it
    // only ever catches stacked peaks (unlike DynamicsCompressor, it adds no makeup gain).
    const pre = ctx.createGain();
    pre.gain.value = 1 / HEADROOM;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip();
    shaper.oversample = 'none';
    const post = ctx.createGain();
    post.gain.value = HEADROOM;
    pre.connect(shaper);
    shaper.connect(post);
    post.connect(out);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    post.connect(this.analyser);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(pre);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * MUSIC_GAIN;
    this.musicBus.connect(this.duckGain);
    // one warm room per bus, so music and SFX volumes stay independent
    const ir = this.impulse(ctx);
    const room = (bus: GainNode) => {
      const c = ctx.createConvolver();
      c.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.6;
      c.connect(wet);
      wet.connect(bus);
      return c;
    };
    this.musicReverb = room(this.musicBus);
    this.sfxReverb = room(this.sfxBus);
  }

  /** A small warm room: a few early reflections and a tail that darkens as it fades (RT60 ≈ 1 s). */
  private impulse(ctx: BaseAudioContext): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.1);
    const buf = ctx.createBuffer(2, len, sr);
    const r = new Rng(7);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const a = Math.min(0.93, 0.15 + t * 0.75);
        lp = lp * a + r.bi() * (1 - a);
        const env = Math.exp(-t * 6) * Math.min(1, t / 0.008) * (1 - i / len);
        d[i] = lp * env * (1 + a * 3);
      }
      for (const [ms, g] of [[9, 0.35], [14, 0.25], [21, 0.22], [29, 0.16], [41, 0.12]]) {
        const k = Math.round(((ms + ch * 1.9) * sr) / 1000);
        d[k] += g * (r.next() < 0.5 ? -1 : 1);
      }
    }
    return buf;
  }

  level(): { rms: number; peak: number } {
    const a = this.analyser;
    if (!a) return { rms: 0, peak: 0 };
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    let peak = 0;
    for (const v of buf) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / buf.length), peak };
  }

  setSfxVolume(v: number): void {
    this.sfxVol = v;
    this.fadeVolume(this.sfxBus, v);
  }

  setMusicVolume(v: number): void {
    this.musicVol = v;
    this.fadeVolume(this.musicBus, v * MUSIC_GAIN);
  }

  private fadeVolume(bus: GainNode | null, volume: number): void {
    if (!bus || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = bus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    // a short finite ramp avoids clicks and reaches exact silence at zero
    gain.linearRampToValueAtTime(volume, now + 0.02);
  }

  duck(amount: number, sec: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.duckGain) return;
    const g = this.duckGain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(amount, t + 0.15);
    g.setValueAtTime(amount, t + sec);
    g.linearRampToValueAtTime(1, t + sec + 1.2);
  }

  // ---------------------------------------------------------------- music

  startMusic(theme: number): void {
    this.wantTheme = theme;
    if (!this.ctx || !this.musicBus) return;
    if (this.song && this.songTheme === theme) return;
    this.startMusicAt(theme, this.ctx.currentTime + 0.15);
  }

  /**
   * Start a kitchen's band at context time `t`. `solo` keeps only the listed instrument channels
   * (for stem analysis). Live contexts are pumped by a timer; offline renders call `pumpMusic`.
   */
  startMusicAt(theme: number, t: number, o: { seed?: number; solo?: string[] } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.res) return;
    this.fadeOutSong(1.5);
    const def = SONGS[mod(theme, SONGS.length)];
    this.songTheme = theme;
    this.lastTheme = theme;
    const out = ctx.createGain();
    const level = db(def.trim);
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(level, t + 0.5);
    out.connect(this.musicBus);
    const seed = o.seed ?? (this.rnd.next() * 1e9) | 0;
    const trims: Partial<Record<string, number>> = { ...def.mix };
    const band = new Band(this.res, out, this.musicReverb, trims, seed, o.solo);
    this.song = new Song(def, band, t, seed);
    this.songOut = out;
    if (ctx === this.live) {
      this.timer = window.setInterval(() => this.pumpMusic(), 100);
      this.pumpMusic();
      // bake the notes this band will need in idle time, so the music never hitches mid-level
      for (const key of Song.preview(def)) this.enqueue(() => this.res?.warm(key));
    }
  }

  /** Schedule music up to `until` (default: a little ahead of now). */
  pumpMusic(until?: number): void {
    if (!this.song || !this.ctx) return;
    this.song.pump(until ?? this.ctx.currentTime + 0.6);
  }

  private fadeOutSong(fade: number): void {
    const song = this.song;
    const out = this.songOut;
    clearInterval(this.timer);
    this.song = null;
    this.songOut = null;
    this.songTheme = -1;
    if (!song || !out || !this.ctx) return;
    const now = this.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + fade);
    if (this.ctx === this.live) {
      // notes already scheduled run up to a bar ahead; let them die out silently, then let go
      setTimeout(() => {
        song.band.dispose();
        out.disconnect();
      }, (fade + 4.5) * 1000);
    }
  }

  stopMusic(fadeSec = 1): void {
    this.wantTheme = null;
    this.fadeOutSong(fadeSec);
  }

  /** What the band is playing (audition page). */
  musicInfo(): { theme: number; name: string; sec: string; bar: number; pass: number; cycle: number } | null {
    if (!this.song) return null;
    return { theme: this.songTheme, name: this.song.def.name, ...this.song.now };
  }

  // ---------------------------------------------------------------- sfx

  play(name: SfxName, opts: PlayOpts = {}): void {
    const ctx = this.live;
    if (!ctx || ctx.state !== 'running' || this.sfxVol <= 0.001) return;
    const now = ctx.currentTime;
    const gap = RATE[name];
    if (gap && now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    try {
      this.playAt(name, now + 0.005, opts);
    } catch {
      /* never break the game because of audio */
    }
  }

  /** Play a sound at context time `t` (also used by offline renders). */
  playAt(name: SfxName, t: number, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const buf = this.buffer(name, opts);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const w = WOBBLE[name] ?? 0.025;
    src.playbackRate.value = 1 + (this.rnd.next() - 0.5) * 2 * w;
    const g = ctx.createGain();
    g.gain.value = (opts.volume ?? 1) * (1 + (this.rnd.next() - 0.5) * 0.12);
    src.connect(g);
    let node: AudioNode = g;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    src.start(t);
    if (name === 'win') this.flourish(t + 0.5, opts.volume ?? 1);
  }

  /** The current kitchen's band plays a little flourish for the win (on the SFX bus). */
  private flourish(t: number, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.res || !this.sfxBus) return;
    const theme = this.songTheme >= 0 ? this.songTheme : (this.wantTheme ?? this.lastTheme);
    const def = SONGS[mod(theme, SONGS.length)];
    const out = ctx.createGain();
    out.gain.value = db(def.trim) * TAG_GAIN * volume;
    out.connect(this.sfxBus);
    const seed = (this.rnd.next() * 1e9) | 0;
    const band = new Band(this.res, out, this.sfxReverb, { ...def.mix }, seed);
    def.tag(band, t, new Rng(seed));
    if (ctx === this.live) {
      setTimeout(() => {
        band.dispose();
        out.disconnect();
      }, (t - ctx.currentTime + 4) * 1000);
    }
  }

  /** A baked take of the sound: a random one of its variants, never the same twice in a row. */
  private buffer(name: SfxName, p: SfxParams): AudioBuffer {
    const key = sfxKey(name, p);
    const list = this.sfxCache.get(key);
    if (!list || !list.length) return this.variant(name, p, 0);
    const want = VARIANTS[name] ?? 3;
    if (list.length < want && this.ctx === this.live) {
      const v = list.length;
      const job = `${key}#${v}`;
      if (!this.pending.has(job)) {
        this.pending.add(job);
        this.enqueue(() => {
          this.pending.delete(job);
          this.variant(name, p, v);
        });
      }
    }
    let i = this.rnd.int(list.length);
    if (list.length > 1 && i === this.lastVariant.get(key)) i = (i + 1) % list.length;
    this.lastVariant.set(key, i);
    return list[i];
  }

  /** Bake variant `v` of a sound if it is not there yet. */
  private variant(name: SfxName, p: SfxParams, v: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = sfxKey(name, p);
    let list = this.sfxCache.get(key);
    if (!list) this.sfxCache.set(key, (list = []));
    if (list[v]) return list[v];
    const sr = Math.min(48000, ctx.sampleRate);
    const b = bakeSfx(name, p, sr, hash(key) + v * 7919);
    const buf = ctx.createBuffer(2, b.L.length, sr);
    buf.getChannelData(0).set(b.L);
    buf.getChannelData(1).set(b.R);
    list[v] = buf;
    return buf;
  }

  // ---------------------------------------------------------------- idle-time work

  private enqueue(job: () => void): void {
    this.queue.push(job);
    this.kick();
  }

  private kick(): void {
    if (this.idle || !this.queue.length || typeof window === 'undefined') return;
    this.idle = true;
    const ric = (window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = (d?: { timeRemaining(): number }) => {
      this.idle = false;
      const t0 = performance.now();
      do {
        try {
          this.queue.shift()?.();
        } catch {
          /* skip */
        }
      } while (this.queue.length && (d ? d.timeRemaining() > 6 : performance.now() - t0 < 6));
      this.kick();
    };
    if (ric) ric(run, { timeout: 2000 });
    else setTimeout(() => run(), 40);
  }
}

export const audio = new AudioEngine();

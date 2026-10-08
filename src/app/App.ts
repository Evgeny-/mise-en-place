import { GameView, QUEUE_SPACE } from '../render/GameView';
import { Game, type InvalidReason } from '../game/Game';
import { themeForWorld } from '../render/themes';
import { loadFonts } from '../render/textures';
import { icons } from '../render/icons';
import { audio } from '../audio/audio';
import { h, button } from '../ui/dom';
import { glyph } from '../ui/glyphs';
import { bootScreen } from '../ui/loading';
import { Hud, dockIcon, type DockButton, type DockState } from '../ui/Hud';
import { Tickets } from '../ui/Tickets';
import { MapScreen } from '../ui/MapScreen';
import { CookbookScreen, dishArt } from '../ui/CookbookScreen';
import { openDecorShop } from '../ui/DecorShop';
import { openDialog, initDialogs, toast, closeAllDialogs, dialogOpen, type DialogButton } from '../ui/dialogs';
import { t, loc, setLang, getLang, type Lang } from './i18n';
import { loadSave, writeSave, resetSave, BOOSTERS, type BoosterId, type SaveData } from './save';
import { loadCampaign, getLevel, prefetch, getDaily, dayKey } from './levels';
import { BOOSTER_GIFT, BOOSTER_PRICE, BOOSTER_UNLOCK, UNDO_FREE, UNDO_PRICE, coinsFor, type Reward } from './rewards';
import { DISHES, FOODS, MENUS, levelRecipes, type DishId } from '../core/content';
import type { LevelDef } from '../core/types';
import { campaignLevel } from '../core/shifts';
import type { SimEvent } from '../core/sim';

/** A callback that runs only the first time: a dialog's action button and its ✕ share one ending. */
function once(f: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    f();
  };
}

/** Intro-card pictures of the pantry mechanics: a cloche over a plate, an ice block with its countdown. */
const MECH_ART = {
  cloche: `<svg width="110" height="96" viewBox="0 0 110 96" aria-hidden="true"><ellipse cx="55" cy="84" rx="48" ry="9" fill="#e9e1d3"/><ellipse cx="55" cy="81" rx="42" ry="6" fill="#fffaf0"/><path d="M14 80a41 41 0 0 1 82 0Z" fill="#c9ced3"/><path d="M22 78a33 33 0 0 1 30-32" fill="none" stroke="#f4f6f8" stroke-width="6" stroke-linecap="round"/><circle cx="55" cy="35" r="7" fill="#aeb4ba"/><text x="58" y="72" font-family="Nunito, sans-serif" font-weight="900" font-size="30" fill="#7c848c" text-anchor="middle">?</text></svg>`,
  oven: `<svg width="110" height="100" viewBox="0 0 110 100" aria-hidden="true"><rect x="10" y="22" width="90" height="70" rx="12" fill="#3f3a3a"/><rect x="20" y="34" width="70" height="44" rx="8" fill="#ffb347"/><rect x="24" y="38" width="62" height="36" rx="6" fill="#ff7a2f"/><circle cx="24" cy="15" r="6" fill="#8d8585"/><circle cx="44" cy="15" r="6" fill="#8d8585"/><circle cx="82" cy="52" r="16" fill="#c2410c" stroke="#fff" stroke-width="3"/><text x="82" y="60" font-family="Nunito, sans-serif" font-weight="900" font-size="22" fill="#fff" text-anchor="middle">2</text></svg>`,
  grill: `<svg width="110" height="100" viewBox="0 0 110 100" aria-hidden="true"><ellipse cx="50" cy="66" rx="42" ry="20" fill="#2f2a2a"/><ellipse cx="50" cy="62" rx="36" ry="15" fill="#ff7a2f"/><ellipse cx="50" cy="56" rx="26" ry="11" fill="#6b3b26"/><path d="M30 54h40M33 59h34" stroke="#3d1f12" stroke-width="3" stroke-linecap="round"/><path d="M38 30c-4-6 4-8 0-14M50 30c-4-6 4-8 0-14M62 30c-4-6 4-8 0-14" stroke="#cfd6dc" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="88" cy="30" r="16" fill="#c2410c" stroke="#fff" stroke-width="3"/><text x="88" y="38" font-family="Nunito, sans-serif" font-weight="900" font-size="22" fill="#fff" text-anchor="middle">2</text></svg>`,
  set: `<svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true"><rect x="8" y="60" width="104" height="22" rx="8" fill="#d63b3b"/><rect x="18" y="64" width="84" height="14" rx="6" fill="#fff4e2"/><ellipse cx="38" cy="58" rx="24" ry="9" fill="#f6f1e7" stroke="#c9bfae" stroke-width="2"/><path d="M24 54c4-12 24-12 28 0z" fill="#f0c45a"/><circle cx="38" cy="47" r="6" fill="#cf3227"/><ellipse cx="84" cy="58" rx="22" ry="8" fill="#f6f1e7" stroke="#c9bfae" stroke-width="2"/><rect x="70" y="40" width="28" height="16" rx="4" fill="#f6e7c4"/><rect x="70" y="40" width="28" height="5" rx="2" fill="#6b4027"/><text x="61" y="30" font-family="Nunito, sans-serif" font-weight="900" font-size="26" fill="#8a5a3c" text-anchor="middle">+</text></svg>`,
  vip: `<svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="#f5b301" stroke="#fff" stroke-width="5"/><path d="M50 22l8.5 17.5 19.3 2.6-14 13.6 3.4 19.1L50 65.6l-17.2 9.2 3.4-19.1-14-13.6 19.3-2.6z" fill="#fff"/></svg>`,
  frozen: `<svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="14" width="76" height="74" rx="14" fill="#bfe6f5" stroke="#8fcbe0" stroke-width="4"/><path d="M22 26l14 0M22 34l8 0" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M70 88v6M58 88v4" stroke="#8fcbe0" stroke-width="4" stroke-linecap="round"/><text x="52" y="72" font-family="Nunito, sans-serif" font-weight="900" font-size="46" fill="#2f6f8f" text-anchor="middle">3</text></svg>`,
};

export class App {
  private save: SaveData = loadSave();
  private levels: LevelDef[] = [];
  private stage = document.getElementById('stage')!;
  private ui = document.getElementById('ui')!;
  private view: GameView | null = null;
  private game: Game | null = null;
  private hud: Hud | null = null;
  private tickets: Tickets | null = null;
  private map!: MapScreen;
  private cookbook!: CookbookScreen;
  private raf = 0;
  private last = 0;
  private tutorial = 0;
  private darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  private deadShown = false;
  /** free undos left on this level (debug: unlimited) */
  private undoLeft = UNDO_FREE;
  /** dev: the level's difficulty numbers for the debug line */
  private debugStats = '';
  /** dishes served for the first time during this level (shown on the win card) */
  private newDishes: DishId[] = [];
  /** the level being played is today's daily special */
  private dailyRun = false;
  /** ?slow=0.2 slows every animation down (reviewing frames) */
  private slow = Math.max(0.02, Math.min(1, Number(new URLSearchParams(location.search).get('slow')) || 1));

  private isNight(): boolean {
    const mode = this.save.settings.night ?? 'auto';
    return mode === 'on' || (mode === 'auto' && !!this.darkQuery?.matches);
  }

  private applyNight(): void {
    const on = this.isNight();
    document.documentElement.classList.toggle('night', on);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#1d1a2e' : '#f3dcb8');
    this.view?.setNight(on);
  }

  async init(): Promise<void> {
    this.applyNight();
    this.darkQuery?.addEventListener('change', () => this.applyNight());
    setLang(this.save.settings.lang ?? getLang());
    const loading = bootScreen(t('title'), t('loading'));
    initDialogs(this.ui);
    await loadFonts();
    this.levels = await loadCampaign();
    audio.setMusicVolume(this.save.settings.music);
    audio.setSfxVolume(this.save.settings.sfx);

    this.map = new MapScreen(this.ui, {
      onPlay: (n) => void this.play(n),
      onSettings: () => this.openSettings(),
      onCookbook: () => this.openCookbook(),
      onDaily: () => void this.playDaily(),
      onShop: () => openDecorShop(this.save, () => this.showMap(), this.ui),
    });
    this.cookbook = new CookbookScreen(this.ui, () => {
      this.cookbook.hide();
      this.showMap();
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.game && !dialogOpen()) this.openPause();
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && this.game && !dialogOpen()) this.onDock('undo');
      // 1–9 take from that column (desktop)
      const d = Number(e.key);
      if (d >= 1 && d <= (this.game?.sim.columns.length ?? 0) && !e.metaKey && !e.ctrlKey && this.game && !dialogOpen() && !this.game.paused) {
        this.game.take(d - 1);
      }
    });
    this.stage.addEventListener('pointerdown', (e) => this.onStageTap(e));
    this.stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !this.game || dialogOpen()) return;
      const r = this.stage.getBoundingClientRect();
      const col = this.game.view.pickColumn(e.clientX - r.left, e.clientY - r.top);
      this.stage.style.cursor = col !== null && this.game.sim.canTake(col) ? 'pointer' : '';
    });

    // Dev helpers: ?reset, ?level=N, ?debug=1, ?coins=K, ?boosters=K, ?progress=N, ?demo
    const q = new URLSearchParams(location.search);
    if (q.has('reset')) this.save = resetSave();
    if (q.has('debug')) this.save.settings.debug = q.get('debug') !== '0';
    const kb = Number(q.get('boosters'));
    if (kb > 0) for (const b of BOOSTERS) this.save.boosters[b] = kb;
    const kc = Number(q.get('coins'));
    if (kc > 0) this.save.coins = kc;
    // ?looks=polka,gold,wood tries decor without buying it
    const lk = q.get('looks')?.split(',');
    if (lk?.[0]) this.save.looks.cloth = lk[0];
    if (lk?.[1]) this.save.looks.plate = lk[1];
    if (lk?.[2]) this.save.looks.tile = lk[2];
    const prog = Number(q.get('progress'));
    if (prog > 1) {
      for (let n = 1; n < prog; n++) this.save.stars[n] = this.save.stars[n] ?? (n % 4 === 0 ? 2 : 3);
      this.save.level = Math.max(this.save.level, prog);
    }
    writeSave(this.save);
    if (q.has('demo')) this.startDemo();
    // ?burger and ?taco open the first level of those kitchens
    const jump = q.has('burger') ? campaignLevel(1, 1) : q.has('taco') ? campaignLevel(2, 1) : Number(q.get('level'));
    if (q.has('daily')) {
      this.markSeen('tutorial');
      void this.playDaily();
    } else if (jump > 0) {
      this.save.level = Math.max(this.save.level, jump);
      if (jump > 1) this.markSeen('tutorial');
      void this.play(jump);
    } else {
      this.showMap();
      if (q.has('shop')) openDecorShop(this.save, () => this.showMap(), this.ui);
    }
    setTimeout(() => {
      loading.classList.add('out');
      setTimeout(() => loading.remove(), 450);
    }, 150);
  }

  // ------------------------------------------------------------------ screens

  private showMap(): void {
    this.stopLoop();
    this.game?.dispose();
    this.game = null;
    this.hud?.destroy();
    this.hud = null;
    this.tickets?.destroy();
    this.tickets = null;
    this.stage.style.visibility = 'hidden';
    this.map.show({
      dailyDone: this.save.daily.day === dayKey(),
      unlocked: this.save.level,
      stars: this.save.stars,
      coins: this.save.coins,
      total: this.levels.length,
      debug: this.save.settings.debug,
      level: (n) => this.levels[n - 1] ?? null,
    });
    audio.startMusic(themeForWorld(this.levels[this.save.level - 1]?.world ?? 0).music);
  }

  private openCookbook(): void {
    this.map.hide();
    this.cookbook.show(this.save.cookbook);
  }

  private ensureView(): GameView {
    if (this.view) this.view.looks = this.save.looks;
    if (!this.view) {
      this.view = new GameView(this.stage);
      this.view.looks = this.save.looks;
      this.view.setNight(this.isNight());
      this.view.resize(window.innerWidth, window.innerHeight);
    }
    return this.view;
  }

  /** Wait for a level, saying so if it takes a moment (generated levels). */
  private async waitFor(p: Promise<LevelDef | null>): Promise<LevelDef | null> {
    const slow = setTimeout(() => toast(this.ui, t('loading'), 4000), 200);
    try {
      return await p;
    } finally {
      clearTimeout(slow);
    }
  }

  async play(n: number): Promise<void> {
    closeAllDialogs();
    const level = await this.waitFor(getLevel(this.levels, n));
    if (!level) return this.showMap();
    this.dailyRun = false;
    this.startLevel(level);
    prefetch(this.levels, n + 1);
  }

  /** Today's special: a generated level, the same for everyone today. */
  async playDaily(): Promise<void> {
    closeAllDialogs();
    const level = await this.waitFor(getDaily(this.levels));
    if (!level) return this.showMap();
    this.dailyRun = true;
    this.startLevel(level);
  }

  private startLevel(level: LevelDef): void {
    this.map.hide();
    this.game?.dispose();
    this.hud?.destroy();
    this.tickets?.destroy();
    const view = this.ensureView();
    this.stage.style.visibility = 'visible';
    // dev: ?theme=2 previews another kitchen's look
    const forced = new URLSearchParams(location.search).get('theme');
    const theme = themeForWorld(forced !== null ? Number(forced) : level.world);
    this.hud = new Hud(this.ui, {
      onPause: () => this.openPause(),
      onHome: () => this.confirmLeave(),
      onDock: (b) => this.onDock(b),
    });
    this.hud.setLevel(level.n, level.tier, loc(theme.name), theme.id);
    if (this.dailyRun) this.hud.setTitle(t('daily'));
    this.hud.setFed(0, level.orders.length);
    this.tickets = new Tickets(this.ui, (d) => this.openRecipes(d));
    const ins = this.hud.insets();
    view.insets = { top: ins.top, bottom: ins.bottom };
    this.hud.observe(() => this.onResize());
    this.deadShown = false;
    this.undoLeft = UNDO_FREE;
    this.newDishes = [];
    this.game = new Game(view, level, theme, {
      onWin: (g) => this.onWin(g),
      onStuck: () => this.onStuck(),
      onChange: (g, ev) => this.onChange(g, ev),
      onInvalid: (_g, why, col) => this.onInvalid(why, col),
    });
    view.resize(window.innerWidth, window.innerHeight);
    this.tickets.reset(this.game.sim);
    this.refreshDock();
    this.debugStats = '';
    if (this.save.settings.debug) void this.measureForDebug(level);
    audio.startMusic(theme.music);
    if (level.tier !== 'normal') {
      setTimeout(() => {
        this.hud?.banner(t(level.tier === 'superhard' ? 'superhardLevel' : 'hardLevel'), level.tier);
        audio.play('unlock', { volume: 0.6 });
      }, 400);
    }
    if (import.meta.env.DEV) Object.assign(window, { app: this, game: this.game });
    // One-time cards, one after another: a new dish or rule, then new helpers.
    const cards: ((next: () => void) => void)[] = [];
    const intro = level.intro;
    const tutorialLevel = level.n === 1 && !this.save.seen.includes('tutorial');
    // the first level teaches by doing: no card, the tutorial bubbles explain spaghetti
    if (intro && tutorialLevel) this.markSeen('intro:' + intro);
    else if (intro && !this.save.seen.includes('intro:' + intro)) cards.push((next) => this.introCard(intro, next));
    for (const b of BOOSTERS) if (level.n >= BOOSTER_UNLOCK[b] && !this.save.seen.includes('booster:' + b)) cards.push((next) => this.introBooster(b, next));
    const run = (i: number) => {
      if (i < cards.length) cards[i](() => setTimeout(() => run(i + 1), 250));
    };
    if (cards.length) setTimeout(() => run(0), 500);
    // Dev: ?moves=1,1,2 plays those columns (1-based) after the level opens; ?quiet skips the cards.
    const q = new URLSearchParams(location.search);
    if (q.has('quiet')) cards.length = 0;
    const scripted = (q.get('moves') ?? '').split(',').filter(Boolean).map((x) => Number(x) - 1);
    if (scripted.length && this.game) {
      const g = this.game;
      scripted.forEach((c, i) => setTimeout(() => this.game === g && g.take(c), 900 + i * Number(q.get('gap') ?? 700)));
    }
    this.tutorial = level.n === 1 && !this.save.seen.includes('tutorial') ? 1 : 0;
    if (this.tutorial) setTimeout(() => this.showTutorialStep(), 900);
    this.startLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000) * this.slow;
      this.view?.observeFrame(now - this.last, now, !this.game || this.game.paused || document.hidden);
      this.last = now;
      if (this.game) {
        this.game.update(dt);
        this.placeTickets();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private placeTickets(): void {
    const v = this.view;
    if (!v || !this.tickets || !this.hud) return;
    const top = this.hud.insets().top;
    this.tickets.place((s) => v.seatAnchor(s), top + 2, v.wide, top + QUEUE_SPACE);
  }

  private onResize(): void {
    if (this.view && this.hud) {
      const ins = this.hud.insets();
      this.view.insets = { top: ins.top, bottom: ins.bottom };
      this.view.resize(window.innerWidth, window.innerHeight);
      this.view.refit();
    }
    if (this.map.visible) this.map.render();
  }

  private onStageTap(e: PointerEvent): void {
    if (!this.game || dialogOpen()) return;
    const r = this.stage.getBoundingClientRect();
    this.game.tap(e.clientX - r.left, e.clientY - r.top);
  }

  /** dev: the level's difficulty numbers, measured on the spot when the level has none stored. */
  private async measureForDebug(level: LevelDef): Promise<void> {
    let st = level.stats;
    if (!st) {
      try {
        st = (await import('../core/measure')).measureDepth(level, { runs: 16 })?.stats;
      } catch {
        /* too big to measure here */
      }
    }
    if (this.game?.level !== level) return;
    const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 0)}%`;
    const plan = st?.plan ? ` · plan ${st.plan.map((x) => Math.round(x * 100)).join('/')} (depth ${st.depth ?? '?'})` : '';
    const mech = [
      level.cloches?.length ? `cloches ${level.cloches.length}${st?.guesses ? ` (${st.guesses} guess!)` : ''}` : '',
      level.frozen?.length ? `ice ${level.frozen.length}` : '',
    ].filter(Boolean).join(' · ');
    this.debugStats = st
      ? `${level.tier}${plan} · forced ${st.forced ?? '?'} · deep ${st.deep ?? '?'} · random ${pct(st.random)} · critical ${st.critical}/${st.decisions}${mech ? ' · ' + mech : ''}`
      : `${level.tier} · can't be won!`;
    this.updateDebug();
  }

  /** dev: the stats plus whether the kitchen can still be won from the current position. */
  private updateDebug(): void {
    const g = this.game;
    if (!g || !this.hud || !this.save.settings.debug) return;
    let now: string;
    if (g.status === 'won') now = 'won';
    else {
      const safe = g.safeMoves();
      if (safe === null) now = 'now: too big to tell';
      else if (safe.length) now = `now ✓ ${safe.length}/${g.sim.legalMoves().length} moves safe`;
      else {
        const hint = g.hint();
        now = `now ✗ lost${hint.kind === 'dead' ? ` · undo ${hint.back}` : ''}`;
      }
    }
    this.hud.setDebug([this.debugStats || 'measuring…', now].join(' · '));
  }

  private onChange(g: Game, events: SimEvent[] | null): void {
    this.tickets?.update(g.sim, true);
    this.updateDebug();
    if (events && this.tutorial) {
      this.tutorial++;
      // let the item land before the next bubble
      setTimeout(() => this.showTutorialStep(), 450);
    }
    const served = g.sim.served;
    if (events?.some((e) => e.t === 'serve')) setTimeout(() => this.game === g && this.hud?.setFed(served, g.level.orders.length), 900);
    else this.hud?.setFed(served, g.level.orders.length);
    if (events) {
      let fresh = false;
      for (const e of events) {
        if (e.t === 'serve' && !this.save.cookbook.includes(e.dish)) {
          this.save.cookbook.push(e.dish);
          this.newDishes.push(e.dish);
          fresh = true;
        }
      }
      if (fresh) writeSave(this.save);
    }
    this.refreshDock();
    // Early levels gently say when the kitchen can no longer be finished.
    if (events && g.status === 'playing' && g.level.n <= 12 && !this.deadShown && g.winnable() === false) {
      this.deadShown = true;
      setTimeout(() => {
        if (this.game === g && g.status === 'playing') {
          toast(this.ui, t('deadKitchen'), 2600);
          this.refreshDock(true);
        }
      }, 1300);
    }
  }

  private onInvalid(why: InvalidReason, col: number): void {
    const g = this.game;
    if (!g) return;
    const lidLeft = (g.level.lids?.[col] ?? 0) - g.sim.served;
    const text = {
      full: t('counterFull'),
      lid: t('lidClosed', { n: lidLeft }),
      frozen: t('frozenTile', { n: g.sim.thawLeft(col, g.sim.ptr[col]) }),
      empty: t('emptyColumn'),
      fit: t('tacoNoFit'),
      topping: t('toppingLast'),
    }[why];
    toast(this.ui, text, 1700);
  }

  /** Level 1 walks through three taps: take, sauce makes itself, the guest is served. */
  private showTutorialStep(): void {
    const g = this.game;
    const hud = this.hud;
    if (!g || !hud) return;
    // above the helper dock, clear of the tickets and the pantry
    const y = window.innerHeight - hud.insets().bottom - 74;
    const step = this.tutorial;
    if (step <= 3) {
      const text = t(step === 1 ? 'tut1' : step === 2 ? 'tut2' : 'tut3');
      // point at the column the stored solution takes next (still winnable: every order wins here)
      const legal = g.sim.legalMoves();
      const planned = g.level.solution?.[g.moves];
      const col = planned !== undefined && legal.includes(planned) ? planned : legal[0];
      hud.showTutorial(text, y, col !== undefined ? g.view.columnAnchor(col) : undefined);
    } else {
      hud.hideTutorial();
      this.tutorial = 0;
      this.markSeen('tutorial');
    }
  }

  private markSeen(key: string): void {
    if (!this.save.seen.includes(key)) {
      this.save.seen.push(key);
      writeSave(this.save);
    }
  }

  // ------------------------------------------------------------------ dock

  private refreshDock(deadGlow = false): void {
    const g = this.game;
    const n = g?.level.n ?? 1;
    const state = {} as Record<DockButton, DockState>;
    state.undo = { count: this.save.settings.debug ? null : this.undoLeft, locked: false, unlockAt: 1, usable: !!g?.canUndo(), glow: deadGlow };
    for (const b of BOOSTERS) {
      state[b] = { count: this.save.boosters[b], locked: n < BOOSTER_UNLOCK[b] && !this.save.settings.debug, unlockAt: BOOSTER_UNLOCK[b], usable: !!g && g.status !== 'won' };
    }
    state.recipes = { count: null, locked: false, unlockAt: 1, usable: true };
    this.hud?.setDock(state);
  }

  private onDock(b: DockButton): void {
    const g = this.game;
    if (!g) return;
    if (b === 'recipes') return this.openRecipes(null);
    if (b === 'undo') {
      if (!g.canUndo()) {
        audio.play('invalid');
        return;
      }
      if (this.undoLeft <= 0 && !this.save.settings.debug) return this.offerUndo(() => this.undoOne());
      this.spendUndo();
      this.undoOne();
      return;
    }
    if (g.level.n < BOOSTER_UNLOCK[b] && !this.save.settings.debug) {
      audio.play('invalid');
      toast(this.ui, t('locked', { n: BOOSTER_UNLOCK[b] }));
      return;
    }
    if (this.save.boosters[b] <= 0) return this.openShop(b);
    this.useBooster(b);
  }

  private undoOne(): void {
    if (this.game?.undo()) this.deadShown = false;
    this.refreshDock();
  }

  /** Uses a free undo (debug: free); false if none are left. */
  private spendUndo(): boolean {
    if (this.save.settings.debug) return true;
    if (this.undoLeft <= 0) return false;
    this.undoLeft--;
    return true;
  }

  /** Out of free undos: one more for coins, then `then`. */
  private offerUndo(then: () => void): void {
    const g = this.game;
    if (g) g.paused = true;
    const resume = once(() => {
      if (g) g.paused = false;
    });
    openDialog({
      title: t('undoOutTitle'),
      head: 'purple',
      body: [h('div', { class: 'mech-art', html: glyph('undo', 84) }), t('undoOut'), h('p', { class: 'subtle', html: `${glyph('coin', 20)} ${this.save.coins}` })],
      buttons: [
        {
          label: `${t('buy')} <span class="price">${glyph('coin', 26)} ${UNDO_PRICE}</span>`,
          cls: 'green',
          onClick: () => {
            if (this.save.coins < UNDO_PRICE) {
              audio.play('invalid');
              toast(this.ui, t('notEnough'));
              return false;
            }
            this.save.coins -= UNDO_PRICE;
            writeSave(this.save);
            audio.play('coin');
            resume();
            then();
            return true;
          },
        },
      ],
      onClose: resume,
    });
  }

  /** Rewind `n` moves (stuck card, dead kitchen): one undo, or coins when the free ones are gone. */
  private rewind(n: number): void {
    const g = this.game;
    if (!g) return;
    const go = () => {
      g.undoMany(n);
      this.deadShown = false;
      this.refreshDock();
    };
    if (this.spendUndo()) go();
    else setTimeout(() => this.offerUndo(go), 200);
  }

  /** Label of a rewind button: the free undos left, or the price. */
  private rewindLabel(n: number): string {
    const text = n === 1 ? t('undoBackOne') : t('undoBack', { n });
    const tag = this.save.settings.debug ? '' : this.undoLeft > 0 ? ` <span class="price">×${this.undoLeft}</span>` : ` <span class="price">${glyph('coin', 24)} ${UNDO_PRICE}</span>`;
    return `${glyph('undo', 22)} ${text}${tag}`;
  }

  private useBooster(b: BoosterId): void {
    const g = this.game;
    if (!g) return;
    if (b === 'slot') {
      g.addSlot();
      audio.play('booster');
    } else {
      const r = g.hint();
      audio.play('hint');
      if (r.kind === 'safe') {
        g.showHint(r.col);
        toast(this.ui, t('hintSafe'), 1400);
      } else if (r.kind === 'dead') {
        openDialog({
          title: t('deadKitchen'),
          head: 'purple',
          body: [h('div', { class: 'mech-art', html: glyph('pot', 84) })],
          buttons: [
            { label: this.rewindLabel(r.back), cls: 'green', onClick: () => this.rewind(r.back) },
            { label: t('close'), cls: 'white small', onClick: () => undefined },
          ],
        });
      } else {
        toast(this.ui, t('deadKitchen'), 2000);
        return;
      }
    }
    g.boostersUsed++;
    this.save.boosters[b]--;
    writeSave(this.save);
    this.refreshDock();
  }

  private openShop(b: BoosterId): void {
    const g = this.game;
    if (g) g.paused = true;
    const price = BOOSTER_PRICE[b];
    openDialog({
      title: t(`booster_${b}`),
      head: 'purple',
      body: [h('div', { class: 'mech-art', html: dockIcon(b, 84) }), t(`boosterDesc_${b}`), h('p', { class: 'subtle', html: `${glyph('coin', 20)} ${this.save.coins}` })],
      buttons: [
        {
          label: `${t('buy')} <span class="price">${glyph('coin', 26)} ${price}</span>`,
          cls: 'green',
          onClick: () => {
            if (this.save.coins < price) {
              audio.play('invalid');
              toast(this.ui, t('notEnough'));
              return false;
            }
            this.save.coins -= price;
            this.save.boosters[b]++;
            writeSave(this.save);
            audio.play('coin');
            if (g) g.paused = false;
            this.useBooster(b);
            return true;
          },
        },
      ],
      onClose: () => {
        if (g) g.paused = false;
      },
    });
  }

  // ------------------------------------------------------------------ recipes

  /** The recipe card: how preps happen and what each dish needs (optionally one dish). */
  private openRecipes(focus: DishId | null): void {
    const g = this.game;
    if (g) g.paused = true;
    const resume = once(() => {
      if (g) g.paused = false;
    });
    const menu = MENUS[g?.level.menu ?? 'trattoria'];
    // this level's dishes and every prep its pantry can make (traps included), not the whole menu
    const { preps: menuPreps, dishes: menuDishes } = g ? levelRecipes(menu, g.level.orders, g.level.columns.flat()) : menu;
    const img = (src: string, cls = 'ri') => h('img', { class: cls, attrs: { src, alt: '', draggable: 'false' } });
    const plus = () => h('span', { class: 'rop', text: '+' });
    const eq = () => h('span', { class: 'rop', text: '=' });
    const preps = h('div', { class: 'recipe-list' });
    for (const p of menuPreps) {
      preps.append(h('div', { class: 'recipe-row' }, img(icons.food(p.from[0])), plus(), img(icons.food(p.from[1])), eq(), img(icons.food(p.out), 'ri big'), h('span', { class: 'rname', text: loc(FOODS[p.out].name) })));
    }
    const dishes = h('div', { class: 'recipe-list' });
    const shown = focus ? menuDishes.filter((d) => d.id === focus) : menuDishes;
    for (const d of shown) {
      const row = h('div', { class: 'recipe-row' + (focus ? ' focus' : '') });
      d.parts.forEach((p, i) => {
        if (i) row.append(plus());
        row.append(img(icons.food(p)));
      });
      row.append(eq(), img(icons.dish(d.id), 'ri big'), h('span', { class: 'rname', text: loc(DISHES[d.id].name) }));
      dishes.append(row);
    }
    openDialog({
      title: focus ? loc(DISHES[focus].name) : t('recipes'),
      head: 'blue',
      cls: 'recipes-dialog',
      body: [h('h3', { class: 'recipe-head', text: t('prepsTitle') }), preps, h('h3', { class: 'recipe-head', text: t('dishesTitle') }), dishes],
      buttons: [{ label: t('gotIt'), cls: 'green', onClick: resume }],
      onClose: resume,
    });
  }

  private introCard(intro: NonNullable<LevelDef['intro']>, next: () => void = () => undefined): void {
    const g = this.game;
    if (g) g.paused = true;
    const done = once(() => {
      this.markSeen('intro:' + intro);
      if (g) g.paused = false;
      next();
    });
    const isDish = intro in DISHES;
    const art = isDish
      ? `<img src="${icons.dish(intro as DishId)}" width="120" height="120" alt="">`
      : intro === 'lid' || intro === 'slots' ? glyph(intro === 'lid' ? 'lid' : 'slot', 84)
      : intro === 'cloche' || intro === 'frozen' || intro === 'oven' || intro === 'grill' || intro === 'set' || intro === 'vip' ? MECH_ART[intro]
      : `<img src="${icons.food('tortilla')}" width="100" height="100" alt="">`;
    openDialog({
      title: t(isDish ? 'newDish' : 'newRule'),
      head: 'green',
      body: [
        h('div', { class: 'mech-art', html: art }),
        isDish ? h('p', { html: `<b style="font-size:21px">${loc(DISHES[intro as DishId].name)}</b>` }) : '',
        t(`intro_${intro}` as Parameters<typeof t>[0]),
      ].filter(Boolean) as (HTMLElement | string)[],
      buttons: [{ label: t('gotIt'), cls: 'green', onClick: done }],
      onClose: done,
    });
    audio.play('unlock');
  }

  private introBooster(b: BoosterId, next: () => void = () => undefined): void {
    if (this.save.seen.includes('booster:' + b)) return next();
    const g = this.game;
    if (g) g.paused = true;
    const done = once(() => {
      if (g) g.paused = false;
      next();
    });
    this.save.boosters[b] += BOOSTER_GIFT;
    this.markSeen('booster:' + b);
    writeSave(this.save);
    this.refreshDock();
    openDialog({
      title: t('boosterUnlocked'),
      head: 'purple',
      body: [h('div', { class: 'mech-art', html: dockIcon(b, 84) }), h('p', { html: `<b style="font-size:21px">${t(`booster_${b}`)}</b> · ${t('free', { n: BOOSTER_GIFT })}` }), t(`boosterDesc_${b}`)],
      buttons: [{ label: t('gotIt'), cls: 'green', onClick: done }],
      onClose: done,
    });
    audio.play('unlock');
  }

  // ------------------------------------------------------------------ results

  private onWin(g: Game): void {
    if (this.dailyRun) return this.onDailyWin(g);
    const n = g.level.n;
    const stars = g.stars();
    const prev = this.save.stars[n] ?? 0;
    const reward = coinsFor(g.level.tier, stars, g.undos === 0 && g.boostersUsed === 0, prev);
    this.save.stars[n] = Math.max(prev, stars);
    this.save.coins += reward.total;
    if (n >= this.save.level) this.save.level = n + 1;
    writeSave(this.save);
    const dur = g.view.celebrate();
    audio.duck(0.25, 2.5);
    audio.play('win');
    if (this.tutorial) {
      this.hud?.hideTutorial();
      this.tutorial = 0;
      this.markSeen('tutorial');
    }
    setTimeout(() => this.showWinDialog(g.level, stars, reward, prev === 0), Math.max(900, dur * 1000 + 300));
  }

  private onDailyWin(g: Game): void {
    const today = dayKey();
    const d = this.save.daily;
    const first = d.day !== today;
    if (first) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      d.streak = d.day === dayKey(y) ? d.streak + 1 : 1;
      d.day = today;
    }
    const base = first ? 25 : 0;
    const streak = first ? 5 * Math.min(7, d.streak) : 0;
    this.save.coins += base + streak;
    writeSave(this.save);
    g.view.celebrate();
    audio.duck(0.25, 2.5);
    audio.play('win');
    setTimeout(() => {
      const line = (label: string, v: number) => h('div', { class: 'reward-line' + (v ? '' : ' off'), html: `<span>${label}</span><b>+${v}</b>` });
      openDialog({
        title: t('dailyDone'),
        head: 'green',
        body: [
          h('div', { class: 'mech-art', html: glyph('daily', 84) }),
          h('p', { html: `<b>${t('dailyStreak', { n: d.streak })}</b> ${glyph('fire', 22)}`, style: 'display:flex;align-items:center;justify-content:center;gap:4px' }),
          h('div', { class: 'reward' }, line(t('rewardDaily'), base), line(t('rewardStreak'), streak)),
          h('div', { class: 'coins-gain', html: `${glyph('coin', 30)} +${base + streak}` }),
          h('p', { class: 'subtle', text: t('dailyTomorrow') }),
        ],
        buttons: [{ label: `${glyph('map', 22)} ${t('map')}`, cls: 'green', onClick: () => this.showMap() }],
        closable: false,
      });
      if (base) setTimeout(() => audio.play('coin'), 500);
    }, 1500);
  }

  private showWinDialog(level: LevelDef, stars: number, reward: Reward, firstTime: boolean): void {
    const starsEl = h('div', { class: 'stars', html: [1, 2, 3].map(() => glyph('star', 64, 'star')).join('') });
    const plates = h('div', { class: 'win-dishes' });
    for (const d of level.orders) plates.append(h('img', { attrs: { src: icons.dish(d), alt: '', draggable: 'false' } }));
    const line = (label: string, v: number) => h('div', { class: 'reward-line' + (v ? '' : ' off'), html: `<span>${label}</span><b>+${v}</b>` });
    const lines = h(
      'div',
      { class: 'reward' },
      line(firstTime ? t(level.tier === 'normal' ? 'rewardLevel' : level.tier === 'hard' ? 'rewardHard' : 'rewardSuperhard') : t('rewardReplay'), reward.base),
      line(t('rewardStars'), reward.stars),
      line(t('rewardClean'), reward.clean),
    );
    const coinEl = h('div', { class: 'coins-gain', html: `${glyph('coin', 30)} +${reward.total}` });
    const body: (HTMLElement | string)[] = [starsEl, plates, h('p', { class: 'subtle', text: t('guestsFed', { n: level.orders.length }) })];
    // a dish served for the first time goes into the cookbook (two or more: small cards side by side)
    if (this.newDishes.length) {
      const cards = h('div', { class: 'new-recipes' + (this.newDishes.length > 1 ? ' compact' : '') });
      for (const d of this.newDishes) {
        const art = h('img', { class: 'nr-art', attrs: { src: `${import.meta.env.BASE_URL}art/dishes/${dishArt(d)}.webp`, alt: '' } });
        art.addEventListener('error', () => art.setAttribute('src', icons.dish(d)));
        cards.append(h('div', { class: 'new-recipe' }, art, h('div', {}, h('small', { text: t('newRecipe') }), h('b', { text: loc(DISHES[d].name) }))));
      }
      body.push(cards);
    }
    body.push(lines, coinEl);
    openDialog({
      title: t(stars === 3 ? 'win3' : stars === 2 ? 'win2' : 'win1'),
      head: 'green',
      body,
      buttons: [
        { label: `${t('next')} ${glyph('play', 22)}`, cls: 'green big', onClick: () => void this.play(level.n + 1) },
        { label: `${glyph('map', 22)} ${t('map')}`, cls: 'white small', onClick: () => this.showMap() },
      ],
      closable: false,
    });
    starsEl.querySelectorAll('.star').forEach((el, i) => {
      if (i < stars)
        setTimeout(() => {
          el.classList.add('on');
          audio.play('star', { pitch: i });
        }, 350 + i * 330);
    });
    setTimeout(() => audio.play('coin'), 350 + stars * 330 + 150);
  }

  private onStuck(): void {
    const g = this.game;
    if (!g) return;
    audio.play('stuck');
    // Where did it go wrong? The solver finds the last position that could still be finished.
    const r = g.hint();
    const back = r.kind === 'dead' ? r.back : 1;
    const buttons: DialogButton[] = [
      { label: this.rewindLabel(back), cls: 'green', onClick: () => this.rewind(back) },
    ];
    if (g.level.n >= BOOSTER_UNLOCK.slot || this.save.settings.debug) {
      const have = this.save.boosters.slot;
      buttons.push({
        label: `${t('booster_slot')} ${have > 0 ? `<span class="price">×${have}</span>` : `<span class="price">${glyph('coin', 24)} ${BOOSTER_PRICE.slot}</span>`}`,
        cls: 'blue',
        onClick: () => {
          if (have > 0) this.useBooster('slot');
          else setTimeout(() => this.openShop('slot'), 200);
        },
      });
    }
    buttons.push({ label: `${glyph('restart', 22)} ${t('retry')}`, cls: 'white', onClick: () => this.restart() });
    openDialog({ title: t('stuckTitle'), head: 'red', body: [h('div', { class: 'mech-art', html: glyph('pot', 84) }), g.level.rules === 'taco' ? t('stuckTaco') : t(back > 1 ? 'stuckTextBack' : 'stuckText', { n: back })], buttons, closable: false });
  }

  private restart(): void {
    if (this.game) this.startLevel(this.game.level);
  }


  // ------------------------------------------------------------------ dialogs

  private openPause(): void {
    const g = this.game;
    if (!g) return;
    g.paused = true;
    const buttons: DialogButton[] = [
      { label: `${glyph('play', 22)} ${t('resume')}`, cls: 'green', onClick: () => void (g.paused = false) },
      { label: `${glyph('restart', 22)} ${t('restart')}`, cls: 'blue', onClick: () => this.restart() },
      { label: `${glyph('home', 22)} ${t('toMap')}`, cls: 'white', onClick: () => this.showMap() },
    ];
    if (this.save.settings.debug) {
      buttons.push({ label: `${glyph('debug', 22)} Auto-solve`, cls: 'purple small', onClick: () => this.autoSolve() });
      buttons.push({ label: `${glyph('ff', 20)} Skip`, cls: 'purple small', onClick: () => this.skipLevel() });
    }
    openDialog({ title: t('paused'), head: 'purple', body: [this.volumeRow('music'), this.volumeRow('sfx')], buttons, onClose: () => void (g.paused = false) });
  }

  private confirmLeave(): void {
    const g = this.game;
    if (!g || g.moves === 0) return this.showMap();
    g.paused = true;
    openDialog({
      title: t('toMap'),
      head: 'purple',
      body: [h('p', { text: t('leaveLevel') })],
      buttons: [
        { label: `${glyph('home', 22)} ${t('leave')}`, cls: 'blue', onClick: () => this.showMap() },
        { label: `${glyph('play', 22)} ${t('stay')}`, cls: 'green', onClick: () => void (g.paused = false) },
      ],
      onClose: () => void (g.paused = false),
    });
  }

  /** Debug: the solver plays the level. */
  private autoSolve(): void {
    const g = this.game;
    if (!g) return;
    g.paused = false;
    const step = () => {
      if (this.game !== g || g.status !== 'playing') return;
      if (!dialogOpen()) {
        const r = g.hint();
        if (r.kind !== 'safe') return;
        g.take(r.col);
      }
      setTimeout(step, 450);
    };
    step();
  }

  /** Attract mode / screenshots: the solver plays every level. */
  private startDemo(): void {
    setInterval(() => {
      const g = this.game;
      if (!g || dialogOpen() || g.status !== 'playing' || g.paused) return;
      const r = g.hint();
      if (r.kind === 'safe') g.take(r.col);
    }, 650);
  }

  private skipLevel(): void {
    const g = this.game;
    if (!g) return;
    const n = g.level.n;
    this.save.stars[n] = Math.max(this.save.stars[n] ?? 0, 1);
    if (n >= this.save.level) this.save.level = n + 1;
    writeSave(this.save);
    void this.play(n + 1);
  }

  private volumeRow(kind: 'music' | 'sfx'): HTMLElement {
    const name = t(kind === 'music' ? 'music' : 'sounds');
    const input = h('input', { attrs: { id: `volume-${kind}`, type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': name } });
    input.value = String(this.save.settings[kind]);
    const value = h('output', { class: 'volume-value', attrs: { for: input.id } });
    const refresh = () => {
      const percent = `${Math.round(Number(input.value) * 100)}%`;
      value.textContent = percent;
      input.style.setProperty('--volume', percent);
    };
    refresh();
    input.addEventListener('input', () => {
      const v = Number(input.value);
      this.save.settings[kind] = v;
      if (kind === 'music') audio.setMusicVolume(v);
      else audio.setSfxVolume(v);
      refresh();
      writeSave(this.save);
    });
    input.addEventListener('change', () => kind === 'sfx' && audio.play('tap'));
    return h(
      'div',
      { class: 'setting-row volume-setting' },
      h('label', { class: 'setting-name', attrs: { for: input.id } }, h('span', { class: `setting-icon ${kind}`, html: glyph(kind === 'music' ? 'music' : 'sound', 26) }), name),
      h('div', { class: 'volume-control' }, input, value),
    );
  }

  private openSettings(): void {
    const seg = (label: string, options: [string, string][], current: string, pick: (v: string) => void) => {
      const el = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': label } });
      for (const [v, text] of options) {
        const b = h('button', { class: current === v ? 'on' : '', text, attrs: { 'aria-pressed': String(current === v) } });
        b.addEventListener('click', () => {
          audio.play('button');
          for (const x of el.querySelectorAll('button')) {
            x.classList.toggle('on', x === b);
            x.setAttribute('aria-pressed', String(x === b));
          }
          pick(v);
        });
        el.append(b);
      }
      return el;
    };
    const langRow = h('div', { class: 'setting-row' }, h('span', { class: 'setting-name' }, h('span', { html: glyph('language', 26) }), t('language')), seg(t('language'), [['ru', 'Русский'], ['en', 'English']], getLang(), (v) => {
      this.save.settings.lang = v as Lang;
      writeSave(this.save);
      setLang(v as Lang);
      closeAllDialogs();
      this.map.render();
      this.openSettings();
    }));
    const nightRow = h('div', { class: 'setting-row' }, h('span', { class: 'setting-name' }, h('span', { html: glyph('night', 26) }), t('nightMode')), seg(t('nightMode'), [['auto', t('auto')], ['on', t('on')], ['off', t('off')]], this.save.settings.night, (v) => {
      this.save.settings.night = v as SaveData['settings']['night'];
      writeSave(this.save);
      this.applyNight();
    }));
    const debugRow = h('div', { class: 'setting-row debug-setting' }, h('span', { class: 'setting-name' }, h('span', { html: glyph('debug', 26) }), t('debug')), seg(t('debug'), [['1', t('on')], ['0', t('off')]], this.save.settings.debug ? '1' : '0', (v) => {
      this.save.settings.debug = v === '1';
      writeSave(this.save);
      this.map.render();
    }), h('small', { class: 'setting-hint', text: t('debugHint') }));
    const credits = button(t('credits'), 'white small settings-link', () => this.openCredits());
    const reset = button(t('resetProgress'), 'red small settings-reset', () => {
      openDialog({
        title: t('resetProgress'),
        head: 'red',
        body: [t('resetConfirm')],
        row: true,
        buttons: [
          { label: glyph('check', 24), cls: 'red', onClick: () => { this.save = resetSave(); closeAllDialogs(); this.showMap(); } },
          { label: glyph('close', 24), cls: 'white', onClick: () => undefined },
        ],
      });
    });
    openDialog({
      title: t('settings'),
      head: 'purple',
      cls: 'utility-dialog settings-dialog',
      body: [h('div', { class: 'utility-content' },
        h('div', { class: 'settings-section' }, this.volumeRow('music'), this.volumeRow('sfx')),
        h('div', { class: 'settings-section' }, langRow, nightRow),
        h('div', { class: 'settings-section' }, debugRow),
        h('div', { class: 'settings-footer' }, credits, reset))],
      onClose: () => undefined,
    });
  }

  private openCredits(): void {
    const link = (text: string, href: string) => h('a', { text, attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
    const entry = (name: string, url: string, license: string, licenseUrl: string) => h('li', {}, h('div', { class: 'credit-line' }, link(name, url), link(license, licenseUrl)));
    openDialog({
      title: t('credits'),
      head: 'blue',
      cls: 'utility-dialog credits-dialog',
      body: [h('div', { class: 'utility-content' },
        h('section', { class: 'credit-section credit-author' }, h('h3', { text: t('creditAuthor') }), h('strong', { text: t('creditAuthorName') })),
        h('section', { class: 'credit-section' }, h('h3', { text: t('creditModels') }), h('p', { text: t('creditModelsNote') })),
        h('section', { class: 'credit-section' }, h('h3', { text: t('creditTools') }), h('ul', { class: 'credit-list' },
          entry('Vollkorn', 'https://fonts.google.com/specimen/Vollkorn', 'SIL OFL 1.1', 'https://openfontlicense.org/'),
          entry('Jost', 'https://fonts.google.com/specimen/Jost', 'SIL OFL 1.1', 'https://openfontlicense.org/'),
          entry('Nunito', 'https://fonts.google.com/specimen/Nunito', 'SIL OFL 1.1', 'https://openfontlicense.org/'),
          entry('three.js', 'https://threejs.org/', 'MIT', 'https://github.com/mrdoob/three.js/blob/dev/LICENSE'))),
        h('section', { class: 'credit-section' }, h('h3', { text: t('creditAudio') }), h('p', { text: t('creditAudioNote') })))],
      onClose: () => undefined,
      buttons: [{ label: t('close'), cls: 'white small utility-done', onClick: () => undefined }],
    });
  }
}

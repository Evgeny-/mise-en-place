import * as THREE from 'three';
import type { PlaySim as Sim, SimEvent } from '../core/sim';
import type { LevelDef } from '../core/types';
import { addStudioLights, createRenderer, LOW_END, type StudioLights } from './stage';
import { computeLayout, screenUp, GUEST_SCALE, type Layout } from './layout';
import { Tweens } from './anim';
import { FxView } from './FxView';
import { KitchenSet } from './KitchenSet';
import { PantryView } from './PantryView';
import { CounterView, FLIGHT, MERGE } from './CounterView';
import { GuestsView } from './GuestsView';
import type { KitchenTheme } from './themes';
import { kitchenFor } from '../core/kitchen';
import { DEFAULT_LOOKS, type Looks } from './decor';
import { AdaptiveRenderScale } from './AdaptiveRenderScale';
import { audio } from '../audio/audio';

export interface Insets {
  top: number;
  bottom: number;
}

/** Space kept above the guests' heads for their tickets (CSS px; beside them in landscape). */
export const TICKET_SPACE = 104;
/** The strip of orders still to come, under the top bar. */
export const QUEUE_SPACE = 46;
const SIDE_TICKET_SPACE = 16;

const NIGHT = new THREE.Color('#1d2140');

/**
 * Owns the three.js renderer and every visual element of a level. The simulation is the source
 * of truth; the view animates its events.
 */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly tweens = new Tweens();
  readonly fx = new FxView();
  layout!: Layout;
  set!: KitchenSet;
  pantry!: PantryView;
  counter!: CounterView;
  guests!: GuestsView;
  level!: LevelDef;
  insets: Insets = { top: 70, bottom: 110 };
  /** decor bought in the shop, applied when a level loads */
  looks: Looks = DEFAULT_LOOKS;
  /** view clock: advances with the (clamped) frame time, drives every delayed animation */
  clock = 0;
  private lights: StudioLights;
  private sim!: Sim;
  private theme!: KitchenTheme;
  private levelGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private night = false;
  private renderScale: AdaptiveRenderScale;
  private punchT = 0;

  constructor(container: HTMLElement) {
    this.renderer = createRenderer(container);
    this.renderer.domElement.classList.add('gl');
    this.renderScale = new AdaptiveRenderScale(this.renderer.getPixelRatio());
    this.lights = addStudioLights(this.renderer, this.scene);
    this.scene.add(this.levelGroup, this.fx.group);
  }

  load(level: LevelDef, sim: Sim, theme: KitchenTheme): void {
    this.unload();
    this.level = level;
    this.sim = sim;
    this.theme = theme;
    this.layout = this.makeLayout();
    this.set = new KitchenSet(theme, this.layout, this.looks);
    this.pantry = new PantryView(this.layout, this.tweens, this.set.trayTop, this.looks.tile);
    this.counter = new CounterView(this.layout, this.tweens, this.fx, this.set.slotTop);
    this.guests = new GuestsView(this.layout, this.tweens, this.fx);
    this.levelGroup.add(this.set.group, this.pantry.group, this.counter.group, this.guests.group);
    this.syncAll(sim, true);
    let lastLand = 0;
    this.pantry.onLand = (col) => {
      // a soft patter of tiles landing, not one click per tile
      if (this.clock - lastLand > 0.06) audio.play('tile', { pan: (this.layout.colX[col] ?? 0) / 6 });
      lastLand = this.clock;
    };
    this.applyLook();
    this.fitCamera();
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
  }

  /** Landscape screens put the tickets beside the guests. */
  get wide(): boolean {
    return this.width > this.height * 1.15;
  }

  private makeLayout(): Layout {
    const sim = this.sim;
    return computeLayout({
      wide: this.wide,
      columns: sim.columns.length,
      rows: Math.max(...sim.columns.map((c) => c.length)),
      slots: sim.slots,
      seats: sim.seats.length,
    });
  }

  /** Rebuild every element from the simulation (level start, undo). */
  syncAll(sim: Sim, intro = false): void {
    this.sim = sim;
    this.tweens.flush();
    this.tweens.clear();
    this.pantry.sync(sim, intro);
    this.counter.sync(sim);
    this.guests.sync(sim, intro);
    this.refreshLegal();
    this.refreshMoods();
  }

  unload(): void {
    if (!this.set) return;
    this.tweens.clear();
    this.levelGroup.clear();
    this.set.dispose();
    this.pantry.dispose();
    this.counter.dispose();
    this.guests.dispose();
  }

  setNight(on: boolean): void {
    this.night = on;
    this.applyLook();
  }

  private applyLook(): void {
    const th = this.theme;
    if (!th) return;
    const n = this.night;
    const bg = new THREE.Color(th.bg);
    if (n) bg.lerp(NIGHT, 0.7);
    this.scene.background = bg;
    this.lights.hemi.color.set(n ? '#9aa8e6' : th.sky);
    this.lights.hemi.groundColor.set(th.bounce);
    if (n) this.lights.hemi.groundColor.lerp(NIGHT, 0.6);
    this.lights.hemi.intensity = n ? 0.6 : 0.95;
    this.lights.sun.color.set(n ? '#ffd9a8' : '#fff4e0');
    this.lights.sun.intensity = n ? 1.6 : 2.8;
    this.renderer.toneMappingExposure = n ? 0.95 : 1.05;
    this.scene.environmentIntensity = n ? 0.28 : 0.42;
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    const wasWide = this.wide;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.renderScale.resetCadence();
    if (!this.sim) return;
    if (wasWide !== this.wide) this.relayout();
    else this.fitCamera();
  }

  /** The HUD changed size: fit the camera again. */
  refit(): void {
    if (this.sim) this.fitCamera();
  }

  /** The counter grew (booster): move the plates and items. */
  relayout(): void {
    const l = this.makeLayout();
    this.layout = l;
    this.set.setLayout(l);
    this.pantry.setLayout(l);
    this.counter.setLayout(l);
    this.guests.setLayout(l);
    this.fitCamera();
  }

  observeFrame(frameMs: number, now: number, suspended: boolean): void {
    if (suspended) return;
    const dpr = this.renderScale.sample(frameMs, now);
    if (dpr !== null) this.renderer.setPixelRatio(dpr);
  }

  private fitCamera(): void {
    const l = this.layout;
    const t = l.tilt;
    const headTop = l.barTop + (1.62 - 0.55) * GUEST_SCALE + 0.05;
    const vTop = screenUp(headTop, l.seatZ, t);
    const vBot = screenUp(0, l.maxZ, t);
    const needW = l.halfW * 2 + 0.2;
    const needH = vTop - vBot;
    const y1 = this.insets.top + QUEUE_SPACE + (this.wide ? SIDE_TICKET_SPACE : TICKET_SPACE);
    const y2 = this.height - this.insets.bottom - 8;
    const freeW = Math.max(100, this.width - 16);
    const freeH = Math.max(100, y2 - y1);
    const upp = Math.max(needW / freeW, needH / freeH);
    const contentPx = needH / upp;
    const extra = Math.max(0, freeH - contentPx);
    const topPx = y1 + extra * 0.4;
    const vCenter = vTop - (this.height / 2 - topPx) * upp;
    const cz = -vCenter / Math.cos(t);
    const dist = 40;
    this.camera.position.set(0, dist * Math.cos(t), cz + dist * Math.sin(t));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, cz);
    const halfW = (this.width * upp) / 2;
    const halfH = (this.height * upp) / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.near = 1;
    this.camera.far = dist * 2 + 30;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.fx.setCamera(this.camera);

    const sun = this.lights.sun;
    const span = Math.max(l.halfW + 1, (l.maxZ - l.wallZ) / 2 + 1.5);
    const cz2 = (l.maxZ + l.wallZ) / 2;
    // from the upper left on the chef's side: faces lit, shadows fall away from the viewer
    sun.position.set(-7, 18, cz2 + 9);
    sun.target.position.set(0, 0, cz2);
    const sc = sun.shadow.camera;
    sc.left = -span - 2;
    sc.right = span + 2;
    sc.top = span + 2;
    sc.bottom = -span - 2;
    sc.near = 1;
    sc.far = 60;
    sc.updateProjectionMatrix();
    sun.shadow.mapSize.set(LOW_END ? 1024 : 2048, LOW_END ? 1024 : 2048);
  }

  /** Column under a screen point (CSS px relative to the canvas), or null. */
  pickColumn(x: number, y: number): number | null {
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.pantry.pick(this.raycaster);
  }

  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = this.tmp.copy(p).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  /** Screen point above a guest's head, where the ticket hangs. */
  seatAnchor(seat: number): { x: number; y: number } {
    const p = this.guests.headPos(seat, new THREE.Vector3());
    if (this.wide) p.add(new THREE.Vector3(0.62, -0.75, 0));
    return this.toScreen(p);
  }

  /** Screen point of a counter slot. */
  slotAnchor(slot: number): { x: number; y: number } {
    return this.toScreen(this.counter.slotPos(slot));
  }

  columnAnchor(col: number): { x: number; y: number } {
    return this.toScreen(this.pantry.frontPos(col, new THREE.Vector3()));
  }

  refreshLegal(): void {
    const legal = this.sim.columns.map((_, c) => this.sim.status === 'playing' && this.sim.canTake(c));
    this.pantry.setLegal(legal);
  }

  setHint(col: number): void {
    this.pantry.setHint(col);
  }

  shake(col: number): void {
    this.pantry.shake(col);
  }

  /** Guests lean in when their dish lacks just one part (or one layer). */
  refreshMoods(): void {
    const sim = this.sim;
    if (sim.ticket && sim.stacked) {
      sim.seats.forEach((_, i) => {
        const t = sim.ticket!(i);
        this.guests.setExpectant(i, !!t && t.length - sim.stacked!(i) === 1);
      });
      return;
    }
    const k = kitchenFor(sim.level.menu);
    sim.seats.forEach((dish, i) => {
      if (!dish) return this.guests.setExpectant(i, false);
      const pool = sim.counter.filter((x) => x !== null) as string[];
      let missing = 0;
      for (const p of k.parts[k.dish(dish)]) {
        const at = pool.indexOf(k.items[p]);
        if (at >= 0) pool.splice(at, 1);
        else missing++;
      }
      this.guests.setExpectant(i, missing === 1);
    });
  }

  /** Animate one move. Returns how long the counter part of it takes (seconds). */
  apply(events: SimEvent[]): number {
    let cursor = 0;
    let prepPitch = 0;
    events.forEach((e, i) => {
      switch (e.t) {
        case 'take': {
          const next = events[i + 1];
          const target = next?.t === 'prep' && (next.a === e.slot || next.b === e.slot) ? next.slot : e.slot;
          // the item that completes a dish on a full counter joins the other parts in the air
          // above the board instead of landing on the spare spot past it
          const joins = e.slot >= this.layout.slotX.length && next?.t === 'serve' && next.from.includes(e.slot);
          const at = joins ? this.counter.joinPos(next.from.filter((s) => s !== e.slot)) : undefined;
          const { food, from } = this.pantry.take(e.col, this.scene);
          this.counter.land(food, from, e.slot, target, 0, e.item, at);
          audio.play('take');
          this.guests.lookAt(this.counter.slotPos(target));
          cursor = FLIGHT;
          break;
        }
        case 'prep':
          this.counter.merge(e.a, e.b, e.slot, e.item, cursor, prepPitch++);
          cursor += MERGE + 0.18;
          break;
        case 'serve': {
          // stacked kitchens (burgers, hot dogs, pancakes…): the stack on the plate is the dish
          if (this.sim.ticket && !e.from.length) {
            this.guests.serveStack(e.seat, this.clock + cursor, e.dish);
            cursor += 0.3;
            break;
          }
          const parts = this.counter.release(e.from);
          this.guests.serve(e.seat, e.dish, parts, this.clock + cursor);
          cursor += 0.12;
          break;
        }
        case 'stack': {
          const { food, from } = this.pantry.take(e.col, this.scene);
          this.guests.stackLayer(e.seat, e.layer, e.item, food, from, cursor);
          audio.play('take');
          this.guests.lookAt(this.guests.platePos(e.seat));
          cursor += FLIGHT + 0.05;
          break;
        }
        case 'fill': {
          const info = (this.sim as unknown as { slotInfo?: (i: number) => { cap?: number } | null }).slotInfo?.(e.slot);
          const cap = info && 'cap' in info && info.cap ? info.cap : 3;
          if (e.col !== null) {
            const { food, from } = this.pantry.take(e.col, this.scene);
            this.counter.fill(food, from, null, e.slot, e.item, e.n, cap, cursor);
            audio.play('take');
            cursor += FLIGHT;
          } else {
            this.counter.fill(null, null, e.from, e.slot, e.item, e.n, cap, cursor);
            cursor += FLIGHT * 0.7;
          }
          break;
        }
        case 'fold':
          this.counter.fold(e.slot, e.dish, cursor);
          cursor += 0.45;
          break;
        case 'move':
          this.counter.move(e.from, e.to, cursor);
          break;
        case 'receive': {
          const slot = e.slot;
          this.tweens.after(cursor, () => this.counter.setReceiving(slot));
          break;
        }
        case 'slide': {
          const [obj] = this.counter.release([e.slot]);
          const from = obj ? obj.getWorldPosition(new THREE.Vector3()) : this.counter.slotPos(e.slot);
          if (obj) this.guests.stackLayer(e.seat, e.layer, e.item, obj, from, cursor);
          cursor += FLIGHT * 0.8;
          break;
        }
        case 'seat':
          this.guests.seatChanged(e.seat, e.order);
          break;
        case 'lid':
          this.tweens.after(cursor + 0.5, () => {
            this.pantry.updateLids(this.sim);
            audio.play('lid');
          });
          break;
        // the stove: a dish goes into the oven, a patty onto the grill, a countdown ticks, it's done
        case 'bake':
          this.counter.bake(e.from, e.slot, e.dish, e.left, cursor);
          cursor += MERGE + 0.2;
          break;
        case 'grill':
          this.counter.grill(e.slot, e.left, cursor - FLIGHT);
          break;
        case 'tick':
          this.counter.setCook(e.slot, e.left, cursor);
          break;
        case 'done':
          this.counter.done(e.slot, cursor);
          cursor += 0.35;
          break;
        // set menus and VIPs: a finished dish (or burger stack) waits on a napkin for its guest
        case 'ready':
          this.counter.ready(e.from, e.slot, e.dish, cursor);
          cursor += MERGE + 0.15;
          break;
        case 'shelve': {
          const holder = this.guests.takeStack(e.seat, this.clock + cursor);
          if (holder) this.counter.adopt(holder, e.slot, cursor + 0.2);
          cursor += 0.3;
          break;
        }
        case 'ticket':
          break;
        default:
          break;
      }
    });
    this.counter.trim(this.sim.slots);
    this.tweens.after(cursor + 0.6, () => this.guests.lookAt(null));
    if (events.some((e) => e.t === 'serve')) this.tweens.after(cursor, () => this.pantry.updateLids(this.sim));
    this.refreshLegal();
    this.tweens.after(cursor, () => this.refreshMoods());
    return cursor;
  }

  punch(): void {
    this.punchT = 1;
  }

  /** True when nothing is moving any more. */
  isIdle(): boolean {
    return !this.tweens.busy && !this.guests.busy;
  }

  update(dt: number): void {
    if (!this.set) return;
    this.clock += dt;
    const time = this.clock;
    this.tweens.update(dt);
    this.pantry.update(dt, time);
    this.counter.update(dt);
    this.guests.update(dt, time);
    this.fx.update(dt);
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt * 2.5);
      this.camera.zoom = 1 + Math.sin(this.punchT * Math.PI) * 0.012;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The kitchen is done: party poppers fire the kitchen's own confetti over the counter. */
  celebrate(): number {
    const l = this.layout;
    this.fx.party(this.theme.id, l.halfW, l.rowZ0 + 1.2, l.seatZ);
    audio.play('pop');
    this.punch();
    return Math.max(1.2, this.guests.cheer());
  }

  dispose(): void {
    this.unload();
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { DishId, FoodId } from '../core/content';
import { dishModel, foodModel } from './models';

/**
 * Renders the 3D food and dish models into small transparent images for the DOM (tickets,
 * recipe cards, dialogs), so the UI always shows exactly what is on the table.
 */
class IconFactory {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private cache = new Map<string, string>();
  /** rendered size, then the drawn part is cropped and scaled to fill the output icon */
  private size = 320;
  private out = 160;

  private init(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(this.size, this.size, false);
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#b09070', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
    sun.position.set(-3, 6, 4);
    this.scene.add(sun);
    this.renderer = r;
    return r;
  }

  private shot(key: string, make: () => THREE.Object3D, elevation: number): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = this.init();
    const obj = make();
    this.scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 0.98;
    this.camera.position.set(center.x, center.y + Math.sin(elevation) * dist, center.z + Math.cos(elevation) * dist);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    const url = this.cropped(r.domElement);
    this.scene.remove(obj);
    this.cache.set(key, url);
    return url;
  }

  /** The opaque part of the render, centred and scaled to fill the icon (long or flat things
   *  like a pasta bundle otherwise sit small inside their bounding sphere). */
  private cropped(src: HTMLCanvasElement): string {
    const n = this.size;
    const scan = document.createElement('canvas');
    scan.width = scan.height = n;
    const sg = scan.getContext('2d', { willReadFrequently: true })!;
    sg.drawImage(src, 0, 0);
    const px = sg.getImageData(0, 0, n, n).data;
    let x0 = n, y0 = n, x1 = -1, y1 = -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (px[(y * n + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const out = document.createElement('canvas');
    out.width = out.height = this.out;
    if (x1 < 0) return out.toDataURL('image/png');
    const side = Math.max(x1 - x0 + 1, y1 - y0 + 1) / 0.9;
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    const og = out.getContext('2d')!;
    og.imageSmoothingQuality = 'high';
    og.drawImage(scan, cx - side / 2, cy - side / 2, side, side, 0, 0, this.out, this.out);
    return out.toDataURL('image/png');
  }

  food(id: FoodId): string {
    return this.shot('f:' + id, () => foodModel(id), 0.62);
  }

  dish(id: DishId): string {
    return this.shot('d:' + id, () => dishModel(id), 0.8);
  }

  /** Forget everything (models changed). */
  reset(): void {
    this.cache.clear();
  }
}

export const icons = new IconFactory();

import * as THREE from 'three';

/**
 * Each kitchen's confetti: little paper and food shapes drawn on canvas (full colour, so the
 * particles are not tinted). Trattoria: pasta bows, basil, tomato slices, tricolore ribbons.
 * Burger Joint: sprinkles, stars, cherries, checker squares. Taquería: papel picado, chillies,
 * marigolds, lime slices.
 */
type Draw = (g: CanvasRenderingContext2D) => void;

const S = 64;

function tex(draw: Draw): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineJoin = g.lineCap = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ink = 'rgba(60,35,25,0.55)';

function blob(g: CanvasRenderingContext2D, path: () => void, fill: string, line = ink): void {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = line;
  g.lineWidth = 2.5;
  g.stroke();
}

const farfalle: Draw = (g) => {
  blob(g, () => {
    g.moveTo(32, 32);
    g.bezierCurveTo(22, 14, 8, 14, 8, 24);
    g.lineTo(8, 40);
    g.bezierCurveTo(8, 50, 22, 50, 32, 32);
    g.bezierCurveTo(42, 14, 56, 14, 56, 24);
    g.lineTo(56, 40);
    g.bezierCurveTo(56, 50, 42, 50, 32, 32);
  }, '#f4c95d');
  g.fillStyle = '#e0a93a';
  g.fillRect(28, 26, 8, 12);
};

const basil: Draw = (g) => {
  blob(g, () => {
    g.moveTo(10, 50);
    g.bezierCurveTo(12, 20, 40, 8, 56, 10);
    g.bezierCurveTo(54, 32, 34, 54, 10, 50);
  }, '#4caf50');
  g.strokeStyle = '#2e7d32';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(12, 48);
  g.quadraticCurveTo(30, 30, 54, 12);
  g.stroke();
};

const tomatoSlice: Draw = (g) => {
  blob(g, () => g.arc(32, 32, 24, 0, Math.PI * 2), '#e5483b');
  g.fillStyle = '#ff8a75';
  g.beginPath();
  g.arc(32, 32, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffe9a8';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.ellipse(32 + Math.cos(a) * 10, 32 + Math.sin(a) * 10, 3, 2, a, 0, Math.PI * 2);
    g.fill();
  }
};

const tricolore: Draw = (g) => {
  const cols = ['#2e9e4f', '#fbf6ec', '#d8322c'];
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(6 + i * 17.3, 20, 17.5, 24);
  });
  g.strokeStyle = ink;
  g.lineWidth = 2.5;
  g.strokeRect(6, 20, 52, 24);
};

const sprinkle = (color: string): Draw => (g) => {
  g.translate(32, 32);
  g.rotate(-0.6);
  blob(g, () => g.roundRect(-22, -6, 44, 12, 6), color);
};

const star: Draw = (g) => {
  blob(g, () => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 26;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      if (i) g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
      else g.moveTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    g.closePath();
  }, '#ffcf3f');
};

const cherry: Draw = (g) => {
  g.strokeStyle = '#5b7a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(26, 34);
  g.quadraticCurveTo(30, 12, 46, 8);
  g.stroke();
  blob(g, () => g.arc(24, 42, 15, 0, Math.PI * 2), '#d7263d');
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.ellipse(19, 37, 4, 3, -0.6, 0, Math.PI * 2);
  g.fill();
};

const checker: Draw = (g) => {
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    g.fillStyle = (x + y) % 2 ? '#fbf6ec' : '#e8484a';
    g.fillRect(14 + x * 12, 14 + y * 12, 12, 12);
  }
  g.strokeStyle = ink;
  g.lineWidth = 2.5;
  g.strokeRect(14, 14, 36, 36);
};

const picado = (color: string): Draw => (g) => {
  blob(g, () => {
    g.moveTo(10, 12);
    g.lineTo(54, 12);
    g.lineTo(54, 46);
    for (let i = 4; i >= 0; i--) g.lineTo(10 + i * 11, i % 2 ? 52 : 46);
    g.closePath();
  }, color);
  g.globalCompositeOperation = 'destination-out';
  for (const [x, y] of [[22, 24], [42, 24], [32, 36]]) {
    g.beginPath();
    g.arc(x, y, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
};

const chili: Draw = (g) => {
  blob(g, () => {
    g.moveTo(14, 18);
    g.bezierCurveTo(30, 18, 54, 30, 50, 54);
    g.bezierCurveTo(40, 40, 20, 34, 12, 26);
    g.closePath();
  }, '#d62828');
  g.fillStyle = '#4c8c2b';
  g.beginPath();
  g.ellipse(13, 20, 6, 4, -0.4, 0, Math.PI * 2);
  g.fill();
};

const marigold: Draw = (g) => {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    blob(g, () => g.ellipse(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 10, 7, a, 0, Math.PI * 2), i % 2 ? '#ff9f1c' : '#ffbf3c', 'rgba(150,70,10,0.4)');
  }
  g.fillStyle = '#c45a10';
  g.beginPath();
  g.arc(32, 32, 7, 0, Math.PI * 2);
  g.fill();
};

const lime: Draw = (g) => {
  blob(g, () => g.arc(32, 32, 24, 0, Math.PI * 2), '#5aa02c');
  g.fillStyle = '#d9f08f';
  g.beginPath();
  g.arc(32, 32, 19, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f4fbd8';
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18);
    g.stroke();
  }
};

const SETS: Record<string, Draw[]> = {
  trattoria: [farfalle, basil, tomatoSlice, tricolore],
  diner: [sprinkle('#ff7eb6'), sprinkle('#59c3f0'), star, cherry, checker],
  taqueria: [picado('#ff5d8f'), picado('#2ec4b6'), picado('#ffbf3c'), chili, marigold, lime],
};

const cache = new Map<string, THREE.Texture[]>();

/** The confetti shapes of a kitchen (by theme id), drawn once. */
export function confettiShapes(kitchen: string): THREE.Texture[] {
  const key = SETS[kitchen] ? kitchen : 'trattoria';
  let list = cache.get(key);
  if (!list) cache.set(key, (list = SETS[key].map(tex)));
  return list;
}

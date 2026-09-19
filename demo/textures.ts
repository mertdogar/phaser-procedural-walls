import Phaser from "phaser";

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function makeTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: Painter, noise = 12) {
  const canvas = scene.textures.createCanvas(key, w, h)!;
  const ctx = canvas.context;
  paint(ctx, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noise;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

const rgb = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;

const bricks: Painter = (ctx, w, h) => {
  ctx.fillStyle = rgb(150, 130, 120);
  ctx.fillRect(0, 0, w, h);
  const bw = 32, bh = 16;
  for (let y = 0; y < h; y += bh) {
    const shift = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < w + bw; x += bw) {
      const t = 165 + Math.floor(Math.random() * 25);
      ctx.fillStyle = rgb(t, t - 45, t - 60);
      ctx.fillRect(x + shift + 1, y + 1, bw - 2, bh - 2);
    }
  }
};

const stone: Painter = (ctx, w, h) => {
  ctx.fillStyle = rgb(95, 95, 100);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const sw = 14 + Math.random() * 22, sh = 10 + Math.random() * 14;
    const x = Math.random() * w - sw / 2, y = Math.random() * h - sh / 2;
    const t = 120 + Math.floor(Math.random() * 40);
    ctx.fillStyle = rgb(t, t, t + 5);
    ctx.beginPath();
    ctx.roundRect(x, y, sw, sh, 4);
    ctx.fill();
  }
};

const planks: Painter = (ctx, w, h) => {
  ctx.fillStyle = rgb(120, 76, 46);
  ctx.fillRect(0, 0, w, h);
  const ph = 16;
  for (let y = 0; y < h; y += ph) {
    const t = 130 + Math.floor(Math.random() * 20);
    ctx.fillStyle = rgb(t, t - 50, t - 80);
    ctx.fillRect(0, y + 1, w, ph - 2);
    ctx.fillStyle = rgb(100, 60, 35);
    ctx.fillRect(Math.random() * w, y + 1, 2, ph - 2);
    for (let g = 0; g < 3; g++) {
      ctx.fillStyle = `rgba(80,45,25,0.35)`;
      ctx.fillRect(0, y + 3 + Math.random() * (ph - 6), w, 1);
    }
  }
};

const plaster: Painter = (ctx, w, h) => {
  ctx.fillStyle = rgb(196, 176, 160);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(120,100,90,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2 + Math.random() * 4);
  }
};

const panel: Painter = (ctx, w, h) => {
  ctx.fillStyle = rgb(130, 108, 96);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgb(110, 90, 80);
  ctx.fillRect(0, 0, w, 6);
  ctx.fillStyle = rgb(95, 70, 55);
  ctx.fillRect(0, h - 8, w, 8);
  ctx.fillStyle = rgb(150, 126, 112);
  ctx.fillRect(0, 6, w, 2);
};

export function makeWallTextures(scene: Phaser.Scene) {
  makeTexture(scene, "bricks", 64, 64, bricks, 18);
  makeTexture(scene, "stone", 64, 64, stone, 16);
  makeTexture(scene, "planks", 64, 64, planks, 14);
  makeTexture(scene, "plaster", 64, 64, plaster, 10);
  makeTexture(scene, "panel", 64, 44, panel, 8);
}

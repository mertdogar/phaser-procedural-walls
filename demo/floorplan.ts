import type { WallMapConfig, WallSpec, WindowSpec } from "../src/types";

const win = (...offsets: number[]): WindowSpec[] => offsets.map((offset) => ({ offset, width: 60 }));
const ext = (x1: number, y1: number, x2: number, y2: number, windows?: WindowSpec[]): WallSpec =>
  ({ x1, y1, x2, y2, thickness: 22, preset: "exterior", windows });
const int = (x1: number, y1: number, x2: number, y2: number): WallSpec =>
  ({ x1, y1, x2, y2, thickness: 18, preset: "interior" });

export const presets: WallMapConfig["presets"] = {
  exterior: {
    fill: 0xb59a8c, edge: 0x4a3830, edgeWidth: 2,
    lipHeight: 88, lipFill: 0x8f7a70,
    windowFill: 0x3b7d86, windowFrame: 0x24484d, windowInset: 0.55, sillHeight: 12,
    texture: "bricks", lipTexture: "bricks",
  },
  interior: {
    fill: 0xc2a89a, edge: 0x4a3830, edgeWidth: 2,
    lipHeight: 88, lipFill: 0x9a857a,
    windowFill: 0x3b7d86, windowInset: 0.55, sillHeight: 12,
    texture: "plaster", lipTexture: "panel",
  },
  planks: {
    fill: 0x8a5a3a, edge: 0x3f2818, edgeWidth: 2,
    lipHeight: 88, lipFill: 0x6b4630,
    windowFill: 0x3b7d86, windowInset: 0.55, sillHeight: 12,
    texture: "planks", lipTexture: "planks",
  },
  stone: {
    fill: 0x707075, edge: 0x2e2e33, edgeWidth: 2,
    lipHeight: 88, lipFill: 0x55555a,
    windowFill: 0x3b7d86, windowInset: 0.55, sillHeight: 12,
    texture: "stone", lipTexture: "stone",
  },
};

export const walls: WallSpec[] = [
  // exterior shell
  ext(260, 135, 1735, 135, win(70, 185, 295, 470, 710, 830, 950, 1115, 1340)),
  ext(260, 135, 260, 960),
  ext(1735, 135, 1735, 1195),
  ext(260, 960, 675, 960),
  ext(675, 960, 675, 1300),
  ext(675, 1300, 935, 1300, win(50, 160)),
  ext(1060, 1300, 1320, 1300, win(30, 150)),
  ext(1320, 960, 1320, 1300),
  ext(1320, 1195, 1735, 1195, win(65, 190, 315)),

  // hall / main separation with entrance gap
  int(675, 960, 945, 960),
  int(1050, 960, 1320, 960),
  // dining / main separation with door gap
  int(1320, 960, 1480, 960),
  int(1575, 960, 1735, 960),

  // kitchen
  { ...int(260, 320, 630, 320), preset: "planks" },
  { ...int(630, 320, 630, 695), preset: "planks" },
  { ...int(260, 695, 440, 695), preset: "planks" },
  { ...int(545, 695, 630, 695), preset: "planks" },

  // two small rooms top-right
  int(1255, 135, 1255, 520),
  int(1490, 135, 1490, 425),
  int(1255, 425, 1315, 425),
  int(1420, 425, 1555, 425),
  int(1650, 425, 1735, 425),
  int(1255, 520, 1735, 520),

  // meeting room
  { ...int(1320, 520, 1320, 960), preset: "stone" },
  { ...int(1320, 800, 1480, 800), preset: "stone" },
  { ...int(1575, 800, 1735, 800), preset: "stone" },
];

export const floors: { x: number; y: number; w: number; h: number; color: number }[] = [
  { x: 260, y: 135, w: 1475, h: 825, color: 0xb6804f },
  { x: 260, y: 320, w: 370, h: 375, color: 0x5c3a2a },
  { x: 675, y: 960, w: 645, h: 340, color: 0xb6804f },
  { x: 1320, y: 960, w: 415, h: 235, color: 0x6f8a70 },
  { x: 670, y: 530, w: 645, h: 400, color: 0x4f8a70 },
  { x: 1320, y: 520, w: 415, h: 280, color: 0x8d9bb0 },
  { x: 810, y: 250, w: 370, h: 170, color: 0x3f5f95 },
];

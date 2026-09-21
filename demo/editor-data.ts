import type { WallMapConfig as BaseWallMapConfig, WallSpec } from "../src/types";
import { resolveWalls } from "../src/geometry";

export interface WallMapConfig extends BaseWallMapConfig {
  textures?: Record<string, string>;
}

export const GRID_SIZE = 32;

export function getMapBounds(config: WallMapConfig) {
  const rects = resolveWalls(config.walls, config.presets).flatMap((wall) => [wall.body, ...(wall.lip ? [wall.lip] : [])]);
  if (!rects.length) return { x: 0, y: 0, width: 960, height: 640 };
  const left = Math.min(...rects.map((r) => r.x)) - GRID_SIZE * 2;
  const top = Math.min(...rects.map((r) => r.y)) - GRID_SIZE * 2;
  const right = Math.max(...rects.map((r) => r.x + r.w)) + GRID_SIZE * 2;
  const bottom = Math.max(...rects.map((r) => r.y + r.h)) + GRID_SIZE * 2;
  const width = Math.max(960, right - left);
  const height = Math.max(640, bottom - top);
  return { x: (left + right - width) / 2, y: (top + bottom - height) / 2, width, height };
}

export const initialConfig: WallMapConfig = {
  presets: {
    exterior: {
      fill: 0xd8c4a5,
      edge: 0x2e332d,
      edgeWidth: 2,
      lipHeight: 24,
      lipFill: 0xb39b79,
      windowFill: 0x8fc7d2,
      windowFrame: 0x315c64,
      windowInset: 0.65,
      sillHeight: 5,
      windowAlpha: 0.72,
    },
    interior: {
      fill: 0xe7ded0,
      edge: 0x3c403a,
      edgeWidth: 2,
      lipHeight: 18,
      lipFill: 0xc8bbab,
      windowFill: 0x9fcbd3,
      windowFrame: 0x315c64,
      windowInset: 0.65,
      sillHeight: 4,
      windowAlpha: 0.7,
    },
    accent: {
      fill: 0x78937c,
      edge: 0x2c4132,
      edgeWidth: 2,
      lipHeight: 18,
      lipFill: 0x526f5a,
    },
  },
  walls: [
    wall(128, 96, 832, 96, "exterior", [{ offset: 160, width: 96 }, { offset: 448, width: 96 }]),
    wall(128, 96, 128, 544, "exterior"),
    wall(832, 96, 832, 544, "exterior"),
    wall(128, 544, 832, 544, "exterior", [{ offset: 304, width: 96 }]),
    wall(448, 96, 448, 320, "interior"),
    wall(448, 416, 448, 544, "interior"),
    wall(448, 320, 640, 320, "accent"),
    wall(736, 320, 832, 320, "accent"),
  ],
  collide: true,
};

function wall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  preset: string,
  windows?: WallSpec["windows"],
): WallSpec {
  return { x1, y1, x2, y2, thickness: preset === "exterior" ? 20 : 16, preset, windows };
}

export function parseWallConfig(value: string): WallMapConfig {
  const parsed = JSON.parse(value) as WallMapConfig;
  if (!parsed || typeof parsed !== "object" || !parsed.presets || !Array.isArray(parsed.walls)) {
    throw new Error("Expected an object with presets and walls.");
  }
  if (parsed.textures && (typeof parsed.textures !== "object" || Array.isArray(parsed.textures) || Object.values(parsed.textures).some((source) => typeof source !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(source)))) {
    throw new Error("Textures must contain embedded PNG, JPEG, or WebP images.");
  }
  for (const [index, item] of parsed.walls.entries()) {
    if (
      typeof item.x1 !== "number" ||
      typeof item.y1 !== "number" ||
      typeof item.x2 !== "number" ||
      typeof item.y2 !== "number" ||
      typeof item.thickness !== "number" ||
      (item.height !== undefined && typeof item.height !== "number") ||
      (item.depth !== undefined && typeof item.depth !== "number") ||
      typeof item.preset !== "string"
    ) {
      throw new Error(`Wall ${index + 1} is missing required fields.`);
    }
  }
  return parsed;
}

export function serializeWallConfig(config: WallMapConfig): string {
  return JSON.stringify(config, null, 2);
}

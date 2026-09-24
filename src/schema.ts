import { resolveWalls } from "./geometry";
import type { LegacyWallMapConfig, WallMapConfig } from "./types";

export function migrateWallConfig(value: unknown): WallMapConfig & { version: 2 } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object with presets and walls.");
  }
  const input = value as WallMapConfig | LegacyWallMapConfig;
  if (input.version !== undefined && input.version !== 1 && input.version !== 2) {
    throw new Error(`Unsupported wall map version "${input.version}". Supported versions are 1 and 2.`);
  }
  if (!input.presets || typeof input.presets !== "object" || Array.isArray(input.presets) || !Array.isArray(input.walls)) {
    throw new Error("Expected an object with presets and walls.");
  }
  for (const wall of input.walls) {
    if (!wall || typeof wall.preset !== "string" || ![wall.x1, wall.y1, wall.x2, wall.y2, wall.thickness].every(Number.isFinite)) {
      throw new Error("Wall is missing finite endpoints, thickness, or a preset.");
    }
    if ((wall.height !== undefined && !Number.isFinite(wall.height)) || (wall.depth !== undefined && !Number.isFinite(wall.depth))) {
      throw new Error("Wall height and depth must be finite numbers when provided.");
    }
    if (!input.presets[wall.preset]) throw new Error(`Unknown wall preset "${wall.preset}"`);
    if (wall.windows !== undefined && !Array.isArray(wall.windows)) throw new Error("Wall windows must be an array");
    if (wall.doors !== undefined && !Array.isArray(wall.doors)) throw new Error("Wall doors must be an array");
  }
  const config: WallMapConfig & { version: 2 } = input.version === 1 ? {
    ...input,
    version: 2,
    presets: Object.fromEntries(Object.entries(input.presets).map(([key, preset]) => {
      const { sillHeight, ...rest } = preset;
      return [key, { ...rest, ...(sillHeight === undefined ? {} : { sillThickness: sillHeight }) }];
    })),
    walls: input.walls.map((wall) => {
      const { windows, doors, ...rest } = wall;
      const preset = input.presets[wall.preset];
      const height = wall.height ?? preset.lipHeight ?? 0;
      const inset = preset.windowInset ?? 0.6;
      return {
        ...rest,
        y1: wall.y1 + height,
        y2: wall.y2 + height,
        ...(windows ? { windows: windows.map((window) => {
          const windowHeight = Math.round(height * inset);
          const floorSouth = wall.y1 + height + wall.thickness / 2;
          const top = Math.round(wall.y1 + wall.thickness / 2 + height * (1 - inset) / 2);
          return { ...window, height: windowHeight, sillHeight: wall.y1 === wall.y2
            ? floorSouth - top - windowHeight : (height - windowHeight) / 2 };
        }) } : {}),
        ...(doors ? { doors: doors.map((door) => ({ ...door, height })) } : {}),
      };
    }),
  } : { ...input, version: 2 };
  resolveWalls(config.walls, config.presets);
  return config;
}

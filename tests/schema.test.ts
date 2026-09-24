import { describe, expect, it } from "vitest";
import { migrateWallConfig } from "../src/schema";
import { resolveWalls } from "../src/geometry";
import { parseWallConfig, serializeWallConfig } from "../demo/editor-data";
import type { LegacyWallMapConfig } from "../src/types";

const legacy = (): LegacyWallMapConfig => ({
  version: 1,
  presets: { wall: { fill: 0, edge: 0, lipHeight: 60, windowInset: 0.55, sillHeight: 4 } },
  walls: [{ x1: 100, y1: 100.25, x2: 500, y2: 100.25, thickness: 12, preset: "wall",
    windows: [{ offset: 50, width: 80 }],
    doors: [{ id: "entry", type: "hinged", offset: 200, width: 80, open: true }], depth: 200 }],
});

describe("map schema migration", () => {
  it("preserves horizontal window geometry, floor collision, metadata, and input", () => {
    const input = { ...legacy(), textures: { oak: "data:image/png;base64,AAAA" }, name: "Office" };
    const original = structuredClone(input);
    const result = migrateWallConfig(input);
    expect(input).toEqual(original);
    expect(result).toMatchObject({ version: 2, textures: input.textures, name: "Office" });
    expect(result.presets.wall.sillThickness).toBe(4);
    expect(result.presets.wall).not.toHaveProperty("sillHeight");
    expect(result.walls[0]).toMatchObject({ y1: 160.25, y2: 160.25, depth: 200,
      doors: [{ height: 60, open: true }] });
    const [wall] = resolveWalls(result.walls, result.presets);
    expect(wall.windows[0]).toEqual({ x: 150, y: 120, w: 80, h: 33 });
    expect(wall.collider).toEqual({ x: 100, y: 154.25, w: 400, h: 12 });
    expect(migrateWallConfig(result)).toEqual(result);
  });

  it("uses per-wall height and preserves reversed endpoints and opening offsets", () => {
    const input = legacy();
    input.walls[0] = { ...input.walls[0], x1: 100, x2: 100, y1: 500, y2: 100, height: 80 };
    const result = migrateWallConfig(input);
    expect(result.walls[0]).toMatchObject({ y1: 580, y2: 180,
      windows: [{ offset: 50, height: 44, sillHeight: 18 }], doors: [{ height: 80 }] });
  });

  it("treats unversioned current maps as v2 and stamps editor exports", () => {
    const { version: _, ...current } = migrateWallConfig(legacy());
    expect(migrateWallConfig(current)).toEqual({ ...current, version: 2 });
    expect(parseWallConfig(serializeWallConfig(current))).toEqual({ ...current, version: 2 });
    expect(parseWallConfig(JSON.stringify(legacy()))).toEqual(migrateWallConfig(legacy()));
  });

  it.each([0, 3, "1", null])("rejects unsupported version %s", (version) => {
    expect(() => migrateWallConfig({ ...legacy(), version })).toThrow(/Unsupported wall map version/);
  });

  it("rejects openings that cannot fit instead of silently resizing them", () => {
    const input = legacy();
    input.walls[0].height = 0;
    expect(() => migrateWallConfig(input)).toThrow(/fit/);
    const current = migrateWallConfig(legacy());
    delete (current.walls[0].windows![0] as { height?: number }).height;
    expect(() => migrateWallConfig(current)).toThrow(/height/);
  });
});

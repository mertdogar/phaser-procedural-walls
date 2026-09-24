import { describe, expect, it } from "vitest";
import { cutRects, resolveWalls } from "../src/geometry";
import type { Rect, WallSpec } from "../src/types";

const presets = { p: { fill: 0, edge: 0, lipHeight: 100 } };
const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSpec> = {}): WallSpec =>
  ({ x1, y1, x2, y2, thickness: 20, preset: "p", ...extra });
const door = { id: "entry", type: "hinged" as const, offset: 40, width: 60, height: 80 };
const window = { offset: 40, width: 60, height: 20, sillHeight: 80 };
const area = (rects: Rect[]) => rects.reduce((sum, rect) => sum + rect.w * rect.h, 0);
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("floor-based walls", () => {
  it("rejects diagonal walls and unknown presets", () => {
    expect(() => resolveWalls([wall(0, 0, 10, 10)], presets)).toThrow(/axis-aligned/);
    expect(() => resolveWalls([wall(0, 0, 100, 0, { preset: "missing" })], presets)).toThrow(/Unknown/);
  });
  it.each([0, 24, 80, 160])("keeps connected footprints and depth fixed at height %s", (height) => {
    const [h, v] = resolveWalls([wall(0, 0, 200, 0, { height }), wall(0, 0, 0, 200, { height: 60 })], presets);
    expect(h.collider).toEqual({ x: -10, y: -10, w: 210, h: 20 });
    expect(v.collider).toEqual({ x: -10, y: -10, w: 20, h: 210 });
    expect(h.body.y).toBe(-10 - height);
    expect(v.body.y).toBe(-70);
    expect(h.depth).toBe(10);
    expect(v.depth).toBe(200);
  });
  it("extends only the stem at a T junction", () => {
    const [bar, stem] = resolveWalls([wall(0, 0, 200, 0), wall(100, 0, 100, 50, { thickness: 10 })], presets);
    expect(bar.collider).toEqual({ x: 0, y: -10, w: 200, h: 20 });
    expect(stem.collider).toEqual({ x: 95, y: -10, w: 10, h: 60 });
  });
  it.each([8, 20, 40])("centers thickness %s on the floor line", (thickness) => {
    const [w] = resolveWalls([wall(0, 0, 100, 0, { thickness })], presets);
    expect(w.collider).toEqual({ x: 0, y: -thickness / 2, w: 100, h: thickness });
  });
  it("supports explicit depth without moving collision", () => {
    const [w] = resolveWalls([wall(0, 0, 100, 0, { depth: 500 })], presets);
    expect(w.depth).toBe(500);
    expect(w.collider.y).toBe(-10);
    expect(w.surfaces.every((s) => s.depth >= 500 && s.depth < 501)).toBe(true);
  });
});

describe("openings", () => {
  it.each([true, false])("keeps door passages fixed when height changes (horizontal=%s)", (horizontal) => {
    for (const height of [80, 100, 160]) {
      const [w] = resolveWalls([wall(0, 0, horizontal ? 200 : 0, horizontal ? 0 : 200, { height, doors: [door] })], presets);
      const r = w.doors[0].collider;
      expect(r).toEqual(horizontal ? { x: 40, y: -10, w: 60, h: 20 } : { x: -10, y: 40, w: 20, h: 60 });
      expect(w.colliderPieces.some((piece) => intersects(piece, r))).toBe(false);
      expect(area(w.colliderPieces)).toBe(140 * 20);
    }
  });
  it("projects both vertical segments upward, leaving the rear end face behind the door", () => {
    const [w] = resolveWalls([wall(0, 0, 0, 200, { height: 80, doors: [door] })], presets);
    expect(w.bodyPieces).toEqual([{ x: -10, y: -80, w: 20, h: 40 }, { x: -10, y: 20, w: 20, h: 100 }]);
    expect(w.lipPieces).toEqual([{ x: -10, y: -40, w: 20, h: 80 }, { x: -10, y: 120, w: 20, h: 80 }]);
    expect(w.surfaces.find((s) => s.kind === "lip" && s.rect.y === -40)?.depth).toBe(40);
    expect(w.surfaces.find((s) => s.kind === "body" && s.rect.y === 20)!.depth).toBeGreaterThan(100);
  });
  it("retains a header above a short door", () => {
    const [w] = resolveWalls([wall(0, 0, 200, 0, { doors: [door] })], presets);
    const header = { x: 40, y: -90, w: 60, h: 20 };
    expect(w.lipPieces.some((piece) => intersects(piece, header))).toBe(true);
    expect(w.lipPieces.some((piece) => intersects(piece, { ...header, y: -70, h: 80 }))).toBe(false);
    expect(w.bodyPieces).toEqual([w.body]);
  });
  it("keeps window height and elevation fixed when the wall gets taller", () => {
    const specs = [100, 160].map((height) => resolveWalls([wall(0, 0, 200, 0, { height, windows: [window] })], presets)[0]);
    expect(specs[0].windows).toEqual([{ x: 40, y: -90, w: 60, h: 20 }]);
    expect(specs[1].windows).toEqual(specs[0].windows);
    expect(specs[1].colliderPieces).toEqual([specs[1].collider]);
  });
  it("separates decorative sill thickness from floor elevation", () => {
    const spec = wall(0, 0, 200, 0, { windows: [window] });
    const [w] = resolveWalls([spec], { p: { ...presets.p, sillThickness: 5 } });
    expect(w.sills).toEqual([{ x: 40, y: -75, w: 60, h: 5 }]);
    expect(resolveWalls([spec], { p: { ...presets.p, sillThickness: 0 } })[0].sills).toEqual([]);
  });
  it("allows transoms above doors and stacked windows without removing the wall between them", () => {
    const windows = [{ ...window, sillHeight: 90, height: 10 }, { ...window, sillHeight: 110, height: 10 }];
    const [w] = resolveWalls([wall(0, 0, 200, 0, { height: 140, doors: [door], windows })], presets);
    expect(area(w.lipPieces)).toBe(200 * 140 - 60 * 100);
    expect(w.lipPieces.some((r) => intersects(r, { x: 40, y: -100, w: 60, h: 10 }))).toBe(true);
    expect(area(w.colliderPieces)).toBe(140 * 20);
  });
  it.each([true, false])("normalizes reversed opening offsets and hinges (horizontal=%s)", (horizontal) => {
    const [w] = resolveWalls([wall(horizontal ? 200 : 0, horizontal ? 0 : 200, 0, 0, { doors: [door], windows: [window] })], presets);
    expect(w.doors[0].spec).toMatchObject({ offset: 100, side: "end", swing: "right", height: 80 });
    expect(w.spec.windows![0]).toEqual({ ...window, offset: 100 });
    expect(horizontal ? w.doors[0].collider.x : w.doors[0].collider.y).toBe(100);
  });
  it.each([
    { height: undefined }, { height: 0 }, { height: -1 }, { height: 101 }, { height: NaN },
    { offset: -1 }, { offset: 180 }, { width: 0 }, { width: Infinity },
  ])("rejects invalid door dimensions %j", (patch) => {
    expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [{ ...door, ...patch } as typeof door] })], presets)).toThrow(/fit/);
  });
  it.each([{ sillHeight: undefined }, { sillHeight: -1 }, { height: undefined }, { height: 21 }, { offset: NaN }])("rejects invalid window dimensions %j", (patch) => {
    expect(() => resolveWalls([wall(0, 0, 200, 0, { windows: [{ ...window, ...patch } as typeof window] })], presets)).toThrow(/fit/);
  });
  it("rejects overlap in elevation and position, while allowing touching edges", () => {
    expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [door], windows: [window] })], presets)).not.toThrow();
    expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [door], windows: [{ ...window, sillHeight: 79 }] })], presets)).toThrow(/overlaps/);
    expect(() => resolveWalls([wall(0, 0, 200, 0, { windows: [window, window] })], presets)).toThrow(/overlaps/);
    expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [door, { ...door, id: "next", offset: 100 }] })], presets)).not.toThrow();
  });
  it("rejects duplicate door IDs across walls and invalid door options", () => {
    expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [door] }), wall(0, 200, 200, 200, { doors: [door] })], presets)).toThrow(/Duplicate/);
    for (const patch of [{ id: "" }, { type: "other" }, { open: "true" }, { side: "up" }, { swing: "up" }]) {
      expect(() => resolveWalls([wall(0, 0, 200, 0, { doors: [{ ...door, ...patch } as typeof door] })], presets)).toThrow();
    }
  });
  it("rejects negative wall height and openings in zero-height walls", () => {
    expect(() => resolveWalls([wall(0, 0, 200, 0, { height: -1 })], presets)).toThrow(/height/);
    expect(() => resolveWalls([wall(0, 0, 200, 0, { height: 0, doors: [door] })], presets)).toThrow(/fit/);
  });
});

it("subtracts differently placed holes without losing solid areas between them", () => {
  const holes = [{ x: 10, y: 5, w: 20, h: 10 }, { x: 10, y: 20, w: 20, h: 10 }, { x: 60, y: 8, w: 20, h: 15 }];
  for (const horizontal of [true, false]) {
    const pieces = cutRects({ x: 0, y: 0, w: 100, h: 40 }, holes, horizontal);
    expect(area(pieces)).toBe(3300);
    expect(pieces.some((piece) => holes.some((hole) => intersects(piece, hole)))).toBe(false);
  }
});


it("moves every vertical surface by the same drawing-order override without changing its floor position", () => {
  const spec = wall(0, 0, 0, 200, { doors: [door] });
  const [automatic] = resolveWalls([spec], presets);
  const [overridden] = resolveWalls([{ ...spec, depth: 500 }], presets);
  expect(overridden.surfaces.map((s) => s.floorY)).toEqual(automatic.surfaces.map((s) => s.floorY));
  for (const [index, surface] of overridden.surfaces.entries()) {
    expect(surface.depth - automatic.surfaces[index].depth).toBeCloseTo(300);
  }
});

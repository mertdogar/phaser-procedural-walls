import { describe, expect, it } from "vitest";
import { cutRects, resolveWalls } from "../src/geometry";
import type { WallSpec } from "../src/types";

const presets = { p: { fill: 0, edge: 0, lipHeight: 10 }, flat: { fill: 0, edge: 0 } };
const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSpec> = {}): WallSpec =>
  ({ x1, y1, x2, y2, thickness: 20, preset: "p", ...extra });

describe("resolveWalls", () => {
  it("rejects diagonal walls", () => {
    expect(() => resolveWalls([wall(0, 0, 10, 10)], presets)).toThrow(/axis-aligned/);
  });

  it("extends both walls at an L corner by half the other's thickness", () => {
    const [h, v] = resolveWalls([wall(0, 0, 100, 0), wall(0, 0, 0, 100)], presets);
    expect(h.body).toEqual({ x: -10, y: -10, w: 110, h: 20 });
    expect(v.body).toEqual({ x: -10, y: -10, w: 20, h: 110 });
  });

  it("extends only the stem at a T junction", () => {
    const [bar, stem] = resolveWalls([wall(0, 0, 200, 0), wall(100, 0, 100, 50, { thickness: 10 })], presets);
    expect(bar.body).toEqual({ x: 0, y: -10, w: 200, h: 20 });
    expect(stem.body).toEqual({ x: 95, y: -10, w: 10, h: 60 });
  });

  it("normalizes reversed walls and remaps window offsets", () => {
    const [w] = resolveWalls([wall(100, 0, 0, 0, { windows: [{ offset: 10, width: 20 }] })], presets);
    expect(w.spec.x1).toBe(0);
    expect(w.windows[0].x).toBe(70);
  });

  it("puts windows on the lip when there is one, else in the body", () => {
    const [withLip] = resolveWalls([wall(0, 0, 100, 0, { windows: [{ offset: 30, width: 20 }] })], presets);
    expect(withLip.windows[0]).toEqual({ x: 30, y: 12, w: 20, h: 6 });
    expect(withLip.bodyPieces).toEqual([withLip.body]);
    expect(withLip.lipPieces).toHaveLength(4);
    expect(withLip.sills[0]).toEqual({ x: 30, y: 12, w: 20, h: 6 });
    const [flat] = resolveWalls([wall(0, 0, 100, 0, { preset: "flat", windows: [{ offset: 30, width: 20 }] })], presets);
    expect(flat.windows[0]).toEqual({ x: 30, y: -6, w: 20, h: 12 });
    expect(flat.bodyPieces).toHaveLength(4);
    expect(flat.sills).toEqual([]);
  });

  it.each([8, 20, 40])("uses wall thickness %s for the window sill", (thickness) => {
    const [resolved] = resolveWalls([wall(0, 0, 100, 0, { thickness, height: 100, windows: [{ offset: 30, width: 20 }] })], presets);
    expect(resolved.sills[0].h).toBe(thickness);
    expect(resolved.sills[0].y + resolved.sills[0].h).toBe(resolved.windows[0].y + resolved.windows[0].h);
  });

  it("preserves explicit sill overrides and disabled sills", () => {
    const spec = wall(0, 0, 100, 0, { height: 100, windows: [{ offset: 30, width: 20 }] });
    expect(resolveWalls([spec], { p: { ...presets.p, sillHeight: 5 } })[0].sills[0].h).toBe(5);
    expect(resolveWalls([spec], { p: { ...presets.p, sillHeight: 0 } })[0].sills).toEqual([]);
  });

  it("lets a wall override its preset height", () => {
    const [resolved] = resolveWalls([wall(0, 0, 100, 0, { height: 30 })], presets);
    expect(resolved.lip).toEqual({ x: 0, y: 10, w: 100, h: 30 });
    expect(resolved.depth).toBe(40);
  });

  it("cutRects leaves holes for windows", () => {
    const pieces = cutRects({ x: 0, y: 0, w: 100, h: 20 }, [{ x: 10, y: 5, w: 20, h: 10 }, { x: 60, y: 5, w: 20, h: 10 }], true);
    expect(pieces).toEqual([
      { x: 0, y: 0, w: 100, h: 5 },
      { x: 0, y: 15, w: 100, h: 5 },
      { x: 0, y: 5, w: 10, h: 10 },
      { x: 30, y: 5, w: 30, h: 10 },
      { x: 80, y: 5, w: 20, h: 10 },
    ]);
    expect(cutRects({ x: 0, y: 0, w: 20, h: 100 }, [{ x: 5, y: 40, w: 10, h: 20 }], false)).toHaveLength(4);
  });

  it("depth is the south edge including the lip", () => {
    const [h, v] = resolveWalls([wall(0, 0, 100, 0), wall(0, 0, 0, 100, { preset: "flat" })], presets);
    expect(h.depth).toBe(20);
    expect(v.depth).toBe(100);
    expect(v.lip).toBeNull();
  });

  it("allows a wall to override its automatic drawing depth", () => {
    const [resolved] = resolveWalls([wall(0, 0, 100, 0, { depth: 250 })], presets);
    expect(resolved.depth).toBe(250);
    expect(resolved.collider.y).toBe(0);
  });

  it("projects both wall footprints to the bottom of the face", () => {
    const [h, v] = resolveWalls([wall(0, 0, 100, 0), wall(0, 0, 0, 100)], presets);
    expect(h.collider).toEqual({ x: -10, y: 0, w: 110, h: 20 });
    expect(v.collider).toEqual({ x: -10, y: 0, w: 20, h: 110 });
  });

  it.each([0, 24, 80, 160])("preserves a vertical doorway when face height is %s", (height) => {
    const [upper, lower] = resolveWalls([
      wall(448, 96, 448, 320, { height }),
      wall(448, 544, 448, 416, { height }),
    ], presets);
    expect(upper.collider).toEqual({ x: 438, y: 96 + height, w: 20, h: 224 });
    expect(lower.collider).toEqual({ x: 438, y: 416 + height, w: 20, h: 128 });
    expect(lower.collider.y - (upper.collider.y + upper.collider.h)).toBe(96);
    const feet = { y: 368 + height - 8, h: 8 };
    expect(feet.y).toBeGreaterThan(upper.collider.y + upper.collider.h);
    expect(feet.y + feet.h).toBeLessThan(lower.collider.y);
  });

  it.each([8, 20, 40])("keeps horizontal footprint thickness %s independent of face height", (thickness) => {
    const [resolved] = resolveWalls([wall(0, 0, 100, 0, { height: 80, thickness })], presets);
    expect(resolved.collider).toEqual({ x: 0, y: 80 - thickness / 2, w: 100, h: thickness });
  });
});

describe("door geometry", () => {
  it.each([0, 24, 160])("cuts horizontal and vertical collision passages at height %s", (height) => {
    for (const horizontal of [true, false]) {
      const door = { id: "entry", type: "hinged" as const, offset: 40, width: 60 };
      const [resolved] = resolveWalls([wall(0, 0, horizontal ? 200 : 0, horizontal ? 0 : 200, { height, doors: [door] })], presets);
      const r = resolved.doors[0].collider;
      expect(r).toEqual(horizontal ? { x: 40, y: height - 10, w: 60, h: 20 } : { x: -10, y: height + 40, w: 20, h: 60 });
      expect(resolved.colliderPieces).toHaveLength(2);
      for (const piece of resolved.colliderPieces) {
        expect(piece.x >= r.x + r.w || piece.x + piece.w <= r.x || piece.y >= r.y + r.h || piece.y + piece.h <= r.y).toBe(true);
      }
      expect(resolved.colliderPieces.reduce((sum, piece) => sum + piece.w * piece.h, 0)).toBe(140 * 20);
    }
  });

  it.each([0, 24, 80, 160])("projects vertical doorway tops and exposed faces at height %s", (height) => {
    const [resolved] = resolveWalls([wall(0, 0, 0, 200, { height, doors: [
      { id: "entry", type: "sliding", offset: 40, width: 60 },
    ] })], presets);
    expect(resolved.bodyPieces).toEqual([
      { x: -10, y: 0, w: 20, h: 40 },
      ...(100 + height < 200 ? [{ x: -10, y: 100 + height, w: 20, h: 100 - height }] : []),
    ]);
    expect(resolved.lipPieces).toEqual(height ? [
      { x: -10, y: 40, w: 20, h: height },
      ...(100 + height < 200 ? [{ x: -10, y: 200, w: 20, h: height }] : []),
    ] : []);
    expect(resolved.doors[0].collider).toEqual({ x: -10, y: 40 + height, w: 20, h: 60 });
  });

  it("keeps windows intact while cutting a full-height horizontal doorway", () => {
    const [resolved] = resolveWalls([wall(0, 0, 300, 0, { height: 80, windows: [{ offset: 20, width: 60 }], doors: [{ id: "entry", type: "sliding", offset: 150, width: 70 }] })], presets);
    expect(resolved.windows).toHaveLength(1);
    expect(resolved.sills).toHaveLength(1);
    for (const rect of [...resolved.bodyPieces, ...resolved.lipPieces]) {
      expect(rect.x + rect.w <= 150 || rect.x >= 220).toBe(true);
    }
  });

  it.each([true, false])("preserves door world placement and directions on reversed walls (horizontal=%s)", (horizontal) => {
    const [resolved] = resolveWalls([wall(horizontal ? 200 : 0, horizontal ? 0 : 200, 0, 0, {
      doors: [{ id: "reverse", type: "hinged", offset: 20, width: 40 }],
    })], presets);
    expect(resolved.doors[0].spec).toMatchObject({ offset: 140, side: "end", swing: "right" });
    expect(horizontal ? resolved.doors[0].collider.x : resolved.doors[0].collider.y).toBe(horizontal ? 140 : 150);
  });

  it("accepts touching openings and doors at wall endpoints", () => {
    expect(() => resolveWalls([wall(0, 0, 100, 0, { doors: [
      { id: "a", type: "hinged", offset: 0, width: 40 },
      { id: "b", type: "sliding", offset: 40, width: 60 },
    ] })], presets)).not.toThrow();
  });

  it.each([
    [{ id: "a", type: "hinged", offset: -1, width: 20 }, /fit/],
    [{ id: "a", type: "hinged", offset: 90, width: 20 }, /fit/],
    [{ id: "a", type: "hinged", offset: 10, width: 0 }, /fit/],
    [{ id: "a", type: "hinged", offset: NaN, width: 20 }, /fit/],
    [{ id: "a", type: "other", offset: 10, width: 20 }, /type/],
    [{ id: "", type: "hinged", offset: 10, width: 20 }, /ID/],
    [{ id: "a", type: "hinged", offset: 10, width: 20, open: "true" }, /boolean/],
    [{ id: "a", type: "hinged", offset: 10, width: 20, side: "up" }, /side/],
    [{ id: "a", type: "hinged", offset: 10, width: 20, swing: "up" }, /swing/],
  ])("rejects invalid door data %j", (door, error) => {
    expect(() => resolveWalls([wall(0, 0, 100, 0, { doors: [door] as WallSpec["doors"] })], presets)).toThrow(error);
  });

  it("rejects duplicate IDs across walls and overlapping openings", () => {
    const door = { id: "a", type: "hinged" as const, offset: 20, width: 40 };
    expect(() => resolveWalls([wall(0, 0, 100, 0, { doors: [door] }), wall(0, 100, 100, 100, { doors: [door] })], presets)).toThrow(/Duplicate/);
    expect(() => resolveWalls([wall(0, 0, 100, 0, { doors: [door], windows: [{ offset: 50, width: 20 }] })], presets)).toThrow(/overlaps/);
    expect(() => resolveWalls([wall(0, 0, 100, 0, { doors: [door, { ...door, id: "b" }] })], presets)).toThrow(/overlaps/);
  });
});

it("treats negative face height as disabled for door placement too", () => {
  const doors = [{ id: "entry", type: "hinged" as const, offset: 40, width: 60 }];
  const [resolved] = resolveWalls([wall(0, 0, 0, 200, { height: -20, doors })], presets);
  expect(resolved.doors[0].collider).toEqual({ x: -10, y: 40, w: 20, h: 60 });
  expect(resolved.colliderPieces).toHaveLength(2);
});

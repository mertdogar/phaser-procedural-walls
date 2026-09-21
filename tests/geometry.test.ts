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

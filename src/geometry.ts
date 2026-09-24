import type { Rect, ResolvedWall, WallPreset, WallSpec, WallSurface } from "./types";

const DEFAULTS = { lipHeight: 0, windowInset: 0.6 };

function normalize(w: WallSpec): WallSpec {
  if (w.x1 !== w.x2 && w.y1 !== w.y2) {
    throw new Error(`Wall is not axis-aligned: (${w.x1},${w.y1})-(${w.x2},${w.y2})`);
  }
  const flipped = w.x1 > w.x2 || w.y1 > w.y2;
  if (!flipped) return w;
  const length = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
  return {
    ...w,
    x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1,
    windows: w.windows?.map((win) => ({ ...win, offset: length - win.offset - win.width })),
    doors: w.doors?.map((door) => ({
      ...door, offset: length - door.offset - door.width,
      side: (door.side ?? "start") === "start" ? "end" : "start",
      swing: (door.swing ?? "left") === "left" ? "right" : "left",
    })),
  };
}

function pointOnWall(px: number, py: number, w: WallSpec): boolean {
  const onX = px >= Math.min(w.x1, w.x2) && px <= Math.max(w.x1, w.x2);
  const onY = py >= Math.min(w.y1, w.y2) && py <= Math.max(w.y1, w.y2);
  return onX && onY;
}

export function endExtension(px: number, py: number, self: WallSpec, all: WallSpec[]): number {
  let ext = 0;
  for (const other of all) {
    if (other === self) continue;
    if (pointOnWall(px, py, other)) ext = Math.max(ext, other.thickness / 2);
  }
  return ext;
}

export function cutRects(rect: Rect, holes: Rect[], horizontal: boolean): Rect[] {
  return holes.reduce((pieces, hole) => subtractRect(pieces, hole, horizontal), [rect]);
}

export function resolveWalls(
  walls: WallSpec[],
  presets: Record<string, WallPreset>,
): ResolvedWall[] {
  validateOpenings(walls, presets);
  const normalized = walls.map(normalize);
  return normalized.map((w) => {
    const preset = presets[w.preset];
    if (!preset) throw new Error(`Unknown wall preset "${w.preset}"`);
    const height = w.height ?? preset.lipHeight ?? DEFAULTS.lipHeight;
    const t = w.thickness;
    const half = t / 2;
    const extStart = endExtension(w.x1, w.y1, w, normalized);
    const extEnd = endExtension(w.x2, w.y2, w, normalized);
    const horizontal = w.y1 === w.y2;
    const length = horizontal ? w.x2 - w.x1 : w.y2 - w.y1;
    const collider: Rect = horizontal
      ? { x: w.x1 - extStart, y: w.y1 - half, w: length + extStart + extEnd, h: t }
      : { x: w.x1 - half, y: w.y1 - extStart, w: t, h: length + extStart + extEnd };
    const body = { ...collider, y: collider.y - height };
    const lip = height > 0 ? { x: body.x, y: body.y + body.h, w: body.w, h: height } : null;
    const depth = w.depth ?? collider.y + collider.h;
    const doors = (w.doors ?? []).map((spec) => ({
      spec,
      collider: horizontal
        ? { x: w.x1 + spec.offset, y: collider.y, w: spec.width, h: t }
        : { x: collider.x, y: w.y1 + spec.offset, w: t, h: spec.width },
    }));
    const holes = [
      ...(w.windows ?? []).map((win) => ({ x: win.offset, y: win.sillHeight, w: win.width, h: win.height })),
      ...doors.map(({ spec }) => ({ x: spec.offset, y: 0, w: spec.width, h: spec.height })),
    ];
    const surfaces: WallSurface[] = [];
    const bodyPieces: Rect[] = [];
    const lipPieces: Rect[] = [];
    const windows: Rect[] = [];
    const sills: Rect[] = [];
    const add = (rect: Rect, kind: WallSurface["kind"], floorY: number, elevation = 0, texture?: string) => {
      if (rect.w <= 0 || rect.h <= 0) return;
      surfaces.push({ rect, kind, floorY, ...(texture ? { texture } : {}), depth: floorY + (w.depth === undefined ? 0 : w.depth - collider.y - collider.h) + elevation * 0.000001 });
      if (kind === "body") bodyPieces.push(rect);
      if (kind === "lip") lipPieces.push(rect);
      if (kind === "window") windows.push(rect);
      if (kind === "sill") sills.push(rect);
    };
    if (horizontal) {
      const topHoles = holes.filter((hole) => hole.y + hole.h === height)
        .map((hole) => ({ x: w.x1 + hole.x, y: body.y, w: hole.w, h: t }));
      for (const rect of cutRects(body, topHoles, true)) add(rect, "body", collider.y + t, height);
      if (lip) {
        const faceHoles = holes.map((hole) => ({ x: w.x1 + hole.x, y: collider.y + t - hole.y - hole.h, w: hole.w, h: hole.h }));
        for (const rect of cutRects(lip, faceHoles, true)) add(rect, "lip", collider.y + t);
      }
      for (const win of w.windows ?? []) {
        const rect = { x: w.x1 + win.offset, y: collider.y + t - win.sillHeight - win.height, w: win.width, h: win.height };
        if (win.texture && win.sillHeight + win.height === height) { rect.y -= t; rect.h += t; }
        add(rect, "window", collider.y + t, 0, win.texture);
        const sillThickness = win.texture ? 0 : Math.min(preset.sillThickness ?? t, win.height);
        add({ ...rect, y: rect.y + rect.h - sillThickness, h: sillThickness }, "sill", collider.y + t, 0.5);
      }
    } else {
      const solids = height === 0 ? [{ x: -extStart, y: 0, w: length + extStart + extEnd, h: 0 }]
        : cutRects({ x: -extStart, y: 0, w: length + extStart + extEnd, h: height }, holes, true);
      for (const solid of solids) {
        const top = solid.y + solid.h;
        const south = w.y1 + solid.x + solid.w;
        add({ x: body.x, y: w.y1 + solid.x - top, w: t, h: solid.w }, "body", south, top);
        add({ x: body.x, y: south - top, w: t, h: solid.h }, "lip", south, solid.y);
      }
      for (const win of w.windows ?? []) {
        const inset = preset.windowInset ?? DEFAULTS.windowInset;
        add({ x: w.x1 - half * inset, y: w.y1 + win.offset - win.sillHeight - win.height, w: t * inset, h: win.width + win.height },
          "window", w.y1 + win.offset + win.width, win.sillHeight, win.sideTexture);
      }
    }
    const colliderPieces = doors.reduce((pieces, door) => subtractRect(pieces, door.collider, horizontal), [collider]);
    return { spec: w, horizontal, body, lip, bodyPieces, lipPieces, windows, sills, surfaces, collider, colliderPieces, doors, depth };
  });
}

function subtractRect(pieces: Rect[], hole: Rect, horizontal: boolean): Rect[] {
  return pieces.flatMap((rect) => {
    const x = Math.max(rect.x, hole.x);
    const y = Math.max(rect.y, hole.y);
    const w = Math.min(rect.x + rect.w, hole.x + hole.w) - x;
    const h = Math.min(rect.y + rect.h, hole.y + hole.h) - y;
    if (w <= 0 || h <= 0) return [rect];
    return (horizontal ? [
      { x: rect.x, y: rect.y, w: rect.w, h: y - rect.y },
      { x: rect.x, y: y + h, w: rect.w, h: rect.y + rect.h - y - h },
      { x: rect.x, y, w: x - rect.x, h },
      { x: x + w, y, w: rect.x + rect.w - x - w, h },
    ] : [
      { x: rect.x, y: rect.y, w: x - rect.x, h: rect.h },
      { x: x + w, y: rect.y, w: rect.x + rect.w - x - w, h: rect.h },
      { x, y: rect.y, w, h: y - rect.y },
      { x, y: y + h, w, h: rect.y + rect.h - y - h },
    ]).filter((piece) => piece.w > 0 && piece.h > 0);
  });
}

export function validateOpenings(walls: WallSpec[], presets: Record<string, WallPreset>): void {
  const ids = new Set<string>();
  for (const wall of walls) {
    if (wall.doors !== undefined && !Array.isArray(wall.doors)) throw new Error("Wall doors must be an array");
    if (wall.windows !== undefined && !Array.isArray(wall.windows)) throw new Error("Wall windows must be an array");
    if (![wall.x1, wall.y1, wall.x2, wall.y2, wall.thickness].every(Number.isFinite) || wall.thickness <= 0) {
      throw new Error("Wall endpoints must be finite and thickness must be positive");
    }
    const length = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
    for (const door of wall.doors ?? []) {
      if (!door || typeof door.id !== "string" || !door.id.trim()) throw new Error("Every door needs a non-empty ID");
      if (ids.has(door.id)) throw new Error(`Duplicate door ID "${door.id}"`);
      ids.add(door.id);
      for (const pair of [door.texture, door.sideTexture]) {
        if (pair !== undefined && (!pair || typeof pair !== "object" || Array.isArray(pair)
          || typeof pair.closed !== "string" || !pair.closed.trim() || typeof pair.open !== "string" || !pair.open.trim())) {
          throw new Error(`Door "${door.id}" artwork requires both closed and open texture keys`);
        }
      }
      if (door.type !== "hinged" && door.type !== "sliding") throw new Error(`Door "${door.id}" has an invalid type`);
      if (door.open !== undefined && typeof door.open !== "boolean") throw new Error(`Door "${door.id}" open must be a boolean`);
      if (door.side !== undefined && door.side !== "start" && door.side !== "end") throw new Error(`Door "${door.id}" has an invalid side`);
      if (door.swing !== undefined && door.swing !== "left" && door.swing !== "right") throw new Error(`Door "${door.id}" has an invalid swing`);

    }
    for (const win of wall.windows ?? []) {
      for (const key of [win?.texture, win?.sideTexture]) {
        if (key !== undefined && (typeof key !== "string" || !key.trim())) throw new Error("Window artwork must be a non-empty texture key");
      }
    }
    const height = wall.height ?? (presets[wall.preset]?.lipHeight ?? 0);
    if (!Number.isFinite(height) || height < 0) throw new Error("Wall height must be non-negative and finite");
    const openings = [
      ...(wall.windows ?? []).map((win) => ({ ...win, bottom: win?.sillHeight, label: "Window" })),
      ...(wall.doors ?? []).map((door) => ({ ...door, bottom: 0, label: `Door "${door.id}"` })),
    ];
    for (const [index, opening] of openings.entries()) {
      if (![opening.offset, opening.width, opening.height, opening.bottom].every(Number.isFinite)
        || opening.offset < 0 || opening.width <= 0 || opening.offset + opening.width > length
        || opening.height <= 0 || opening.bottom < 0
        || opening.bottom + opening.height > height) {
        throw new Error(`${opening.label} must fit within its wall: provide positive width and height, offset, and window sillHeight above the floor`);
      }
      for (const other of openings.slice(0, index)) {
        if (opening.offset < other.offset + other.width && opening.offset + opening.width > other.offset
          && opening.bottom < other.bottom + other.height && opening.bottom + opening.height > other.bottom) {
          throw new Error(`${opening.label} overlaps another opening`);
        }
      }
    }
  }
}

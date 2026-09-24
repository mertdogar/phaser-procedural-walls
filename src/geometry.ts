import type { Rect, ResolvedWall, WallPreset, WallSpec } from "./types";

const DEFAULTS = { edgeWidth: 2, lipHeight: 0, windowInset: 0.6 };

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
  if (holes.length === 0) return [rect];
  const out: Rect[] = [];
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  if (horizontal) {
    const top = Math.min(...holes.map((h) => h.y));
    const bot = Math.max(...holes.map((h) => h.y + h.h));
    if (top > rect.y) out.push({ x: rect.x, y: rect.y, w: rect.w, h: top - rect.y });
    if (bot < bottom) out.push({ x: rect.x, y: bot, w: rect.w, h: bottom - bot });
    let x = rect.x;
    for (const h of [...holes].sort((a, b) => a.x - b.x)) {
      if (h.x > x) out.push({ x, y: top, w: h.x - x, h: bot - top });
      x = h.x + h.w;
    }
    if (x < right) out.push({ x, y: top, w: right - x, h: bot - top });
    return out;
  }
  const left = Math.min(...holes.map((h) => h.x));
  const rgt = Math.max(...holes.map((h) => h.x + h.w));
  if (left > rect.x) out.push({ x: rect.x, y: rect.y, w: left - rect.x, h: rect.h });
  if (rgt < right) out.push({ x: rgt, y: rect.y, w: right - rgt, h: rect.h });
  let y = rect.y;
  for (const h of [...holes].sort((a, b) => a.y - b.y)) {
    if (h.y > y) out.push({ x: left, y, w: rgt - left, h: h.y - y });
    y = h.y + h.h;
  }
  if (y < bottom) out.push({ x: left, y, w: rgt - left, h: bottom - y });
  return out;
}

export function resolveWalls(
  walls: WallSpec[],
  presets: Record<string, WallPreset>,
): ResolvedWall[] {
  validateDoors(walls);
  const normalized = walls.map(normalize);
  return normalized.map((w) => {
    const preset = presets[w.preset];
    if (!preset) throw new Error(`Unknown wall preset "${w.preset}"`);
    const lipHeight = w.height ?? preset.lipHeight ?? DEFAULTS.lipHeight;
    const inset = preset.windowInset ?? DEFAULTS.windowInset;
    const sillHeight = preset.sillHeight ?? w.thickness;
    const t = w.thickness;
    const half = t / 2;
    const extStart = endExtension(w.x1, w.y1, w, normalized);
    const extEnd = endExtension(w.x2, w.y2, w, normalized);
    const horizontal = w.y1 === w.y2;

    const body: Rect = horizontal
      ? { x: w.x1 - extStart, y: w.y1 - half, w: w.x2 - w.x1 + extStart + extEnd, h: t }
      : { x: w.x1 - half, y: w.y1 - extStart, w: t, h: w.y2 - w.y1 + extStart + extEnd };

    const lip: Rect | null =
      lipHeight <= 0 ? null : { x: body.x, y: body.y + body.h, w: body.w, h: lipHeight };

    const windows: Rect[] = (w.windows ?? []).map((win) => {
      if (!horizontal) return { x: w.x1 - half * inset, y: w.y1 + win.offset, w: t * inset, h: win.width };
      const x = w.x1 + win.offset;
      if (lip) return { x, y: Math.round(lip.y + lip.h * (1 - inset) / 2), w: win.width, h: Math.round(lip.h * inset) };
      return { x, y: w.y1 - half * inset, w: win.width, h: t * inset };
    });
    const windowsInLip = horizontal && lip !== null;
    const sills: Rect[] = windowsInLip && sillHeight > 0
      ? windows.map((r) => {
          const h = Math.min(sillHeight, r.h);
          return { x: r.x, y: r.y + r.h - h, w: r.w, h };
        })
      : [];
    let bodyPieces = cutRects(body, windowsInLip ? [] : windows, horizontal);
    let lipPieces = lip ? cutRects(lip, windowsInLip ? windows : [], true) : [];

    const south = body.y + body.h + (lip ? lip.h : 0);
    const collider: Rect = { ...body, y: body.y + (lip ? lip.h : 0) };
    const doors = (w.doors ?? []).map((spec) => ({
      spec,
      collider: horizontal
        ? { x: w.x1 + spec.offset, y: collider.y, w: spec.width, h: t }
        : { x: collider.x, y: w.y1 + (lip?.h ?? 0) + spec.offset, w: t, h: spec.width },
    }));
    for (const door of doors) {
      const hole = horizontal
        ? { ...door.collider, y: body.y, h: t + (lip?.h ?? 0) }
        : { ...door.collider, y: door.collider.y - (lip?.h ?? 0), h: door.collider.h + (lip?.h ?? 0) };
      bodyPieces = subtractRect(bodyPieces, hole, horizontal);
      if (horizontal) lipPieces = subtractRect(lipPieces, hole, horizontal);
    }
    if (!horizontal && doors.length && lip) {
      const tops = doors.reduce((pieces, door) => subtractRect(pieces,
        { ...door.collider, y: door.collider.y - lip.h, h: door.collider.h + lip.h }, false), [body]);
      lipPieces = tops.map((rect, index) => ({
        x: rect.x, y: rect.y + rect.h, w: rect.w,
        h: Math.min(lip.h, (tops[index + 1]?.y ?? Infinity) - rect.y - rect.h),
      }));
    }
    const colliderPieces = doors.reduce((pieces, door) => subtractRect(pieces, door.collider, horizontal), [collider]);
    return { spec: w, horizontal, body, lip, bodyPieces, lipPieces, windows, sills, collider, colliderPieces, doors, depth: w.depth ?? south };
  });
}

function subtractRect(pieces: Rect[], hole: Rect, horizontal: boolean): Rect[] {
  return pieces.flatMap((rect) => {
    const x = Math.max(rect.x, hole.x);
    const y = Math.max(rect.y, hole.y);
    const w = Math.min(rect.x + rect.w, hole.x + hole.w) - x;
    const h = Math.min(rect.y + rect.h, hole.y + hole.h) - y;
    return w > 0 && h > 0 ? cutRects(rect, [{ x, y, w, h }], horizontal) : [rect];
  });
}

export function validateDoors(walls: WallSpec[]): void {
  const ids = new Set<string>();
  for (const wall of walls) {
    if (wall.doors !== undefined && !Array.isArray(wall.doors)) throw new Error("Wall doors must be an array");
    const length = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
    for (const door of wall.doors ?? []) {
      if (!door || typeof door.id !== "string" || !door.id.trim()) throw new Error("Every door needs a non-empty ID");
      if (ids.has(door.id)) throw new Error(`Duplicate door ID "${door.id}"`);
      ids.add(door.id);
      if (door.type !== "hinged" && door.type !== "sliding") throw new Error(`Door "${door.id}" has an invalid type`);
      if (door.open !== undefined && typeof door.open !== "boolean") throw new Error(`Door "${door.id}" open must be a boolean`);
      if (door.side !== undefined && door.side !== "start" && door.side !== "end") throw new Error(`Door "${door.id}" has an invalid side`);
      if (door.swing !== undefined && door.swing !== "left" && door.swing !== "right") throw new Error(`Door "${door.id}" has an invalid swing`);
      if (!Number.isFinite(length) || !Number.isFinite(door.offset) || !Number.isFinite(door.width)
        || door.offset < 0 || door.width <= 0 || door.offset + door.width > length) {
        throw new Error(`Door "${door.id}" must fit within its wall`);
      }
      for (const other of [...(wall.windows ?? []), ...(wall.doors ?? [])]) {
        if (other === door) continue;
        if (door.offset < other.offset + other.width && door.offset + door.width > other.offset) {
          throw new Error(`Door "${door.id}" overlaps a window or another door`);
        }
      }
    }
  }
}

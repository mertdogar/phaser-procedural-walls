import type { Rect, ResolvedWall, WallPreset, WallSpec } from "./types";

const DEFAULTS = { edgeWidth: 2, lipHeight: 0, windowInset: 0.6, sillHeight: 8 };
const PLANE_THICKNESS = 8;

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
  const normalized = walls.map(normalize);
  return normalized.map((w) => {
    const preset = presets[w.preset];
    if (!preset) throw new Error(`Unknown wall preset "${w.preset}"`);
    const lipHeight = preset.lipHeight ?? DEFAULTS.lipHeight;
    const inset = preset.windowInset ?? DEFAULTS.windowInset;
    const sillHeight = preset.sillHeight ?? DEFAULTS.sillHeight;
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
    const bodyPieces = cutRects(body, windowsInLip ? [] : windows, horizontal);
    const lipPieces = lip ? cutRects(lip, windowsInLip ? windows : [], true) : [];

    const south = body.y + body.h + (lip ? lip.h : 0);
    const collider: Rect = horizontal
      ? { x: body.x, y: south - PLANE_THICKNESS, w: body.w, h: PLANE_THICKNESS }
      : { x: body.x, y: body.y, w: body.w, h: south - body.y };
    return { spec: w, horizontal, body, lip, bodyPieces, lipPieces, windows, sills, collider, depth: south };
  });
}

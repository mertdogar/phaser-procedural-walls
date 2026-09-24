import Phaser from "phaser";
import { resolveWalls, validateOpenings } from "./geometry";
import { WallMap } from "./WallMap";
import type { WallMapConfig, WallSpec, WindowSpec } from "./types";

export type WallEditorTool = "select" | "wall";

export interface WallEditorCallbacks {
  onError?: (message: string) => void;
  onAddWall: (wall: WallSpec) => void;
  onSelectWall: (index: number | null) => void;
  onUpdateWall: (index: number, patch: Partial<WallSpec>) => void;
}

export interface WallEditorState {
  config: WallMapConfig;
  selectedIndex: number | null;
  tool: WallEditorTool;
  enabled?: boolean;
}

export interface WallEditorOptions extends WallEditorState, WallEditorCallbacks {
  camera?: Phaser.Cameras.Scene2D.Camera;
  gridSize?: number;
  overlayDepth?: number;
  newWall?: Partial<Pick<WallSpec, "thickness" | "height" | "preset">>;
}

interface AnchorDrag {
  index: number;
  endpoint: "start" | "end";
  wall: WallSpec;
}

interface OpeningDrag {
  index: number;
  openingIndex: number;
  kind: "windows" | "doors";
  wall: WallSpec;
}

interface WallDrag {
  index: number;
  wall: WallSpec;
  start: Phaser.Math.Vector2;
  preview: WallSpec;
}

export class WallEditor {
  private configData: WallMapConfig;
  private selectedIndex: number | null;
  private tool: WallEditorTool;
  private enabled: boolean;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly gridSize: number;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly callbacks: WallEditorCallbacks;
  private newWall: Pick<WallSpec, "thickness" | "height"> & { preset?: string };
  private drawStart: Phaser.Math.Vector2 | null = null;
  private pointerPosition: Phaser.Math.Vector2 | null = null;
  private anchorDrag: AnchorDrag | null = null;
  private openingDrag: OpeningDrag | null = null;
  private wallDrag: WallDrag | null = null;
  private wallPreview: WallMap | null = null;

  constructor(private readonly scene: Phaser.Scene, options: WallEditorOptions) {
    this.gridSize = options.gridSize ?? 32;
    if (!Number.isFinite(this.gridSize) || this.gridSize <= 0) throw new Error("gridSize must be positive and finite");
    this.camera = options.camera ?? scene.cameras.main;
    this.configData = options.config;
    this.selectedIndex = options.selectedIndex;
    this.tool = options.tool;
    this.enabled = options.enabled ?? true;
    this.callbacks = options;
    this.newWall = { ...options.newWall, thickness: options.newWall?.thickness ?? 16 };
    this.overlay = scene.add.graphics().setDepth(options.overlayDepth ?? 10000);
    scene.input.on("pointerdown", this.handlePointerDown, this);
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerup", this.handlePointerUp, this);
    scene.input.on("pointerupoutside", this.handlePointerUp, this);
    scene.events.once("shutdown", this.destroy, this);
    this.refresh();
  }

  setState(state: WallEditorState): void {
    if (state.config !== this.configData || state.selectedIndex !== this.selectedIndex
      || state.tool !== this.tool || (state.enabled ?? true) !== this.enabled) this.cancel();
    this.configData = state.config;
    this.selectedIndex = state.selectedIndex;
    this.tool = state.tool;
    this.enabled = state.enabled ?? true;
    this.refresh();
  }

  setNewWall(wall: Partial<Pick<WallSpec, "thickness" | "height" | "preset">>): void {
    this.newWall = { ...wall, thickness: wall.thickness ?? 16 };
  }

  get dragging(): boolean {
    return Boolean(this.drawStart || this.anchorDrag || this.openingDrag || this.wallDrag);
  }

  cancel(): void {
    this.drawStart = null;
    this.pointerPosition = null;
    this.anchorDrag = null;
    this.openingDrag = null;
    this.wallDrag = null;
    this.wallPreview?.destroy();
    this.wallPreview = null;
    this.scene.input.setDefaultCursor("default");
    this.refresh();
  }

  destroy(): void {
    this.cancel();
    this.scene.input.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.input.off("pointerup", this.handlePointerUp, this);
    this.scene.input.off("pointerupoutside", this.handlePointerUp, this);
    this.scene.events.off("shutdown", this.destroy, this);
    this.scene.input.setDefaultCursor("default");
    this.overlay.destroy();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || !pointer.leftButtonDown()) return;
    pointer.updateWorldPoint(this.camera);
    const point = this.snapPoint(pointer.worldX, pointer.worldY);
    if (this.tool === "select") {
      const endpoint = this.findAnchor(pointer.worldX, pointer.worldY);
      if (endpoint && this.selectedIndex !== null) {
        this.anchorDrag = {
          index: this.selectedIndex,
          endpoint,
          wall: { ...this.configData.walls[this.selectedIndex] },
        };
        this.scene.input.setDefaultCursor("grabbing");
        return;
      }
      const opening = this.findOpening(pointer.worldX, pointer.worldY);
      if (opening !== null && this.selectedIndex !== null) {
        this.openingDrag = {
          index: this.selectedIndex,
          ...opening,
          wall: { ...this.configData.walls[this.selectedIndex] },
        };
        this.scene.input.setDefaultCursor("grabbing");
        return;
      }
      if (this.selectedIndex !== null && this.onSelectedLine(pointer.worldX, pointer.worldY)) {
        const wall = this.configData.walls[this.selectedIndex];
        this.wallDrag = { index: this.selectedIndex, wall, start: new Phaser.Math.Vector2(pointer.worldX, pointer.worldY), preview: wall };
        this.scene.input.setDefaultCursor("grabbing");
        return;
      }
      this.callbacks.onSelectWall(this.findWall(pointer.worldX, pointer.worldY));
      return;
    }
    this.drawStart = point;
    this.pointerPosition = point.clone();
    this.refresh();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    pointer.updateWorldPoint(this.camera);
    if (this.wallDrag && pointer.isDown) {
      const drag = this.wallDrag;
      drag.preview = this.moveWall(drag, pointer.worldX, pointer.worldY);
      this.wallPreview ??= new WallMap(this.scene, { presets: this.configData.presets, walls: [drag.wall] });
      for (const container of this.wallPreview.containers) {
        container.setPosition(drag.preview.x1 - drag.wall.x1, drag.preview.y1 - drag.wall.y1)
          .setAlpha(0.65).setDepth(this.overlay.depth - 1);
      }
      this.refresh();
      return;
    }
    if (this.openingDrag && pointer.isDown) {
      this.openingDrag.wall = this.moveOpening(
        this.openingDrag.wall,
        this.openingDrag.openingIndex,
        this.openingDrag.kind,
        pointer.worldX,
        pointer.worldY,
      );
      this.refresh();
      return;
    }
    if (this.anchorDrag && pointer.isDown) {
      this.anchorDrag.wall = this.moveEndpoint(
        this.anchorDrag.wall,
        this.anchorDrag.endpoint,
        this.snapPoint(pointer.worldX, pointer.worldY),
      );
      this.refresh();
      return;
    }
    if (this.tool === "select" && !pointer.isDown) {
      const opening = this.findOpening(pointer.worldX, pointer.worldY);
      if (opening !== null && this.selectedIndex !== null) {
        const wall = this.configData.walls[this.selectedIndex];
        this.scene.input.setDefaultCursor(wall.y1 === wall.y2 ? "ew-resize" : "ns-resize");
      } else {
        this.scene.input.setDefaultCursor(this.findAnchor(pointer.worldX, pointer.worldY)
          || this.onSelectedLine(pointer.worldX, pointer.worldY) ? "grab" : "default");
      }
    }
    if (!this.drawStart || !pointer.isDown) return;
    this.pointerPosition = this.axisLock(this.drawStart, this.snapPoint(pointer.worldX, pointer.worldY));
    this.refresh();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    pointer.updateWorldPoint(this.camera);
    if (this.wallDrag) {
      const drag = this.wallDrag;
      const wall = this.moveWall(drag, pointer.worldX, pointer.worldY);
      this.cancel();
      if (wall.x1 !== drag.wall.x1 || wall.y1 !== drag.wall.y1) {
        this.callbacks.onUpdateWall(drag.index, { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
      }
      return;
    }
    if (this.openingDrag) {
      const drag = this.openingDrag;
      const wall = this.moveOpening(drag.wall, drag.openingIndex, drag.kind, pointer.worldX, pointer.worldY);
      this.openingDrag = null;
      this.scene.input.setDefaultCursor("default");
      if (wall !== drag.wall) this.callbacks.onUpdateWall(drag.index, { [drag.kind]: wall[drag.kind] });
      this.refresh();
      return;
    }
    if (this.anchorDrag) {
      const drag = this.anchorDrag;
      const wall = this.moveEndpoint(
        drag.wall,
        drag.endpoint,
        this.snapPoint(pointer.worldX, pointer.worldY),
      );
      this.anchorDrag = null;
      this.scene.input.setDefaultCursor("default");
      if (wall !== drag.wall && Phaser.Math.Distance.Between(wall.x1, wall.y1, wall.x2, wall.y2) >= this.gridSize) {
        this.callbacks.onUpdateWall(drag.index, {
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
        });
      }
      this.refresh();
      return;
    }
    if (!this.drawStart) return;
    const end = this.axisLock(this.drawStart, this.snapPoint(pointer.worldX, pointer.worldY));
    const start = this.drawStart;
    this.drawStart = null;
    this.pointerPosition = null;
    if (Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y) >= this.gridSize) {
      const preset = this.newWall.preset ?? (Object.hasOwn(this.configData.presets, "interior") ? "interior" : Object.keys(this.configData.presets)[0]);
      if (!preset || !Object.hasOwn(this.configData.presets, preset)) throw new Error("Choose an existing wall preset before drawing");
      this.callbacks.onAddWall({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        ...this.newWall,
        preset,
      });
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.overlay) return;
    this.overlay.clear();
    if (!this.enabled) return;
    const wall = this.wallDrag?.preview
      ?? this.openingDrag?.wall
      ?? this.anchorDrag?.wall
      ?? (this.selectedIndex === null ? null : this.configData.walls[this.selectedIndex]);
    if (wall) {
      const radius = 8 / this.camera.zoom;
      this.overlay.lineStyle(4, 0x2d7a4c, 1).lineBetween(wall.x1, wall.y1, wall.x2, wall.y2);
      this.overlay.fillStyle(0xffffff, 1).fillCircle(wall.x1, wall.y1, radius).fillCircle(wall.x2, wall.y2, radius);
      this.overlay.lineStyle(3 / this.camera.zoom, 0x2d7a4c, 1).strokeCircle(wall.x1, wall.y1, radius).strokeCircle(wall.x2, wall.y2, radius);
      for (const { rect, kind, openingIndex } of this.getOpeningRects(wall)) {
        const active = this.openingDrag?.openingIndex === openingIndex && this.openingDrag?.kind === kind;
        this.overlay.fillStyle(active ? 0x2d7a4c : 0xffffff, active ? 0.35 : 0.75).fillRect(rect.x, rect.y, rect.w, rect.h);
        this.overlay.lineStyle(3, 0x2d7a4c, 1).strokeRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
    if (this.drawStart && this.pointerPosition) {
      this.overlay.lineStyle(4, 0xe39a36, 0.95).lineBetween(
        this.drawStart.x,
        this.drawStart.y,
        this.pointerPosition.x,
        this.pointerPosition.y,
      );
      this.overlay.fillStyle(0xe39a36).fillCircle(this.drawStart.x, this.drawStart.y, 5);
    }
  }

  private findWall(x: number, y: number): number | null {
    let nearest: { index: number; distance: number } | null = null;
    for (const [index, wall] of this.configData.walls.entries()) {
      const distance = wall.x1 === wall.x2
        ? Math.hypot(x - wall.x1, y - Phaser.Math.Clamp(y, Math.min(wall.y1, wall.y2), Math.max(wall.y1, wall.y2)))
        : Math.hypot(x - Phaser.Math.Clamp(x, Math.min(wall.x1, wall.x2), Math.max(wall.x1, wall.x2)), y - wall.y1);
      if (distance <= wall.thickness / 2 + 10 / this.camera.zoom && (!nearest || distance < nearest.distance)) {
        nearest = { index, distance };
      }
    }
    if (nearest) return nearest.index;
    let visible: { index: number; depth: number } | null = null;
    for (const [index, wall] of resolveWalls(this.configData.walls, this.configData.presets).entries()) {
      for (const { rect, depth } of wall.surfaces) {
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
          && (!visible || depth >= visible.depth)) visible = { index, depth };
      }
    }
    return visible?.index ?? null;
  }

  private onSelectedLine(x: number, y: number): boolean {
    const wall = this.selectedIndex === null ? undefined : this.configData.walls[this.selectedIndex];
    if (!wall) return false;
    const horizontal = wall.y1 === wall.y2;
    const along = horizontal ? x : y;
    const start = horizontal ? wall.x1 : wall.y1;
    const end = horizontal ? wall.x2 : wall.y2;
    return along >= Math.min(start, end) && along <= Math.max(start, end)
      && Math.abs(horizontal ? y - wall.y1 : x - wall.x1) <= 6 / this.camera.zoom;
  }

  private moveWall(drag: WallDrag, x: number, y: number): WallSpec {
    const dx = Math.round((x - drag.start.x) / this.gridSize) * this.gridSize;
    const dy = Math.round((y - drag.start.y) / this.gridSize) * this.gridSize;
    const wall = drag.wall;
    return { ...wall, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy };
  }

  private findAnchor(x: number, y: number): "start" | "end" | null {
    if (this.selectedIndex === null) return null;
    const wall = this.configData.walls[this.selectedIndex];
    if (!wall) return null;
    const startDistance = Phaser.Math.Distance.Between(x, y, wall.x1, wall.y1);
    const endDistance = Phaser.Math.Distance.Between(x, y, wall.x2, wall.y2);
    if (Math.min(startDistance, endDistance) > 16 / this.camera.zoom) return null;
    return startDistance <= endDistance ? "start" : "end";
  }

  private findOpening(x: number, y: number): { openingIndex: number; kind: "windows" | "doors" } | null {
    if (this.selectedIndex === null) return null;
    const wall = this.configData.walls[this.selectedIndex];
    if (!wall) return null;
    const padding = 10 / this.camera.zoom;
    return this.getOpeningRects(wall).find(({ rect }) => (
      x >= rect.x - padding && x <= rect.x + rect.w + padding
      && y >= rect.y - padding && y <= rect.y + rect.h + padding
    )) ?? null;
  }

  private getOpeningRects(wall: WallSpec) {
    const resolved = resolveWalls([wall], this.configData.presets)[0];
    return [
      ...resolved.spec.windows?.map((win, openingIndex) => ({
        rect: resolved.horizontal
          ? { x: resolved.spec.x1 + win.offset, y: resolved.collider.y - win.sillHeight - win.height / 2, w: win.width, h: wall.thickness }
          : { x: resolved.collider.x, y: resolved.spec.y1 + win.offset - win.sillHeight - win.height / 2, w: wall.thickness, h: win.width },
        openingIndex, kind: "windows" as const,
      })) ?? [],
      ...resolved.doors.map((door, openingIndex) => ({ rect: { ...door.collider, y: door.collider.y - door.spec.height / 2 }, openingIndex, kind: "doors" as const })),
    ];
  }

  private moveOpening(wall: WallSpec, openingIndex: number, kind: "windows" | "doors", x: number, y: number): WallSpec {
    const openings = wall[kind]?.map((opening) => ({ ...opening })) ?? [];
    const opening = openings[openingIndex];
    if (!opening) return wall;
    const horizontal = wall.y1 === wall.y2;
    const direction = horizontal ? Math.sign(wall.x2 - wall.x1) || 1 : Math.sign(wall.y2 - wall.y1) || 1;
    const height = kind === "windows" ? (opening as WindowSpec).sillHeight + opening.height / 2 : opening.height / 2;
    const pointerOffset = horizontal ? (x - wall.x1) * direction : (y + height - wall.y1) * direction;
    const length = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
    const offset = Phaser.Math.Clamp(
      Math.round((pointerOffset - opening.width / 2) / this.gridSize) * this.gridSize,
      0, Math.max(0, length - opening.width),
    );
    openings[openingIndex] = { ...opening, offset };
    const next = { ...wall, [kind]: openings };
    try { validateOpenings([next], this.configData.presets); } catch (error) {
      if (!this.callbacks.onError) throw error;
      this.callbacks.onError(error instanceof Error ? error.message : "Invalid opening");
      return wall;
    }
    this.callbacks.onError?.("");
    return next;
  }

  private moveEndpoint(wall: WallSpec, endpoint: "start" | "end", point: Phaser.Math.Vector2): WallSpec {
    const fixed = endpoint === "start"
      ? new Phaser.Math.Vector2(wall.x2, wall.y2)
      : new Phaser.Math.Vector2(wall.x1, wall.y1);
    const moved = this.axisLock(fixed, point);
    const next = endpoint === "start"
      ? { ...wall, x1: moved.x, y1: moved.y }
      : { ...wall, x2: moved.x, y2: moved.y };
    try { validateOpenings([next], this.configData.presets); } catch (error) {
      if (!this.callbacks.onError) throw error;
      this.callbacks.onError(error instanceof Error ? error.message : "Invalid opening");
      return wall;
    }
    this.callbacks.onError?.("");
    return next;
  }

  private snapPoint(x: number, y: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(
      Math.round(x / this.gridSize) * this.gridSize,
      Math.round(y / this.gridSize) * this.gridSize,
    );
  }

  private axisLock(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      ? new Phaser.Math.Vector2(end.x, start.y)
      : new Phaser.Math.Vector2(start.x, end.y);
  }

}

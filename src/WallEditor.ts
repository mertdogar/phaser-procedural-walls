import Phaser from "phaser";
import { resolveWalls } from "./geometry";
import type { WallMapConfig, WallSpec, WindowSpec } from "./types";

export type WallEditorTool = "select" | "wall";

export interface WallEditorCallbacks {
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

interface WindowDrag {
  index: number;
  windowIndex: number;
  wall: WallSpec;
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
  private windowDrag: WindowDrag | null = null;

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
    return Boolean(this.drawStart || this.anchorDrag || this.windowDrag);
  }

  cancel(): void {
    this.drawStart = null;
    this.pointerPosition = null;
    this.anchorDrag = null;
    this.windowDrag = null;
    this.scene.input.setDefaultCursor("default");
    this.refresh();
  }

  destroy(): void {
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
      const windowIndex = this.findWindow(pointer.worldX, pointer.worldY);
      if (windowIndex !== null && this.selectedIndex !== null) {
        this.windowDrag = {
          index: this.selectedIndex,
          windowIndex,
          wall: { ...this.configData.walls[this.selectedIndex] },
        };
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
    if (this.windowDrag && pointer.isDown) {
      this.windowDrag.wall = this.moveWindow(
        this.windowDrag.wall,
        this.windowDrag.windowIndex,
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
      const windowIndex = this.findWindow(pointer.worldX, pointer.worldY);
      if (windowIndex !== null && this.selectedIndex !== null) {
        const wall = this.configData.walls[this.selectedIndex];
        this.scene.input.setDefaultCursor(wall.y1 === wall.y2 ? "ew-resize" : "ns-resize");
      } else {
        this.scene.input.setDefaultCursor(this.findAnchor(pointer.worldX, pointer.worldY) ? "grab" : "default");
      }
    }
    if (!this.drawStart || !pointer.isDown) return;
    this.pointerPosition = this.axisLock(this.drawStart, this.snapPoint(pointer.worldX, pointer.worldY));
    this.refresh();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    pointer.updateWorldPoint(this.camera);
    if (this.windowDrag) {
      const drag = this.windowDrag;
      const wall = this.moveWindow(drag.wall, drag.windowIndex, pointer.worldX, pointer.worldY);
      this.windowDrag = null;
      this.scene.input.setDefaultCursor("default");
      this.callbacks.onUpdateWall(drag.index, { windows: wall.windows });
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
      if (Phaser.Math.Distance.Between(wall.x1, wall.y1, wall.x2, wall.y2) >= this.gridSize) {
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
    const wall = this.windowDrag?.wall
      ?? this.anchorDrag?.wall
      ?? (this.selectedIndex === null ? null : this.configData.walls[this.selectedIndex]);
    if (wall) {
      const radius = 8 / this.camera.zoom;
      this.overlay.lineStyle(4, 0x2d7a4c, 1).lineBetween(wall.x1, wall.y1, wall.x2, wall.y2);
      this.overlay.fillStyle(0xffffff, 1).fillCircle(wall.x1, wall.y1, radius).fillCircle(wall.x2, wall.y2, radius);
      this.overlay.lineStyle(3 / this.camera.zoom, 0x2d7a4c, 1).strokeCircle(wall.x1, wall.y1, radius).strokeCircle(wall.x2, wall.y2, radius);
      for (const [index, rect] of this.getWindowRects(wall).entries()) {
        const active = this.windowDrag?.windowIndex === index;
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
    return nearest?.index ?? null;
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

  private findWindow(x: number, y: number): number | null {
    if (this.selectedIndex === null) return null;
    const wall = this.configData.walls[this.selectedIndex];
    if (!wall) return null;
    const padding = 10 / this.camera.zoom;
    const index = this.getWindowRects(wall).findIndex((rect) => (
      x >= rect.x - padding
      && x <= rect.x + rect.w + padding
      && y >= rect.y - padding
      && y <= rect.y + rect.h + padding
    ));
    return index === -1 ? null : index;
  }

  private getWindowRects(wall: WallSpec) {
    return resolveWalls([wall], this.configData.presets)[0]?.windows ?? [];
  }

  private moveWindow(wall: WallSpec, windowIndex: number, x: number, y: number): WallSpec {
    const windows = wall.windows?.map((window) => ({ ...window })) ?? [];
    const window = windows[windowIndex];
    if (!window) return wall;
    const horizontal = wall.y1 === wall.y2;
    const direction = horizontal ? Math.sign(wall.x2 - wall.x1) || 1 : Math.sign(wall.y2 - wall.y1) || 1;
    const pointerOffset = horizontal ? (x - wall.x1) * direction : (y - wall.y1) * direction;
    const length = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
    const maxOffset = Math.max(0, length - window.width);
    const offset = Phaser.Math.Clamp(
      Math.round((pointerOffset - window.width / 2) / this.gridSize) * this.gridSize,
      0,
      maxOffset,
    );
    windows[windowIndex] = { ...window, offset } satisfies WindowSpec;
    return { ...wall, windows };
  }

  private moveEndpoint(wall: WallSpec, endpoint: "start" | "end", point: Phaser.Math.Vector2): WallSpec {
    const fixed = endpoint === "start"
      ? new Phaser.Math.Vector2(wall.x2, wall.y2)
      : new Phaser.Math.Vector2(wall.x1, wall.y1);
    const moved = this.axisLock(fixed, point);
    return endpoint === "start"
      ? { ...wall, x1: moved.x, y1: moved.y }
      : { ...wall, x2: moved.x, y2: moved.y };
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

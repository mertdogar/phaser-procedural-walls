import Phaser from "phaser";
import { resolveWalls } from "../../src/geometry";
import { WallMap } from "../../src/WallMap";
import type { WallSpec, WindowSpec } from "../../src/types";
import { GRID_SIZE, type WallMapConfig } from "../editor-data";

export type EditorTool = "select" | "wall";

interface EditorCallbacks {
  onAddWall: (wall: WallSpec) => void;
  onSelectWall: (index: number | null) => void;
  onUpdateWall: (index: number, patch: Partial<WallSpec>) => void;
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

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;

export class EditorScene extends Phaser.Scene {
  private configData: WallMapConfig;
  private wallMap: WallMap | null = null;
  private textureSources = new Map<string, string>();
  private overlay!: Phaser.GameObjects.Graphics;
  private tool: EditorTool = "wall";
  private selectedIndex: number | null = null;
  private drawStart: Phaser.Math.Vector2 | null = null;
  private pointerPosition: Phaser.Math.Vector2 | null = null;
  private anchorDrag: AnchorDrag | null = null;
  private windowDrag: WindowDrag | null = null;
  private preview = false;
  private player: Phaser.Physics.Arcade.Sprite | null = null;
  private playerCollider: Phaser.Physics.Arcade.Collider | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private callbacks: EditorCallbacks = {
    onAddWall: () => {},
    onSelectWall: () => {},
    onUpdateWall: () => {},
  };

  constructor(config: WallMapConfig, private onTextureError: (message: string) => void) {
    super("wall-editor");
    this.configData = config;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0xf2efe8);
    this.drawGrid();
    this.overlay = this.add.graphics().setDepth(10000);
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.drawOverlay();
    void this.refreshWalls();
  }

  setEditorState(
    config: WallMapConfig,
    selectedIndex: number | null,
    tool: EditorTool,
    preview: boolean,
    callbacks: EditorCallbacks,
  ): void {
    this.configData = config;
    this.selectedIndex = selectedIndex;
    this.tool = tool;
    this.preview = preview;
    this.callbacks = callbacks;
    if (!this.sys.isActive()) return;
    void this.refreshWalls();
  }

  private async refreshWalls(): Promise<void> {
    const config = this.configData;
    try {
      const keys = new Set(Object.values(config.presets).flatMap((preset) => [preset.texture, preset.lipTexture]).filter((key): key is string => Boolean(key)));
      const images = await Promise.all([...keys].map(async (key) => {
        const source = config.textures?.[key];
        if (this.textures.exists(key) && (!source || this.textureSources.get(key) === source)) return null;
        if (!source) throw new Error(`Texture "${key}" is missing. Upload its image in Presets.`);
        const image = new Image();
        image.src = source;
        try { await image.decode(); } catch { throw new Error(`Could not load texture "${key}". Replace its image in Presets.`); }
        return { key, source, image };
      }));
      if (!this.sys.isActive() || config !== this.configData) return;
      this.wallMap?.destroy();
      for (const item of images) {
        if (!item) continue;
        if (this.textures.exists(item.key)) this.textures.remove(item.key);
        this.textures.addImage(item.key, item.image);
        this.textureSources.set(item.key, item.source);
      }
      this.wallMap = new WallMap(this, this.preview ? { ...config, collide: true } : config);
      this.syncPlayer();
      this.drawOverlay();
      this.onTextureError("");
    } catch (error) {
      if (this.sys.isActive() && config === this.configData) this.onTextureError(error instanceof Error ? error.message : "Could not load textures.");
    }
  }

  update(): void {
    if (!this.preview || !this.player || !this.cursors) return;
    const x = Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown);
    const y = Number(this.cursors.down.isDown) - Number(this.cursors.up.isDown);
    const velocity = new Phaser.Math.Vector2(x, y);
    if (velocity.lengthSq() > 0) velocity.normalize().scale(150);
    this.player.setVelocity(velocity.x, velocity.y).setDepth(this.player.y);
    if (x !== 0) this.player.setFlipX(x < 0);
  }

  private drawGrid(): void {
    const grid = this.add.graphics().setDepth(-100);
    grid.lineStyle(1, 0xd8d4ca, 0.72);
    for (let x = 0; x <= WORLD_WIDTH; x += GRID_SIZE) grid.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += GRID_SIZE) grid.lineBetween(0, y, WORLD_WIDTH, y);
    grid.lineStyle(2, 0xc5c0b5, 0.8).strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.preview) return;
    const point = this.snapPoint(pointer.worldX, pointer.worldY);
    if (this.tool === "select") {
      const windowIndex = this.findWindow(pointer.worldX, pointer.worldY);
      if (windowIndex !== null && this.selectedIndex !== null) {
        this.windowDrag = {
          index: this.selectedIndex,
          windowIndex,
          wall: { ...this.configData.walls[this.selectedIndex] },
        };
        this.input.setDefaultCursor("grabbing");
        return;
      }
      const endpoint = this.findAnchor(pointer.worldX, pointer.worldY);
      if (endpoint && this.selectedIndex !== null) {
        this.anchorDrag = {
          index: this.selectedIndex,
          endpoint,
          wall: { ...this.configData.walls[this.selectedIndex] },
        };
        this.input.setDefaultCursor("grabbing");
        return;
      }
      this.callbacks.onSelectWall(this.findWall(pointer.worldX, pointer.worldY));
      return;
    }
    this.drawStart = point;
    this.pointerPosition = point.clone();
    this.drawOverlay();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.preview) return;
    if (this.windowDrag && pointer.isDown) {
      this.windowDrag.wall = this.moveWindow(
        this.windowDrag.wall,
        this.windowDrag.windowIndex,
        pointer.worldX,
        pointer.worldY,
      );
      this.drawOverlay();
      return;
    }
    if (this.anchorDrag && pointer.isDown) {
      this.anchorDrag.wall = this.moveEndpoint(
        this.anchorDrag.wall,
        this.anchorDrag.endpoint,
        this.snapPoint(pointer.worldX, pointer.worldY),
      );
      this.drawOverlay();
      return;
    }
    if (this.tool === "select" && !pointer.isDown) {
      const windowIndex = this.findWindow(pointer.worldX, pointer.worldY);
      if (windowIndex !== null && this.selectedIndex !== null) {
        const wall = this.configData.walls[this.selectedIndex];
        this.input.setDefaultCursor(wall.y1 === wall.y2 ? "ew-resize" : "ns-resize");
      } else {
        this.input.setDefaultCursor(this.findAnchor(pointer.worldX, pointer.worldY) ? "grab" : "default");
      }
    }
    if (!this.drawStart || !pointer.isDown) return;
    this.pointerPosition = this.axisLock(this.drawStart, this.snapPoint(pointer.worldX, pointer.worldY));
    this.drawOverlay();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.preview) return;
    if (this.windowDrag) {
      const drag = this.windowDrag;
      const wall = this.moveWindow(drag.wall, drag.windowIndex, pointer.worldX, pointer.worldY);
      this.windowDrag = null;
      this.input.setDefaultCursor("default");
      this.callbacks.onUpdateWall(drag.index, { windows: wall.windows });
      this.drawOverlay();
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
      this.input.setDefaultCursor("default");
      if (Phaser.Math.Distance.Between(wall.x1, wall.y1, wall.x2, wall.y2) >= GRID_SIZE) {
        this.callbacks.onUpdateWall(drag.index, {
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
        });
      }
      this.drawOverlay();
      return;
    }
    if (!this.drawStart) return;
    const end = this.axisLock(this.drawStart, this.snapPoint(pointer.worldX, pointer.worldY));
    const start = this.drawStart;
    this.drawStart = null;
    this.pointerPosition = null;
    if (Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y) >= GRID_SIZE) {
      this.callbacks.onAddWall({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        thickness: 16,
        preset: Object.hasOwn(this.configData.presets, "interior") ? "interior" : Object.keys(this.configData.presets)[0],
      });
    }
    this.drawOverlay();
  }

  private drawOverlay(): void {
    if (!this.overlay) return;
    this.overlay.clear();
    if (this.preview) return;
    const wall = this.windowDrag?.wall
      ?? this.anchorDrag?.wall
      ?? (this.selectedIndex === null ? null : this.configData.walls[this.selectedIndex]);
    if (wall) {
      this.overlay.lineStyle(4, 0x2d7a4c, 1).lineBetween(wall.x1, wall.y1, wall.x2, wall.y2);
      this.overlay.fillStyle(0xffffff, 1).fillCircle(wall.x1, wall.y1, 8).fillCircle(wall.x2, wall.y2, 8);
      this.overlay.lineStyle(3, 0x2d7a4c, 1).strokeCircle(wall.x1, wall.y1, 8).strokeCircle(wall.x2, wall.y2, 8);
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
      if (distance <= wall.thickness / 2 + 10 && (!nearest || distance < nearest.distance)) {
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
    if (Math.min(startDistance, endDistance) > 28) return null;
    return startDistance <= endDistance ? "start" : "end";
  }

  private findWindow(x: number, y: number): number | null {
    if (this.selectedIndex === null) return null;
    const wall = this.configData.walls[this.selectedIndex];
    if (!wall) return null;
    const padding = 10;
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
      Math.round((pointerOffset - window.width / 2) / GRID_SIZE) * GRID_SIZE,
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
      Phaser.Math.Clamp(Math.round(x / GRID_SIZE) * GRID_SIZE, 0, WORLD_WIDTH),
      Phaser.Math.Clamp(Math.round(y / GRID_SIZE) * GRID_SIZE, 0, WORLD_HEIGHT),
    );
  }

  private axisLock(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      ? new Phaser.Math.Vector2(end.x, start.y)
      : new Phaser.Math.Vector2(start.x, end.y);
  }

  private syncPlayer(): void {
    this.playerCollider?.destroy();
    this.playerCollider = null;
    if (!this.preview) {
      this.player?.destroy();
      this.player = null;
      return;
    }
    if (!this.player) this.player = this.createPlayer();
    if (this.wallMap?.bodies) this.playerCollider = this.physics.add.collider(this.player, this.wallMap.bodies);
    this.game.canvas.tabIndex = 0;
    this.game.canvas.focus();
  }

  private createPlayer(): Phaser.Physics.Arcade.Sprite {
    const texture = "wall-editor-player";
    if (!this.textures.exists(texture)) {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0x153c32, 0.22).fillEllipse(16, 57, 26, 9);
      graphics.fillStyle(0x182d2a).fillRect(8, 9, 16, 8);
      graphics.fillStyle(0xd99462).fillRect(9, 15, 14, 15);
      graphics.fillStyle(0x17211f).fillRect(12, 20, 2, 2).fillRect(19, 20, 2, 2);
      graphics.fillStyle(0x2d7a4c).fillRect(7, 30, 18, 17);
      graphics.fillStyle(0xe6b07e).fillRect(4, 31, 3, 13).fillRect(25, 31, 3, 13);
      graphics.fillStyle(0x263b58).fillRect(9, 47, 6, 10).fillRect(18, 47, 6, 10);
      graphics.fillStyle(0x17211f).fillRect(7, 56, 8, 4).fillRect(18, 56, 8, 4);
      graphics.generateTexture(texture, 32, 64);
      graphics.destroy();
    }
    const spawn = this.findSpawn();
    const player = this.physics.add.sprite(spawn.x, spawn.y, texture).setOrigin(0.5, 1);
    player.body!.setSize(18, 10).setOffset(7, 50);
    player.setCollideWorldBounds(true).setDepth(player.y);
    return player;
  }

  private findSpawn(): Phaser.Math.Vector2 {
    const colliders = resolveWalls(this.configData.walls, this.configData.presets).map((wall) => wall.collider);
    const candidates = [
      new Phaser.Math.Vector2(320, 384),
      new Phaser.Math.Vector2(640, 384),
      new Phaser.Math.Vector2(320, 224),
      new Phaser.Math.Vector2(640, 224),
      new Phaser.Math.Vector2(WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
    ];
    return candidates.find((point) => colliders.every((rect) => (
      point.x + 9 <= rect.x
      || point.x - 9 >= rect.x + rect.w
      || point.y <= rect.y
      || point.y - 10 >= rect.y + rect.h
    ))) ?? candidates.at(-1)!;
  }
}

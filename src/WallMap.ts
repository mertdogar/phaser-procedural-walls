import Phaser from "phaser";
import { resolveWalls } from "./geometry";
import type { DoorState, Rect, ResolvedDoor, ResolvedWall, WallMapConfig, WallPreset } from "./types";

interface RuntimeDoor {
  door: ResolvedDoor;
  wall: ResolvedWall;
  preset: WallPreset;
  graphics: Phaser.GameObjects.Graphics;
  container: Phaser.GameObjects.Container;
  blocker: Phaser.Physics.Arcade.StaticBody | null;
  progress: number;
  open: boolean;
}

export class WallMap {
  readonly scene: Phaser.Scene;
  containers: Phaser.GameObjects.Container[] = [];
  bodies: Phaser.Physics.Arcade.StaticGroup | null = null;
  private config: WallMapConfig;
  private doors = new Map<string, RuntimeDoor>();

  constructor(scene: Phaser.Scene, config: WallMapConfig) {
    this.scene = scene;
    this.config = config;
    this.build();
    scene.events.on("update", this.updateDoors, this);
    scene.events.once("shutdown", this.destroy, this);
  }

  setWalls(walls: WallMapConfig["walls"]): this {
    resolveWalls(walls, this.config.presets);
    this.config = { ...this.config, walls };
    this.clear();
    this.build();
    return this;
  }

  redraw(): this {
    this.clear();
    this.build();
    return this;
  }

  destroy(): void {
    this.scene.events.off("update", this.updateDoors, this);
    this.scene.events.off("shutdown", this.destroy, this);
    this.clear();
  }

  openDoor(id: string): this {
    const door = this.getDoor(id);
    door.open = true;
    if (door.blocker && door.progress === 1) door.blocker.enable = false;
    return this;
  }

  closeDoor(id: string): this {
    const door = this.getDoor(id);
    door.open = false;
    if (door.blocker) door.blocker.enable = true;
    return this;
  }

  toggleDoor(id: string): this {
    return this.getDoor(id).open ? this.closeDoor(id) : this.openDoor(id);
  }

  getDoorState(id: string): DoorState {
    const door = this.getDoor(id);
    return door.open ? (door.progress === 1 ? "open" : "opening")
      : (door.progress === 0 ? "closed" : "closing");
  }

  private getDoor(id: string): RuntimeDoor {
    const door = this.doors.get(id);
    if (!door) throw new Error(`Unknown door ID "${id}"`);
    return door;
  }

  private updateDoors(_time: number, delta: number): void {
    for (const door of this.doors.values()) {
      const target = Number(door.open);
      if (door.progress === target) continue;
      door.progress = Math.max(0, Math.min(1, door.progress + (door.open ? 1 : -1) * delta / 250));
      if (door.blocker) door.blocker.enable = door.progress !== 1 || !door.open;
      this.drawDoor(door);
    }
  }

  private clear(): void {
    this.doors.clear();
    for (const c of this.containers) c.destroy();
    this.containers = [];
    this.bodies?.destroy(true);
    this.bodies = null;
  }

  private build(): void {
    const { presets, walls, collide } = this.config;
    const resolved = resolveWalls(walls, presets);
    if (collide) this.bodies = this.scene.physics.add.staticGroup();
    for (const wall of resolved) {
      this.containers.push(...this.drawWall(wall, presets[wall.spec.preset]));
      if (this.bodies) for (const rect of wall.colliderPieces) this.addBody(rect);
      for (const door of wall.doors) {
        const container = this.scene.add.container(0, 0);
        const graphics = this.scene.add.graphics();
        container.add(graphics);
        this.containers.push(container);
        const runtime: RuntimeDoor = {
          door, wall, preset: presets[wall.spec.preset], container, graphics,
          blocker: this.bodies ? this.addBody(door.collider) : null,
          progress: door.spec.open ? 1 : 0, open: door.spec.open ?? false,
        };
        if (runtime.blocker) runtime.blocker.enable = !runtime.open;
        this.doors.set(door.spec.id, runtime);
        this.drawDoor(runtime);
      }
    }
  }

  private drawWall(wall: ResolvedWall, preset: WallPreset): Phaser.GameObjects.Container[] {
    return wall.surfaces.map(({ rect, kind, depth }) => {
      const container = this.scene.add.container(0, 0);
      const g = this.scene.add.graphics();
      if (kind === "window") {
        g.fillStyle(preset.windowFill ?? 0x3d7f88, preset.windowAlpha ?? 0.5);
        g.fillRect(rect.x, rect.y, rect.w, rect.h);
      } else {
        this.fillRect(container, g, rect, kind === "lip" ? preset.lipFill ?? preset.fill : preset.fill,
          kind === "lip" ? preset.lipTexture : preset.texture);
      }
      const edge = kind === "window" ? preset.windowFrame : preset.edge;
      if (edge !== undefined) {
        g.lineStyle(kind === "window" ? 1 : preset.edgeWidth ?? 2, edge);
        const neighbors = wall.surfaces.filter((s) => s.kind === kind && s.depth === depth && s.rect !== rect).map((s) => s.rect);
        this.strokeBoundary(g, rect, neighbors);
      }
      container.add(g);
      container.setDepth(depth);
      return container;
    });
  }

  private strokeBoundary(g: Phaser.GameObjects.Graphics, r: Rect, neighbors: Rect[]): void {
    for (const horizontal of [true, false]) {
      for (const end of [false, true]) {
        const fixed = horizontal ? r.y + (end ? r.h : 0) : r.x + (end ? r.w : 0);
        const start = horizontal ? r.x : r.y;
        const finish = start + (horizontal ? r.w : r.h);
        const shared = neighbors.filter((n) => (horizontal ? n.y + (end ? 0 : n.h) : n.x + (end ? 0 : n.w)) === fixed)
          .map((n) => horizontal ? [n.x, n.x + n.w] : [n.y, n.y + n.h]).sort((a, b) => a[0] - b[0]);
        let cursor = start;
        const line = (a: number, b: number) => {
          if (b > a) g.lineBetween(horizontal ? a : fixed, horizontal ? fixed : a, horizontal ? b : fixed, horizontal ? fixed : b);
        };
        for (const [a, b] of shared) {
          if (b <= cursor || a >= finish) continue;
          line(cursor, Math.min(a, finish));
          cursor = Math.min(finish, Math.max(cursor, b));
        }
        line(cursor, finish);
      }
    }
  }

  private fillRect(
    container: Phaser.GameObjects.Container,
    g: Phaser.GameObjects.Graphics,
    r: Rect,
    color: number,
    texture?: string,
  ): void {
    if (!texture) {
      g.fillStyle(color).fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    const tile = this.scene.add.tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, texture);
    tile.setTilePosition(r.x, r.y);
    container.add(tile);
  }

  private drawDoor(runtime: RuntimeDoor): void {
    const { door, wall, preset, progress, graphics: g, container } = runtime;
    const { spec, collider: r } = door;
    const end = spec.side === "end";
    const horizontal = wall.horizontal;
    let x = horizontal ? r.x : r.x + r.w / 2;
    if (!horizontal && spec.height < (wall.lip?.h ?? 0)) {
      x += (spec.type === "hinged" && spec.swing !== "right" ? 1 : -1) * r.w / 2;
    }
    let y = horizontal ? r.y + r.h / 2 : r.y;
    let length = spec.width;
    let angle = horizontal ? 0 : Math.PI / 2;
    if (spec.type === "sliding") {
      const shift = end ? length * progress : 0;
      x += horizontal ? shift : 0;
      y += horizontal ? 0 : shift;
      length *= 1 - progress;
    } else {
      x += horizontal && end ? length : 0;
      y += !horizontal && end ? length : 0;
      angle += (end ? Math.PI : 0) + (spec.swing === "right" ? 1 : -1) * (end ? -1 : 1) * progress * Math.PI / 2;
    }
    g.clear();
    if (length <= 0) return;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const half = Math.min(wall.spec.thickness, 8) / 2;
    const nx = -Math.sin(angle) * half;
    const ny = Math.cos(angle) * half;
    const height = spec.height;
    const points = [
      { x: x + nx, y: y + ny - height },
      { x: x + dx + nx, y: y + dy + ny - height },
      { x: x + dx - nx, y: y + dy - ny - height },
      { x: x - nx, y: y - ny - height },
    ].map(({ x, y }) => new Phaser.Math.Vector2(x, y));
    const color = preset.doorFill ?? 0x99734f;
    const edge = preset.doorFrame ?? preset.edge;
    g.fillStyle(color).lineStyle(preset.edgeWidth ?? 2, edge);
    if (height > 0) {
      for (const [a, b] of [ny >= 0 ? [0, 1] : [3, 2], dy >= 0 ? [1, 2] : [0, 3]]) {
        const face = [points[a], points[b], new Phaser.Math.Vector2(points[b].x, points[b].y + height), new Phaser.Math.Vector2(points[a].x, points[a].y + height)];
        g.fillPoints(face, true).strokePoints(face, true);
      }
    }
    g.fillPoints(points, true).strokePoints(points, true);
    const depth = Math.max(y, y + dy) + half
      + (wall.spec.depth === undefined ? 0 : wall.depth - wall.collider.y - wall.collider.h);
    container.setDepth(depth);
  }

  private addBody(c: Rect): Phaser.Physics.Arcade.StaticBody {
    const zone = this.scene.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
    this.scene.physics.add.existing(zone, true);
    this.bodies!.add(zone);
    return zone.body as Phaser.Physics.Arcade.StaticBody;
  }
}

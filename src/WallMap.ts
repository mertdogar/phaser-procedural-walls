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
      this.containers.push(this.drawWall(wall, presets[wall.spec.preset]));
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

  private drawWall(wall: ResolvedWall, preset: WallPreset): Phaser.GameObjects.Container {
    const { body, lip, bodyPieces, lipPieces, windows, sills } = wall;
    const container = this.scene.add.container(0, 0);
    const g = this.scene.add.graphics();
    const top = this.scene.add.graphics();
    const edgeWidth = preset.edgeWidth ?? 2;

    for (const r of bodyPieces) this.fillRect(container, g, r, preset.fill, preset.texture);
    for (const r of lipPieces) this.fillRect(container, g, r, preset.lipFill ?? preset.fill, preset.lipTexture);

    const windowFill = preset.windowFill ?? 0x3d7f88;
    for (const r of windows) {
      g.fillStyle(windowFill, preset.windowAlpha ?? 0.5);
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    container.add(g);

    for (const r of sills) this.fillRect(container, top, r, preset.fill, preset.texture);
    for (const r of sills) top.lineStyle(1, preset.edge).lineBetween(r.x, r.y, r.x + r.w, r.y);
    if (preset.windowFrame !== undefined) {
      for (const r of windows) top.lineStyle(1, preset.windowFrame).strokeRect(r.x, r.y, r.w, r.h);
    }

    top.lineStyle(edgeWidth, preset.edge);
    if (!wall.doors.length) {
      top.strokeRect(body.x, body.y, body.w, body.h);
      if (lip) top.strokeRect(lip.x, lip.y, lip.w, lip.h);
    } else {
      for (const rect of [...bodyPieces, ...lipPieces]) top.strokeRect(rect.x, rect.y, rect.w, rect.h);
      top.lineStyle(edgeWidth, preset.doorFrame ?? preset.edge);
      for (const { collider: r } of wall.doors) {
        if (wall.horizontal) {
          top.lineBetween(r.x, body.y, r.x, r.y + r.h);
          top.lineBetween(r.x + r.w, body.y, r.x + r.w, r.y + r.h);
        } else {
          top.lineBetween(r.x, r.y, r.x + r.w, r.y);
          top.lineBetween(r.x, r.y + r.h, r.x + r.w, r.y + r.h);
        }
      }
    }

    container.add(top);
    container.setDepth(wall.depth);
    return container;
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
    if (!wall.horizontal && wall.lip && spec.type === "hinged") {
      this.drawVerticalHingedDoor(runtime);
      return;
    }
    const end = spec.side === "end";
    const horizontal = wall.horizontal;
    let x = horizontal ? r.x : r.x + r.w / 2;
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
    const height = wall.lip?.h ?? 0;
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
    const depth = wall.spec.depth ?? Math.max(y, y + dy) + half;
    container.setDepth(horizontal ? depth : Math.min(depth, wall.depth - 0.000001));
  }

  private drawVerticalHingedDoor(runtime: RuntimeDoor): void {
    const { door: { spec, collider: r }, wall, preset, progress, graphics: g, container } = runtime;
    const faceHeight = Math.min(wall.lip!.h, spec.width / 2);
    const angle = progress * Math.PI / 2;
    const edgeWidth = Math.min(r.w * 0.5, spec.width * 0.05);
    const faceWidth = edgeWidth * Math.sin(angle);
    const tailHeight = (spec.width - faceHeight) * Math.cos(angle);
    const height = faceHeight + tailHeight;
    const right = spec.swing === "right";
    const stripX = r.x + (r.w - edgeWidth) / 2;
    const faceX = right ? stripX + edgeWidth : stripX - faceWidth;
    const y = spec.side === "end" ? r.y + r.h - height : r.y;
    const faceY = spec.side === "end" ? y + tailHeight : y;
    const color = preset.doorFill ?? 0x99734f;
    const edge = preset.doorFrame ?? preset.edge;
    const bevel = Math.min(2, edgeWidth / 4);
    g.clear();
    g.fillStyle(color).fillRect(stripX, y, edgeWidth, height);
    g.fillStyle(edge).fillRect(stripX, y, bevel, height);
    g.fillStyle(preset.fill, 0.55).fillRect(stripX + edgeWidth - bevel, y, bevel, height);
    g.lineStyle(preset.edgeWidth ?? 2, edge).strokeRect(stripX, y, edgeWidth, height);
    g.lineBetween(stripX, spec.side === "end" ? faceY : y + faceHeight, stripX + edgeWidth, spec.side === "end" ? faceY : y + faceHeight);
    if (faceWidth > 0.01) {
      g.fillStyle(color).fillRect(faceX, faceY, faceWidth, faceHeight);
      g.fillStyle(preset.fill, 0.6).fillRect(faceX, faceY + 1, faceWidth, bevel);
      g.fillStyle(edge, 0.25).fillRect(faceX, faceY + faceHeight - bevel, faceWidth, bevel);
      g.lineStyle(preset.edgeWidth ?? 2, edge).strokeRect(faceX, faceY, faceWidth, faceHeight);
      const hardwareHeight = Math.min(6, faceHeight / 8);
      for (const offset of [0.2, 0.8]) {
        const hardwareY = faceY + faceHeight * offset - hardwareHeight / 2;
        g.fillStyle(0x68747d, Math.sin(angle)).fillRect(faceX, hardwareY, faceWidth, hardwareHeight);
        g.fillStyle(0xcbd2d7, Math.sin(angle)).fillRect(faceX + faceWidth / 4, hardwareY + 1, faceWidth / 2, hardwareHeight - 2);
      }
    }
    container.setDepth(wall.depth + 0.000001);
  }

  private addBody(c: Rect): Phaser.Physics.Arcade.StaticBody {
    const zone = this.scene.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
    this.scene.physics.add.existing(zone, true);
    this.bodies!.add(zone);
    return zone.body as Phaser.Physics.Arcade.StaticBody;
  }
}

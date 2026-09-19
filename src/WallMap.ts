import Phaser from "phaser";
import { resolveWalls } from "./geometry";
import type { Rect, ResolvedWall, WallMapConfig, WallPreset } from "./types";

export class WallMap {
  readonly scene: Phaser.Scene;
  containers: Phaser.GameObjects.Container[] = [];
  bodies: Phaser.Physics.Arcade.StaticGroup | null = null;
  private config: WallMapConfig;

  constructor(scene: Phaser.Scene, config: WallMapConfig) {
    this.scene = scene;
    this.config = config;
    this.build();
  }

  setWalls(walls: WallMapConfig["walls"]): this {
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
    this.clear();
  }

  private clear(): void {
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
      if (this.bodies) this.addBody(wall);
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
    top.strokeRect(body.x, body.y, body.w, body.h);
    if (lip) top.lineStyle(edgeWidth, preset.edge).strokeRect(lip.x, lip.y, lip.w, lip.h);

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

  private addBody(wall: ResolvedWall): void {
    const { collider: c } = wall;
    const zone = this.scene.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
    this.scene.physics.add.existing(zone, true);
    this.bodies!.add(zone);
  }
}

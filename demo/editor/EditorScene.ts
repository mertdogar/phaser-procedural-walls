import Phaser from "phaser";
import { resolveWalls } from "../../src/geometry";
import { WallMap } from "../../src/WallMap";
import type { ResolvedWall } from "../../src/types";
import { WallEditor, type WallEditorCallbacks, type WallEditorTool } from "../../src/WallEditor";
import { getMapBounds, GRID_SIZE, type WallMapConfig } from "../editor-data";

export type EditorTool = WallEditorTool;
type EditorCallbacks = WallEditorCallbacks;

export class EditorScene extends Phaser.Scene {
  private configData: WallMapConfig;
  private wallMap: WallMap | null = null;
  private previewWalls: ResolvedWall[] = [];
  private textureSources = new Map<string, string>();
  private editor!: WallEditor;
  private grid!: Phaser.GameObjects.Graphics;
  private originLabel!: Phaser.GameObjects.Text;
  private panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private tool: EditorTool = "wall";
  private selectedIndex: number | null = null;
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
    this.grid = this.add.graphics().setDepth(-100);
    this.originLabel = this.add.text(0, 0, "0, 0", { fontSize: "12px", color: "#53675a", backgroundColor: "#f2efe8", padding: { x: 4, y: 2 } }).setDepth(-99);
    this.fitMap();
    this.drawGrid();
    this.editor = new WallEditor(this, {
      config: this.configData, selectedIndex: this.selectedIndex, tool: this.tool, enabled: !this.preview,
      onAddWall: (wall) => this.callbacks.onAddWall(wall),
      onSelectWall: (index) => this.callbacks.onSelectWall(index),
      onUpdateWall: (index, patch) => this.callbacks.onUpdateWall(index, patch),
    });
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.input.on("pointerupoutside", this.handlePointerUp, this);
    this.input.on("wheel", this.handleWheel, this);
    this.scale.on("resize", this.drawGrid, this);
    this.events.once("shutdown", () => this.scale.off("resize", this.drawGrid, this));
    this.editor?.refresh();
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
    this.editor.setState({ config, selectedIndex, tool, enabled: !preview });
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
      const bounds = getMapBounds(config);
      const previous = this.physics.world.bounds;
      const needsFit = !this.wallMap || bounds.x < previous.x || bounds.y < previous.y
        || bounds.x + bounds.width > previous.right || bounds.y + bounds.height > previous.bottom;
      this.physics.world.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
      if (needsFit && this.selectedIndex === null) this.fitMap();
      this.wallMap?.destroy();
      for (const item of images) {
        if (!item) continue;
        if (this.textures.exists(item.key)) this.textures.remove(item.key);
        this.textures.addImage(item.key, item.image);
        this.textureSources.set(item.key, item.source);
      }
      this.wallMap = new WallMap(this, this.preview ? { ...config, collide: true } : config);
      this.previewWalls = this.preview ? resolveWalls(config.walls, config.presets) : [];
      this.syncPlayer();
      this.editor?.refresh();
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
    this.player.setVelocity(velocity.x, velocity.y).setDepth(this.getPlayerDepth());
    if (x !== 0) this.player.setFlipX(x < 0);
    if (x !== 0 || y !== 0) {
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.drawGrid();
    }
  }

  private getPlayerDepth(): number {
    const player = this.player!;
    let behind = Infinity;
    let inFront = -Infinity;
    for (const wall of this.previewWalls) {
      const bottom = wall.collider.y + wall.collider.h;
      if (player.x + player.width / 2 <= wall.body.x
        || player.x - player.width / 2 >= wall.body.x + wall.body.w
        || player.y <= wall.body.y
        || player.y - player.height >= bottom) continue;
      if (player.y < bottom) behind = Math.min(behind, wall.depth);
      else inFront = Math.max(inFront, wall.depth);
    }
    if (inFront < behind && Number.isFinite(inFront) && Number.isFinite(behind)) {
      return (inFront + behind) / 2;
    }
    if (Number.isFinite(behind)) return behind - 0.000001;
    return Math.max(player.y, inFront + 0.000001);
  }

  fitMap(): void {
    const bounds = getMapBounds(this.configData);
    const camera = this.cameras.main;
    const availableWidth = camera.width * 0.9;
    camera.setZoom(Math.min(1, availableWidth / bounds.width, (camera.height - 80) / bounds.height));
    camera.centerOn(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    this.drawGrid();
    this.editor?.refresh();
  }

  zoomBy(factor: number, x = this.cameras.main.width / 2, y = this.cameras.main.height / 2): void {
    const camera = this.cameras.main;
    const bounds = getMapBounds(this.configData);
    const minZoom = Math.min(0.1, camera.width / bounds.width, camera.height / bounds.height);
    camera.preRender();
    const before = camera.getWorldPoint(x, y);
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * factor, minZoom, 4));
    camera.preRender();
    const after = camera.getWorldPoint(x, y);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    this.drawGrid();
    this.editor?.refresh();
  }

  private drawGrid(): void {
    if (!this.grid) return;
    const camera = this.cameras.main;
    camera.preRender();
    const view = camera.worldView;
    const step = GRID_SIZE * Math.max(1, Math.ceil(0.4 / camera.zoom));
    this.grid.clear().lineStyle(1 / camera.zoom, 0xd8d4ca, 0.72);
    for (let x = Math.floor(view.x / step) * step; x <= view.right; x += step) this.grid.lineBetween(x, view.y, x, view.bottom);
    for (let y = Math.floor(view.y / step) * step; y <= view.bottom; y += step) this.grid.lineBetween(view.x, y, view.right, y);
    this.grid.lineStyle(2 / camera.zoom, 0x718c79, 0.9);
    this.grid.lineBetween(view.x, 0, view.right, 0);
    this.grid.lineBetween(0, view.y, 0, view.bottom);
    this.grid.strokeCircle(0, 0, 4 / camera.zoom);
    this.originLabel?.setPosition(8 / camera.zoom, 8 / camera.zoom).setScale(1 / camera.zoom);
  }

  private handleWheel(pointer: Phaser.Input.Pointer): void {
    if (this.editor.dragging || this.panStart) return;
    const event = pointer.event as WheelEvent;
    const camera = this.cameras.main;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.scale.canvasBounds.height : 1;
    if (event.ctrlKey) {
      this.zoomBy(Math.exp(-event.deltaY * unit * 0.01), pointer.x, pointer.y);
      return;
    }
    camera.scrollX += event.deltaX * unit * this.scale.displayScale.x / camera.zoom;
    camera.scrollY += event.deltaY * unit * this.scale.displayScale.y / camera.zoom;
    this.drawGrid();
    this.editor?.refresh();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!pointer.middleButtonDown()) return;
    this.editor.cancel();
    const camera = this.cameras.main;
    this.panStart = { x: pointer.x, y: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
    this.input.setDefaultCursor("grabbing");
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.panStart) return;
    const camera = this.cameras.main;
    camera.scrollX = this.panStart.scrollX - (pointer.x - this.panStart.x) / camera.zoom;
    camera.scrollY = this.panStart.scrollY - (pointer.y - this.panStart.y) / camera.zoom;
    this.drawGrid();
  }

  private handlePointerUp(): void {
    if (!this.panStart) return;
    this.panStart = null;
    this.input.setDefaultCursor("default");
  }

  private syncPlayer(): void {
    this.playerCollider?.destroy();
    this.playerCollider = null;
    if (!this.preview) {
      this.player?.destroy();
      this.player = null;
      return;
    }
    if (!this.player) {
      this.player = this.createPlayer();
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.drawGrid();
    }
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
    const bounds = getMapBounds(this.configData);
    const center = new Phaser.Math.Vector2(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const isFree = (point: Phaser.Math.Vector2) => colliders.every((rect) => (
      point.x + 9 <= rect.x
      || point.x - 9 >= rect.x + rect.w
      || point.y <= rect.y
      || point.y - 10 >= rect.y + rect.h
    ));
    if (isFree(center)) return center;
    for (let y = bounds.y + GRID_SIZE; y < bounds.y + bounds.height; y += GRID_SIZE) {
      for (let x = bounds.x + GRID_SIZE; x < bounds.x + bounds.width; x += GRID_SIZE) {
        const point = new Phaser.Math.Vector2(x, y);
        if (isFree(point)) return point;
      }
    }
    return center;
  }
}

import Phaser from "phaser";
import { WallMapPlugin } from "../src/WallMapPlugin";
import type { WallMap } from "../src/WallMap";
import { floors, presets, walls } from "./floorplan";
import { makeWallTextures } from "./textures";

class Demo extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wallMap!: WallMap;

  create() {
    this.makeTextures();
    makeWallTextures(this);
    this.add.tileSprite(1000, 940, 2000, 1880, "grass").setDepth(-2);
    const floor = this.add.graphics().setDepth(-1);
    for (const f of floors) floor.fillStyle(f.color).fillRect(f.x, f.y, f.w, f.h);

    this.wallMap = this.add.wallMap({ presets, walls, collide: true });

    this.player = this.physics.add.sprite(1000, 1400, "player").setOrigin(0.5, 1);
    this.player.body!.setSize(20, 12).setOffset(2, 28);
    this.physics.add.collider(this.player, this.wallMap.bodies!);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1).setZoom(1);
    this.cameras.main.setBounds(0, 0, 2000, 1880);
  }

  update() {
    const speed = 220;
    const vx = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
    const vy = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
    this.player.setVelocity(vx * speed, vy * speed);
    this.player.setDepth(this.player.y);
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3f6b3a).fillRect(0, 0, 64, 64);
    g.fillStyle(0x467a40).fillCircle(16, 20, 10).fillCircle(48, 44, 12);
    g.generateTexture("grass", 64, 64);

    g.clear().fillStyle(0x2a2a3a).fillRect(4, 24, 16, 16);
    g.fillStyle(0xe8a35c).fillRect(2, 4, 20, 20);
    g.fillStyle(0xffffff).fillRect(6, 10, 4, 4).fillRect(14, 10, 4, 4);
    g.generateTexture("player", 24, 40);
    g.destroy();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 860,
  backgroundColor: "#000",
  physics: { default: "arcade" },
  plugins: { scene: [{ key: "WallMapPlugin", plugin: WallMapPlugin, mapping: "wallMapPlugin" }] },
  scene: Demo,
});

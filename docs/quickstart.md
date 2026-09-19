# Quick start

In this tutorial you will create a Phaser 4 project, register the plugin, draw a single room with two windows, and walk a character around it. It takes about ten minutes.

You will end up with this:

![Player standing in front of a brick wall](images/player-in-front.jpg)

## Before you begin

You need Node 20 or newer and pnpm. Any editor works.

## 1. Create the project

```bash
mkdir walls-quickstart && cd walls-quickstart
pnpm init
pnpm add phaser phaser-procedural-walls
pnpm add -D vite typescript
```

Create `index.html`:

```html
<!doctype html>
<html>
  <body style="margin:0;background:#000">
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

## 2. Register the plugin

Create `main.ts` with a game config that loads the scene plugin and Arcade Physics:

```ts
import Phaser from "phaser";
import { WallMapPlugin } from "phaser-procedural-walls";

class Room extends Phaser.Scene {
  create() {}
  update() {}
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#3f6b3a",
  physics: { default: "arcade" },
  plugins: { scene: [{ key: "WallMapPlugin", plugin: WallMapPlugin, mapping: "wallMapPlugin" }] },
  scene: Room,
});
```

Run `pnpm vite` and open the URL it prints. You should see a green page. Keep it open, it reloads on every save.

## 3. Draw the room

Walls are described by their centerline. Replace the `create` method with four walls forming a 400 by 300 room. The north and south walls each get a window.

```ts
create() {
  this.add.rectangle(400, 300, 400, 300, 0xb6804f); // floor

  this.wallMap = this.add.wallMap({
    presets: {
      brick: {
        fill: 0xb59a8c, edge: 0x4a3830,
        lipHeight: 88, lipFill: 0x8f7a70,
        windowFill: 0x3b7d86, windowFrame: 0x24484d,
      },
    },
    walls: [
      { x1: 200, y1: 150, x2: 600, y2: 150, thickness: 22, preset: "brick", windows: [{ offset: 60, width: 60 }] },
      { x1: 200, y1: 150, x2: 200, y2: 450, thickness: 22, preset: "brick" },
      { x1: 600, y1: 150, x2: 600, y2: 450, thickness: 22, preset: "brick" },
      { x1: 200, y1: 450, x2: 600, y2: 450, thickness: 22, preset: "brick", windows: [{ offset: 280, width: 60 }] },
    ],
    collide: true,
  });
}
```

Add the field declaration at the top of the class:

```ts
wallMap!: import("phaser-procedural-walls").WallMap;
```

Save. You now see a brick room. Notice that the corners are filled even though each wall was only given its centerline endpoints: the plugin extends walls that meet.

## 4. Add a character

Generate a simple texture and a physics sprite. The origin is set to the feet, which matters for the next step.

```ts
create() {
  // ...walls from step 3...

  const g = this.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xe8a35c).fillRect(0, 0, 24, 24);
  g.fillStyle(0x2a2a3a).fillRect(4, 24, 16, 16);
  g.generateTexture("player", 24, 40);

  this.player = this.physics.add.sprite(400, 300, "player").setOrigin(0.5, 1);
  this.player.body!.setSize(20, 12).setOffset(2, 28);
  this.physics.add.collider(this.player, this.wallMap.bodies!);
  this.cursors = this.input.keyboard!.createCursorKeys();
}
```

And the fields:

```ts
player!: Phaser.Physics.Arcade.Sprite;
cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
```

## 5. Move and depth-sort

Replace `update`:

```ts
update() {
  const vx = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
  const vy = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
  this.player.setVelocity(vx * 200, vy * 200);
  this.player.setDepth(this.player.y);
}
```

The last line is the only thing the plugin asks of your characters. Each wall already has its depth set to its south edge, so a sprite whose feet are below that edge draws on top of the wall, and one above it draws underneath.

## 6. Try it

Walk down toward the south wall. The character keeps going into the wall zone and disappears behind the brick face, then stops at the bottom of the face. Walk left until you are behind the window: you can see the character through the glass.

![Player visible through the window](images/player-behind-window.jpg)

Walk out through the top, around the outside, and push up against the south wall from below. Now the character stops at the face and is drawn in front of it.

## Where to go next

- Give the room a second preset with a texture: see `texture` and `lipTexture` in the [API reference](api.md).
- Read [How it works](how-it-works.md) to understand the collision plane and why depth is the south edge.
- The repository's `demo/` folder renders a full house with four presets and door gaps between rooms.

# Phaser integration

Use Phaser 4 with the scene plugin. Enable Arcade Physics when you need wall
collisions. Keep the consumer's existing scene and asset-loading structure.

## Register and build

Register the plugin in the game config before creating maps in scenes.

```ts
import Phaser from "phaser";
import { WallMapPlugin } from "@mertdogar/phaser-procedural-walls";

new Phaser.Game({
  physics: { default: "arcade" },
  plugins: {
    scene: [{
      key: "WallMapPlugin",
      plugin: WallMapPlugin,
      mapping: "wallMapPlugin",
    }],
  },
  scene: MyScene,
});
```

The factory is `this.add.wallMap`, not a method on the plugin mapping. In the
scene's `create()`, with a player texture already loaded:

```ts
const wallMap = this.add.wallMap({
  presets: {
    brick: { fill: 0xb59a8c, edge: 0x4a3830, lipHeight: 48 },
  },
  walls: [{
    x1: 32, y1: 96, x2: 480, y2: 96,
    thickness: 20, preset: "brick",
    windows: [{ offset: 80, width: 64, height: 24, sillHeight: 12 }],
  }],
  collide: true,
});
const player = this.physics.add.sprite(200, 240, "player");
player.setOrigin(0.5, 1);
if (wallMap.bodies) this.physics.add.collider(player, wallMap.bodies);
```

With automatic wall depths, set `player.setDepth(player.y)` in `update()`.
Explicit wall depths require additional character sorting; Wallcraft's preview
logic is not exported with the map. Use a small physics body around
the character's feet, sized and offset for the actual sprite dimensions;
don't copy offsets from an unrelated spritesheet. Normalize diagonal movement
when implementing arrow-key movement. The library doesn't move players.

## Load Wallcraft textures

An export can add embedded images to the library config. Define the extension
locally; `textures` isn't part of the library's `WallMapConfig` type.

```ts
import type { WallMapConfig } from "@mertdogar/phaser-procedural-walls";

type EditorMap = WallMapConfig & { textures?: Record<string, string> };

// Inside your scene:
preload() {
  this.load.once(
    "filecomplete-json-office-map",
    (_key: string, _type: string, map: EditorMap) => {
      for (const [key, dataUrl] of Object.entries(map.textures ?? {})) {
        this.load.image(key, dataUrl);
      }
    },
  );
  this.load.json("office-map", "/wall-map.json");
}

create() {
  const map = this.cache.json.get("office-map") as EditorMap;
  this.add.wallMap(map);
}
```

The loader queues images as JSON finishes, before scene creation. For untrusted
or user-supplied JSON, validate the config and assets before using them; the
type assertion above isn't validation. For repeated loads, reuse or deliberately
replace existing texture keys instead of accidentally overwriting other assets.

## Use external image files

Omit the top-level `textures` dictionary when a game owns the image files. Load
files in `preload()` under the exact keys referenced by the map, then create the
wall map in `create()`. For Vite, `/art/brick.png` refers to
`public/art/brick.png`; it is a served URL, not a local filesystem path.

```ts
// Inside a scene with WallMapPlugin registered:
preload() {
  this.load.image("brick", "/art/brick.png");
  this.load.image("window", "/art/window.png");
  this.load.image("entry-closed", "/art/door-closed.png");
  this.load.image("entry-open", "/art/door-open.png");
}

create() {
  this.add.wallMap({
    version: 2,
    presets: { room: { fill: 0xd8c4a5, edge: 0x3c403a, lipTexture: "brick" } },
    walls: [{
      x1: 100, y1: 240, x2: 500, y2: 240,
      thickness: 16, height: 100, preset: "room",
      windows: [{ offset: 40, width: 80, height: 40, sillHeight: 40, texture: "window" }],
      doors: [{ id: "entry", type: "hinged", offset: 220, width: 80, height: 80,
        texture: { closed: "entry-closed", open: "entry-open" } }],
    }],
  });
}
```

Preset `texture` and `lipTexture`, window `texture`/`sideTexture`, and door
`texture`/`sideTexture` pairs always hold loaded keys, never file URLs. Load side
artwork separately for vertical openings. The config may instead come from
`this.load.json`; using JSON does not require embedding images.

Wallcraft's `textures` dictionary accepts embedded PNG/JPEG/WebP data URLs only,
not paths or external URLs. Upload the corresponding images to edit such maps
in Wallcraft; editor exports embed the images again. Don't recommend replacing
embedded data URLs with file paths as an editor-compatible workflow.

## Reconnect after rebuilding

Both `setWalls()` and `redraw()` replace `wallMap.bodies`. Destroy the old Arcade
collider and connect to the new group, using your existing scene references.

```ts
let playerCollider = wallMap.bodies
  ? this.physics.add.collider(player, wallMap.bodies)
  : null;

// When replacing the map's wall list:
playerCollider?.destroy();
wallMap.setWalls(nextWalls);
playerCollider = wallMap.bodies
  ? this.physics.add.collider(player, wallMap.bodies)
  : null;
```

Use the same sequence around `redraw()`. Remove the collider when removing the
map. Don't invent incremental methods such as `moveWindow` or `setHeight`;
edit the config and rebuild through the supported API.

## Diagnose common integration issues

Check the underlying data and lifecycle before adding workarounds.

| Symptom | Check |
| --- | --- |
| Missing `scene.add.wallMap` | Scene plugin registration and package import |
| Missing texture | Key exists and image loading finished before construction |
| Player crosses walls | Arcade enabled, `collide: true`, collider attached |
| Collisions stop after edits | Collider still references the destroyed group |
| Wrong wall overlap | Explicit `depth`, otherwise resolved south-edge depth |
| Player always covers walls | Feet origin and depth updated with feet y |
| Preset height seems ignored | Wall's own `height` overrides preset `lipHeight` |
| Window can't be walked through | Windows don't cut colliders; use a door |
| Node complains about browser globals | Import `/geometry`, not the root |

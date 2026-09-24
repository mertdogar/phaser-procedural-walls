# @mertdogar/phaser-procedural-walls

A Phaser 4 scene plugin that draws top-down floorplan walls from a few lines of data. You describe floor centerlines, dimensions, and openings; the plugin draws thick wall bodies, a front face, see-through windows with sills, and optional Arcade Physics colliders, and it depth-sorts wall surfaces so characters walk in front of and behind walls correctly.

![Wallcraft editor with a selected wall, layers panel, and docked inspector](docs/images/wallcraft-editor.png)

## What you can build

- Axis-aligned rooms with connected corners and T-junctions.
- Walls that grow upward from a fixed floor footprint.
- Windows with independent width, height, and elevation above the floor.
- Hinged or sliding doors with stable IDs and optional Arcade collision.
- Tiled wall materials and fitted door/window artwork, including vertical views.
- Maps authored visually in Wallcraft or directly with TypeScript and JSON.
- Editing interactions embedded in an existing Phaser scene with `WallEditor`.

The renderer sorts individual wall surfaces and door containers. With automatic
wall depths, sort characters by their feet using `sprite.setDepth(sprite.y)`.
Custom wall depths require matching character sorting in your game; Wallcraft's
preview sorting is editor-only.

## Version compatibility

These docs describe the current repository. The floor-based coordinate model,
explicit opening dimensions, and opening artwork are changes after 0.4.1.
Check your installed package's types before using these fields; this repository's
version number alone does not establish that the changes are published on npm.
Use the source checkout for the behavior described here.

## Try Wallcraft

With Node 20 or newer, launch the packaged editor:

```bash
npx @mertdogar/phaser-procedural-walls@latest editor
# or
pnpx @mertdogar/phaser-procedural-walls@latest editor
```

This command requires a release that includes the editor CLI. This README and
its screenshots describe the current repository; the published npm release may
not include the latest editor and geometry changes. To use the repository version:

```bash
pnpm install
pnpm dev
```

Open the localhost URL printed in the terminal. The packaged editor selects an available port; append `--port 8080` to choose one. Draw a wall, switch to Select to edit it, or open **Presets** to change shared styles. **Preview** adds a character controlled with the arrow keys; press **E** near a door to open or close it. Press Ctrl+C in the terminal to stop the server.

Wallcraft is an in-memory prototype, bundled alongside the Phaser library. Export your JSON before closing or reloading the page. See the [Wallcraft guide](docs/wallcraft.md) for editing, textures, and loading an exported map in a game.

## Install

```bash
pnpm add @mertdogar/phaser-procedural-walls phaser
```

Register the scene plugin in your game config:

```ts
import Phaser from "phaser";
import { WallMapPlugin } from "@mertdogar/phaser-procedural-walls";

new Phaser.Game({
  physics: { default: "arcade" },
  plugins: { scene: [{ key: "WallMapPlugin", plugin: WallMapPlugin, mapping: "wallMapPlugin" }] },
  scene: MyScene,
});
```

## Minimal example

```ts
const wallMap = this.add.wallMap({
  presets: {
    brick: { fill: 0xb59a8c, edge: 0x4a3830, lipHeight: 88, lipFill: 0x8f7a70, windowFill: 0x3b7d86 },
  },
  walls: [
    { x1: 0, y1: 0, x2: 400, y2: 0, thickness: 22, preset: "brick", windows: [{ offset: 60, width: 60, height: 48, sillHeight: 20 }] },
    { x1: 0, y1: 0, x2: 0, y2: 300, thickness: 22, preset: "brick" },
    { x1: 400, y1: 0, x2: 400, y2: 300, thickness: 22, preset: "brick" },
    { x1: 0, y1: 300, x2: 400, y2: 300, thickness: 22, preset: "brick", windows: [{ offset: 170, width: 60, height: 48, sillHeight: 20 }] },
  ],
  collide: true,
});

const player = this.physics.add.sprite(200, 150, "player").setOrigin(0.5, 1);
this.physics.add.collider(player, wallMap.bodies!);

// in update()
player.setDepth(player.y);
```

<p>
  <img src="docs/images/player-in-front.jpg" width="48%" alt="Player standing in front of a wall face">
  <img src="docs/images/player-behind-window.jpg" width="48%" alt="Player behind the wall, visible through the window">
</p>

## Documentation

- [Quick start](docs/quickstart.md). Build a walkable room with a window from an empty folder.
- [Wallcraft guide](docs/wallcraft.md). Edit maps, manage presets and textures, test collisions, and export to Phaser.
- [Door guide](docs/doors.md). Add doors, assign artwork, and control passage from your game.
- [API reference](docs/api.md). Every config field, preset option, and method.
- [How it works](docs/how-it-works.md). Corner filling, depth sorting, collision footprints, and window holes.

## Agent skill

The repository includes a portable
[procedural-walls skill](skills/phaser-procedural-walls/SKILL.md) for coding
agents. It covers library integration, Wallcraft exports, presets, textures,
depth sorting, and collisions, with self-contained references.

Install it from your project's root with the [skills CLI](https://skills.sh/docs):

```bash
npx skills add mertdogar/phaser-procedural-walls --skill phaser-procedural-walls
```

Append `--agent codex` to target Codex, or `--global` to install for your user
instead of the current project. The installation includes the bundled references.

To check available skills without installing:

```bash
npx skills add mertdogar/phaser-procedural-walls --list
```

Start a new agent session if needed, then ask, for example:
“Use the phaser-procedural-walls skill to load my Wallcraft export into a Phaser
scene with player collisions.” The skill is distributed in Git, not in the npm
package. Its bundled references track the repository, including changes made
after the original 0.2.0 release.

## Upgrade older maps

The current model uses floor-footprint centerlines. Wall height projects upward
and no longer shifts collision. There is no legacy rendering mode.

1. Provide `height` for every door and `height` plus `sillHeight` for every window.
2. Rename preset `sillHeight` to `sillThickness`. A window's `sillHeight` means
   distance from the floor to its bottom; preset `sillThickness` is decoration.
3. Review coordinates. To preserve an old wall's floor position, add its old
   effective height to both endpoint y coordinates. Review connected walls with
   different heights individually. Keeping coordinates unchanged treats them as
   the intended floor plan and raises the walls above it.
4. Check that openings fit the wall length and height. Invalid openings produce
   errors rather than resizing themselves.

Opening artwork is optional. Maps without it keep procedural doors and windows.
The [API reference](docs/api.md) defines the current fields and defaults.

## Develop

```bash
pnpm install
pnpm dev     # wall editor prototype: draw walls and import/export WallMapConfig JSON
pnpm test    # geometry, door runtime, and editor interaction tests
pnpm typecheck
pnpm lint
pnpm build   # library in dist/ and bundled app in dist/editor/
pnpm editor  # serve the built app locally
pnpm test:cli # launcher integration tests (run after build)
```

## License

MIT

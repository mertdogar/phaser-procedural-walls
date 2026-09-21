# API reference

The renderer and types are available from the package root:

```ts
import { WallMapPlugin, WallMap, resolveWalls } from "@mertdogar/phaser-procedural-walls";
import type { WallMapConfig, WallSpec, WallPreset, WindowSpec, ResolvedWall, Rect } from "@mertdogar/phaser-procedural-walls";
```

For server-side geometry without importing Phaser, use the dedicated entry point:

```ts
import { resolveWalls, cutRects } from "@mertdogar/phaser-procedural-walls/geometry";
```

## WallMapPlugin

A `Phaser.Plugins.ScenePlugin`. Registering it adds `wallMap` to the scene's Game Object Factory.

```ts
plugins: { scene: [{ key: "WallMapPlugin", plugin: WallMapPlugin, mapping: "wallMapPlugin" }] }
```

The `mapping` value is required by Phaser but the plugin exposes nothing on it. All interaction goes through the factory.

## scene.add.wallMap(config)

Builds every wall in `config` and returns a `WallMap`.

```ts
const wallMap: WallMap = this.add.wallMap(config);
```

### WallMapConfig

| field | type | required | description |
| --- | --- | --- | --- |
| `presets` | `Record<string, WallPreset>` | yes | Named styles referenced by walls. |
| `walls` | `WallSpec[]` | yes | The wall segments. |
| `collide` | `boolean` | no | When true, creates Arcade static bodies. Requires Arcade Physics on the scene. Default `false`. |

### Wallcraft export extension

The editor exports the same fields plus an optional `textures: Record<string, string>`. Each key is referenced by a preset's `texture` or `lipTexture`; each value is an embedded PNG, JPEG, or WebP data URL. This field belongs to the editor format, not the library's `WallMapConfig` type. The library does not load these images automatically. Load them into Phaser before creating the wall map, as shown in the [Wallcraft guide](wallcraft.md#load-an-exported-map-in-phaser).

The upload control accepts files up to 5 MB each. Images repeat at their original size; the editor has no tile scaling or spritesheet-frame controls. Removing a texture assignment switches that surface to its color, but the uploaded image remains in the map's image collection and export.

### WallSpec

| field | type | required | description |
| --- | --- | --- | --- |
| `x1`, `y1`, `x2`, `y2` | `number` | yes | Centerline endpoints in world units. Either `x1 === x2` or `y1 === y2`; diagonal walls throw. Endpoint order does not matter. |
| `thickness` | `number` | yes | Wall body thickness across the centerline. |
| `height` | `number` | no | Height of this wall's face below the body. Overrides the preset's `lipHeight`. |
| `depth` | `number` | no | Explicit Phaser drawing depth for this wall. Defaults to the wall's south edge. Higher values draw later. |
| `preset` | `string` | yes | Key into `presets`. Unknown keys throw. |
| `windows` | `WindowSpec[]` | no | Windows along this wall. |

### WindowSpec

| field | type | description |
| --- | --- | --- |
| `offset` | `number` | Distance in world units from the wall's `(x1, y1)` end to the window's near edge, measured before any endpoint normalization. |
| `width` | `number` | Window width along the wall. |

### WallPreset

| field | type | default | description |
| --- | --- | --- | --- |
| `fill` | `number` | required | Wall body color. Also used for sills. Ignored for the body when `texture` is set. |
| `edge` | `number` | required | Outline stroke color for body, lip, and sill top edge. |
| `edgeWidth` | `number` | `2` | Outline stroke width. |
| `lipHeight` | `number` | `0` | Height of the face drawn below the body. `0` disables the face. |
| `lipFill` | `number` | `fill` | Face color. Ignored when `lipTexture` is set. |
| `texture` | `string` | none | Texture key tiled across the body with a TileSprite. |
| `lipTexture` | `string` | none | Texture key tiled across the face. |
| `windowFill` | `number` | `0x3d7f88` | Glass color. |
| `windowAlpha` | `number` | `0.5` | Glass alpha. `1` makes windows opaque. |
| `windowFrame` | `number` | none | When set, a 1px frame is stroked around each window. |
| `windowInset` | `number` | `0.6` | Fraction of the face height (or body thickness when there is no face) the window occupies. |
| `sillHeight` | `number` | Wall thickness | Height of the opaque band at the bottom of each face window, clamped to the window height. Omit to follow each wall's thickness; an explicit number overrides it. `0` disables sills. |

Texture keys must exist in the scene's Texture Manager before `wallMap` is called.

## WallMap

The handle returned by the factory. It is not itself a Game Object; it owns one Container per wall.

| member | type | description |
| --- | --- | --- |
| `scene` | `Phaser.Scene` | Owning scene. |
| `containers` | `Phaser.GameObjects.Container[]` | One per wall, in input order. Depth is the wall's explicit `depth`, or its south edge when unset. |
| `bodies` | `Phaser.Physics.Arcade.StaticGroup \| null` | Static bodies when `collide` was true, otherwise `null`. Pass to `physics.add.collider`. |
| `setWalls(walls)` | `(walls: WallSpec[]) => this` | Replaces the wall list and rebuilds everything. |
| `redraw()` | `() => this` | Rebuilds with the current config. Call after changing texture contents. |
| `destroy()` | `() => void` | Destroys all containers and bodies. |

There is no incremental API. Any change rebuilds all walls.

## Geometry exports

These are pure functions with no Phaser dependency. They are what the unit tests cover.

### resolveWalls(walls, presets): ResolvedWall[]

Normalizes each wall, computes endpoint extensions, and produces every rectangle the renderer draws.

### ResolvedWall

| field | type | description |
| --- | --- | --- |
| `spec` | `WallSpec` | The normalized input, with `x1 <= x2` and `y1 <= y2`. |
| `horizontal` | `boolean` | `true` when `y1 === y2`. |
| `body` | `Rect` | Wall top including endpoint extensions. |
| `lip` | `Rect \| null` | Face below the body, `null` when the effective height (`height` override or preset `lipHeight`) is zero or negative. |
| `bodyPieces` | `Rect[]` | Body with window holes cut out. |
| `lipPieces` | `Rect[]` | Face with window holes cut out. |
| `windows` | `Rect[]` | Glass rectangles. |
| `sills` | `Rect[]` | Sill rectangles, face windows only. |
| `collider` | `Rect` | Static body rectangle. See [How it works](how-it-works.md#collision). |
| `depth` | `number` | Effective Container depth: the wall override when present, otherwise its south edge. |

### cutRects(rect, holes, horizontal): Rect[]

Subtracts axis-aligned `holes` from `rect`, assuming all holes share a band across the wall. Returns the remaining strips: two along the wall and one between each pair of holes.

### Rect

`{ x: number; y: number; w: number; h: number }`, top-left anchored.

## Depth convention

With automatic wall depths, set characters and props to their feet y each frame:

```ts
sprite.setOrigin(0.5, 1);
sprite.setDepth(sprite.y);
```

Explicit wall depths are absolute drawing orders, not world coordinates. If you
use them, your game must also position character depth relative to those values;
feet-y sorting alone may produce incorrect overlaps. The plugin does not track
foreign objects. Wallcraft's footprint-aware preview sorting is editor behavior,
not an exported library feature.

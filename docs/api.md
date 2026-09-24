# API reference

The renderer and types are available from the package root:

```ts
import { WallEditor, WallMapPlugin, WallMap, resolveWalls } from "@mertdogar/phaser-procedural-walls";
import type { WallMapConfig, WallSpec, WallPreset, WindowSpec, DoorSpec, DoorType, DoorState, ResolvedDoor, ResolvedWall, Rect } from "@mertdogar/phaser-procedural-walls";
```

For server-side geometry without importing Phaser, use the dedicated entry point:

```ts
import { resolveWalls, cutRects } from "@mertdogar/phaser-procedural-walls/geometry";
```

## WallEditor

`new WallEditor(scene, options)` attaches editing interactions and a Graphics
overlay to an existing, created Phaser scene. It needs neither Arcade Physics
nor `WallMapPlugin` registration. Its runtime imports Phaser and the library's
geometry and renderer code, not React or the standalone application's UI.

The host owns the `WallMapConfig`. Callbacks request edits; they don't mutate
your config or rebuild your `WallMap`. This lets you accept changes locally or
send them to a server before displaying the accepted result.

### Options and state

Pass these fields when you construct the editor:

| Field | Default | Description |
| --- | --- | --- |
| `config` | Required | Current `WallMapConfig`; use a new object when accepting edits. |
| `selectedIndex` | Required | Index in `config.walls`, or `null`. |
| `tool` | Required | `"wall"` to draw or `"select"` to select and drag handles. |
| `onAddWall(wall)` | Required | Requests adding a `WallSpec` after a draw gesture finishes. |
| `onSelectWall(index)` | Required | Requests selecting a wall, or clearing selection with `null`. |
| `onError(message)` | Optional | Reports invalid drags and keeps the last valid geometry. Without a handler, validation errors throw. An empty message clears the error. |
| `onUpdateWall(index, patch)` | Required | Requests a whole-wall, endpoint, window-offset, or door-offset edit when a drag finishes. |
| `enabled` | `true` | Whether editing input and the overlay are active. |
| `camera` | `scene.cameras.main` | Camera used to convert pointer coordinates and size handles. |
| `gridSize` | `32` | Positive, finite world-unit snap step and minimum drawn wall length. |
| `overlayDepth` | `10000` | Depth of the editing overlay. |
| `newWall` | Thickness `16` | Optional `preset`, `thickness`, and `height` defaults for new walls. |

Without an explicit new-wall preset, the editor uses `interior` if present,
otherwise the first preset. Drawing without an existing preset throws an error.

Exported types are `WallEditorOptions`, `WallEditorState`, `WallEditorCallbacks`,
and `WallEditorTool`. Wall selection uses array indices, not persistent IDs.
Translate indices into your own identifiers when sending edits to a server.

### Methods

Use these methods to connect your application's controls:

| Method or property | Behavior |
| --- | --- |
| `setState({ config, selectedIndex, tool, enabled? })` | Supplies the current accepted state. A changed config reference, selection, tool, or enabled state cancels any unfinished gesture. Omitted `enabled` means `true`. |
| `setNewWall({ preset?, thickness?, height? })` | Replaces new-wall defaults. Omitted thickness resets to `16`; omitted preset restores automatic selection. |
| `cancel()` | Discards the unfinished gesture without an edit callback. Wire your Escape key to it. |
| `dragging` | Whether a drawing, whole-wall, endpoint, window, or door gesture is in progress. |
| `refresh()` | Redraws the overlay, for example after changing camera zoom. |
| `destroy()` | Removes the component's input and shutdown listeners and destroys its overlay. Called automatically on scene shutdown. |

The component listens for pointer down, move, up, and up outside the canvas.
Only primary-button presses begin edits; it doesn't install keyboard, wheel,
pan, or zoom handlers. Coordinate your existing scene input so a wall gesture
doesn't also pick furniture or move the camera. Disable the editor when another
tool owns input. In a scene with multiple cameras, the host also controls which
cameras render the overlay.

Starting with 0.4.1, dragging the selected wall's green centerline
moves the entire segment. Both endpoints receive the same grid-snapped delta,
preserving length, orientation, off-grid alignment, and opening offsets. Endpoint
and opening handles take priority; connected segments stay fixed. A translucent,
non-colliding preview follows the drag without changing accepted data. Release
requests one coordinate patch, or none if the wall returns to its original
position. Cancellation, state changes, and destruction discard the preview.

### Accept edits locally

This example belongs inside a scene's `create` method, with an existing `config`:

```ts
const wallMap = new WallMap(this, config);
let selectedIndex: number | null = null;
let tool: WallEditorTool = "wall";

const sync = () => editor.setState({ config, selectedIndex, tool });
const commit = (walls: WallSpec[]) => {
  config = { ...config, walls };
  wallMap.setWalls(walls);
  sync();
};
const editor = new WallEditor(this, {
  config, selectedIndex, tool,
  onAddWall: (wall) => {
    selectedIndex = config.walls.length;
    tool = "select";
    commit([...config.walls, wall]);
  },
  onSelectWall: (index) => { selectedIndex = index; sync(); },
  onUpdateWall: (index, patch) => {
    commit(config.walls.map((wall, i) => i === index ? { ...wall, ...patch } : wall));
  },
});
```

Import `WallEditorTool` and `WallSpec` as types from the package root. The
[runnable embedding example](../demo/editor/EmbeddedEditorScene.ts) also shows
deletion, preset and dimension controls, window creation/removal, and cleanup.

Validate proposed edits before accepting them if your application has placement
rules. Door drags, window drags, and endpoint edits reject changes that would
place doors outside the wall or overlap another opening. The component does not validate world bounds, occupants, or connectivity. Opening overlap and wall bounds are validated by the library. To refuse an edit,
keep the current config and show your own message. Feed authoritative replacement
configs through `setState` to cancel gestures based on stale data.

Deletion and inspector changes are host operations on `config.walls`; there are
no global Delete shortcuts, persistence, undo history, or permission rules in
the component. Presets and texture loading also remain host responsibilities.
`WallMap.setWalls` replaces its physics group, so recreate any Arcade collider
bindings after accepting changes when collision is enabled.

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

The editor exports the same fields plus an optional `textures: Record<string, string>`. Each key is referenced by a preset or opening texture field; each value is an embedded PNG, JPEG, or WebP data URL. This field belongs to the editor format, not the library's `WallMapConfig` type. The library does not load these images automatically. Load them into Phaser before creating the wall map, as shown in the [Wallcraft guide](wallcraft.md#load-an-exported-map-in-phaser).

The upload control accepts files up to 5 MB each. Wall textures repeat at their original size; opening artwork is fitted once; the editor has no tile scaling or spritesheet-frame controls. Removing a texture assignment switches that surface to its color, but the uploaded image remains in the map's image collection and export.

### WallSpec

| field | type | required | description |
| --- | --- | --- | --- |
| `x1`, `y1`, `x2`, `y2` | `number` | yes | Floor-footprint centerline endpoints in world units. Either `x1 === x2` or `y1 === y2`; diagonal walls throw. Endpoint order does not matter. |
| `thickness` | `number` | yes | Wall body thickness across the centerline. |
| `height` | `number` | no | Nonnegative height above the floor; grows upward without moving collision. Overrides the preset's `lipHeight`. |
| `depth` | `number` | no | Explicit Phaser drawing depth for this wall. Defaults to the wall's south edge. Higher values draw later. |
| `preset` | `string` | yes | Key into `presets`. Unknown keys throw. |
| `windows` | `WindowSpec[]` | no | Windows along this wall. |
| `doors` | `DoorSpec[]` | no | Functional doors along this wall. |

### WindowSpec

Window artwork is optional and assigned per opening.

| field | type | description |
| --- | --- | --- |
| `offset` | `number` | Distance in world units from the wall's `(x1, y1)` end to the window's near edge, measured before any endpoint normalization. |
| `width` | `number` | Required positive window width along the wall. |
| `height` | `number` | Required positive, finite window height. |
| `sillHeight` | `number` | Required nonnegative distance from the floor to the window bottom. |
| `texture` | `string` | Optional horizontal-wall artwork key; replaces glass, frame, and sill. |
| `sideTexture` | `string` | Optional vertical-wall artwork key; otherwise uses procedural glass. |

### DoorSpec

Doors belong to their wall and use its preset. Each ID must be non-empty and
unique across the map. Invalid IDs, types, placement, or option values throw.
Openings must fit within the authored wall length and height. They conflict only
when both their along-wall and elevation intervals overlap. Touching edges and
windows above doors are allowed. Dimensions remain fixed when wall height changes.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | Required | Stable, map-wide unique identifier. |
| `type` | `DoorType` | Required | `"hinged"` or `"sliding"`. |
| `offset` | `number` | Required | Nonnegative distance from the authored wall start to the near edge. |
| `width` | `number` | Required | Positive, finite passage width along the wall. |
| `height` | `number` | Required | Positive, finite panel height above the floor. Wall remains above shorter doors. |
| `open` | `boolean` | `false` | Authored starting state, restored on rebuild. |
| `side` | `"start" \| "end"` | `"start"` | Hinge end or sliding retraction side, relative to authored wall direction. |
| `swing` | `"left" \| "right"` | `"left"` | Hinged swing side when looking from `(x1, y1)` toward `(x2, y2)`. Ignored for sliding doors. |
| `texture` | `DoorTextures` | None | Horizontal-wall artwork: `{ closed: string, open: string }`. Both keys are required. |
| `sideTexture` | `DoorTextures` | None | Vertical-wall artwork pair, assigned independently of front artwork. |

Load all assigned keys into Phaser before creating the map. Missing images throw.
Textured doors switch their image and collision immediately in `openDoor()` and
`closeDoor()`. An orientation without a pair keeps the procedural rendering.
Artwork preserves alpha and is drawn once, without tint, outlines, or tiling.
Horizontal artwork fits the configured width and height, including the top
thickness when the opening reaches the wall top. Vertical artwork uses
its aspect ratio and a projected height of opening width plus opening height;
it sits beside the wall on the door's swing side (west for sliding doors).
Author side door images facing west, with their frame at the right canvas edge;
they mirror automatically when the door swings east.
Vertical window artwork sits west of the wall at its configured elevation.
The entire image canvas, including transparent padding, participates in fitting.
Prepare sprites with consistent framing for open and closed states.

Untextured hinged doors rotate 90 degrees. Sliding doors disappear into the chosen side,
clipped to the doorway; they need no adjacent pocket space. Both take 250 ms for
a full transition. Reversing direction preserves the current position and speed.
For an eastbound wall, left swings north; for a southbound wall, left swings east.
Reversed endpoints preserve these authored directions through normalization.

```ts
const wallMap = this.add.wallMap({
  presets: { interior: { fill: 0xe7ded0, edge: 0x3c403a, doorFill: 0x99734f } },
  walls: [{
    x1: 0, y1: 0, x2: 320, y2: 0, thickness: 16, height: 100, preset: "interior",
    doors: [{ id: "kitchen-door", type: "hinged", offset: 112, width: 96, height: 80 }],
  }],
  collide: true,
});
wallMap.openDoor("kitchen-door");
```

### WallPreset

| field | type | default | description |
| --- | --- | --- | --- |
| `fill` | `number` | required | Wall body color. Also used for sills. Ignored for the body when `texture` is set. |
| `edge` | `number` | required | Outline stroke color for body, lip, and sill top edge. |
| `edgeWidth` | `number` | `2` | Outline stroke width. |
| `lipHeight` | `number` | `0` | Default wall height above the floor. `0` disables the face and forbids openings. |
| `lipFill` | `number` | `fill` | Face color. Ignored when `lipTexture` is set. |
| `texture` | `string` | none | Texture key tiled across the body with a TileSprite. |
| `lipTexture` | `string` | none | Texture key tiled across the face. |
| `doorFill` | `number` | `0x99734f` | Door panel color. |
| `doorFrame` | `number` | `edge` | Door frame and panel outline color. |
| `windowFill` | `number` | `0x3d7f88` | Glass color. |
| `windowAlpha` | `number` | `0.5` | Glass alpha. `1` makes windows opaque. |
| `windowFrame` | `number` | none | When set, a 1px frame is stroked around each window. |
| `windowInset` | `number` | `0.6` | Fraction of wall thickness occupied by glass on vertical walls; window height is explicit. |
| `sillThickness` | `number` | Wall thickness | Height of the opaque band at the bottom of each face window, clamped to the window height. Omit to follow each wall's thickness; an explicit number overrides it. `0` disables sills. |

Texture keys must exist in the scene's Texture Manager before `wallMap` is called.

## WallMap

The handle returned by the factory. It is not itself a Game Object; it owns wall and door Containers.

| member | type | description |
| --- | --- | --- |
| `scene` | `Phaser.Scene` | Owning scene. |
| `containers` | `Phaser.GameObjects.Container[]` | Surface containers in wall input order, followed by each wall’s door containers. Door panels use their floor position for depth unless the wall overrides `depth`. |
| `bodies` | `Phaser.Physics.Arcade.StaticGroup \| null` | Static bodies when `collide` was true, otherwise `null`. Pass to `physics.add.collider`. |
| `setWalls(walls)` | `(walls: WallSpec[]) => this` | Replaces the wall list and rebuilds everything. |
| `redraw()` | `() => this` | Rebuilds with the current config. Call after changing texture contents. |
| `openDoor(id)` | `(id: string) => this` | Opens a door, reversing a closing animation. |
| `closeDoor(id)` | `(id: string) => this` | Closes a door, restoring collision immediately. |
| `toggleDoor(id)` | `(id: string) => this` | Reverses the current target state. |
| `getDoorState(id)` | `(id: string) => DoorState` | Returns `"closed"`, `"opening"`, `"open"`, or `"closing"`. |
| `destroy()` | `() => void` | Destroys containers and bodies and removes scene listeners. Also runs on scene shutdown. |

Door methods update existing objects without replacing physics groups. Repeating
the current target is a no-op; unknown IDs throw. The doorway stays blocked until
fully open and becomes blocked as soon as closing starts. The moving panel has
no physical collision. With `collide: false`, visuals and state still work.

The consuming game owns interaction triggers and checks occupants before closing.
No automatic obstruction checks, locks, or save-game behavior are provided.
Runtime changes do not mutate authored `open` values. `setWalls()` and `redraw()`
reset doors to their authored state and replace physics groups; rebind your Arcade
colliders after either operation.

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
| `lip` | `Rect \| null` | Bounding south face below the raised body; `null` when effective wall height is zero. Negative heights throw. |
| `surfaces` | `WallSurface[]` | Projected rectangles with material `kind`, floor south edge `floorY`, and drawing `depth`. |
| `bodyPieces` | `Rect[]` | Body with window and door holes cut out. |
| `lipPieces` | `Rect[]` | Face with window and door holes cut out. |
| `windows` | `Rect[]` | Glass rectangles. |
| `sills` | `Rect[]` | Sill rectangles, face windows only. |
| `collider` | `Rect` | Uncut footprint bounding rectangle; includes doorways. See [How it works](how-it-works.md#collision). |
| `colliderPieces` | `Rect[]` | Permanent wall colliders, excluding doorways. |
| `doors` | `ResolvedDoor[]` | Normalized door `spec` and its doorway `collider`. Add that blocker unless the door is fully open. |
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

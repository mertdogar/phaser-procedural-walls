# API and geometry

This reference tracks the repository's consumer API, including geometry changes
after the original 0.2.0 release. Check the installed package before relying on
the current collision or sill defaults. Distances are world pixels. Colors are
numbers, such as `0xb59a8c` in TypeScript or `11901580` in JSON.

## Imports

Version 0.4.0 also exports `WallEditor` and its `WallEditorOptions`,
`WallEditorState`, `WallEditorCallbacks`, and `WallEditorTool` types from the
package root. Construct it during an existing scene's `create` with `config`,
`selectedIndex`, `tool`, and `onAddWall`, `onSelectWall`, and `onUpdateWall`
callbacks. Callbacks request edits; the host accepts or refuses them, rebuilds
its renderer, and supplies accepted state with `setState`.

Use `enabled: false` to suspend editing, `cancel()` for Escape, `setNewWall` for
drawing defaults, and `refresh()` after changing camera zoom. `dragging` reports
an active gesture. `destroy()` removes listeners and handles; scene shutdown
calls it automatically. Camera navigation, keyboard controls, persistence,
validation, deletion, and inspector UI remain host responsibilities. Rebind
Arcade colliders when `WallMap.setWalls` replaces the wall physics group.

Version 0.4.1 also supports dragging the selected centerline to move a
whole wall. Both endpoints receive the same grid-snapped delta; windows retain
their offsets and other walls stay fixed. A non-colliding ghost previews the
move, then one `onUpdateWall` coordinate patch is requested on release. Endpoint
and window handles take priority. Cancellation discards the ghost without edits.

Use the root for browser rendering and type-only imports for shared types.

```ts
import { WallMapPlugin, WallMap } from "@mertdogar/phaser-procedural-walls";
import type {
  WallMapConfig, WallSpec, WallPreset, WindowSpec, DoorSpec, DoorType, DoorState, DoorTextures, Rect, ResolvedWall, WallSurface,
} from "@mertdogar/phaser-procedural-walls";
```

For Node, server validation, or geometry-only work, use the Phaser-free entry.
The root also exports `resolveWalls`, but not `cutRects` or `endExtension`.

```ts
import {
  resolveWalls, cutRects, endExtension,
} from "@mertdogar/phaser-procedural-walls/geometry";
```

## Map data

These interfaces describe the accepted config shape.

```ts
interface WallMapConfig {
  presets: Record<string, WallPreset>;
  walls: WallSpec[];
  collide?: boolean;
}
interface WallSpec {
  x1: number; y1: number; x2: number; y2: number;
  thickness: number;
  height?: number;
  depth?: number;
  preset: string;
  windows?: WindowSpec[];
  doors?: DoorSpec[];
}
interface WindowSpec {
  offset: number; width: number; height: number; sillHeight: number;
  texture?: string; sideTexture?: string;
}
interface DoorTextures { closed: string; open: string }
interface DoorSpec {
  id: string;
  type: "hinged" | "sliding";
  offset: number;
  width: number;
  height: number;
  open?: boolean;
  side?: "start" | "end";
  swing?: "left" | "right";
  texture?: DoorTextures;
  sideTexture?: DoorTextures;
}
interface WallPreset {
  fill: number; edge: number;
  edgeWidth?: number;
  lipHeight?: number; lipFill?: number;
  windowFill?: number; windowFrame?: number;
  windowInset?: number; windowAlpha?: number; sillThickness?: number;
  texture?: string; lipTexture?: string;
  doorFill?: number; doorFrame?: number;
}
```

`collide` defaults to false. Each wall must be horizontal or vertical and name
an existing preset; diagonals and unknown presets throw. Validate arbitrary
JSON separately for finite coordinates, positive thickness and window widths,
nonzero segment lengths, and windows within the segment without overlaps.
The geometry function doesn't provide exhaustive input validation.

Window `offset` measures from the original `(x1, y1)` toward `(x2, y2)`.
Reversing endpoints transforms the offset to `length - offset - width` during
normalization. Windows don't remove physics bodies.

## Doors

Door IDs must be non-empty and map-wide unique. Doors must fit within their wall
and cannot overlap another opening in both position and elevation. Windows
above doors are allowed. Invalid door data throws during
geometry resolution and map construction. Offsets follow authored wall direction.
`side` defaults to `"start"` and selects the hinge or retraction side. `swing`
defaults to `"left"` relative to authored wall direction and applies only to hinges.
`open` defaults to false and defines the starting state.

`openDoor(id)`, `closeDoor(id)`, and `toggleDoor(id)` return the map and update the
door directly. `getDoorState(id)` returns `"closed"`, `"opening"`, `"open"`, or
`"closing"`. Unknown IDs throw. Without artwork, both types use a 250 ms transition and reverse
immediately from the current position; repeated target requests are no-ops.
Hinges rotate 90 degrees; sliding panels retract within the doorway without
pocket-space validation.

Collision blocks only the doorway, stays enabled until fully open, and returns
when closing starts. The moving panel is not a physical body. The consuming game
owns triggers and occupancy checks. Runtime state never changes the authored
map; `setWalls` and `redraw` reset all doors to their authored starting state.

## Presets and faces

`fill` and `edge` are required. Optional values have these defaults.

| Field | Default | Meaning |
| --- | --- | --- |
| `edgeWidth` | `2` | Outline width |
| `lipHeight` | `0` | Wall height above the floor |
| `lipFill` | `fill` | Face color |
| `doorFill` | `0x99734f` | Door panel color |
| `doorFrame` | `edge` | Door frame and panel outline |
| `windowFill` | `0x3d7f88` | Glass color |
| `windowAlpha` | `0.5` | Glass opacity |
| `windowFrame` | absent | Optional 1px frame color |
| `windowInset` | `0.6` | Glass width across a vertical wall’s thickness |
| `sillThickness` | Wall thickness | Opaque sill height, clamped to window height; an explicit value overrides it, and `0` disables it |
| `texture` | absent | Loaded texture key for body and sills |
| `lipTexture` | absent | Loaded texture key for face |

Effective face height is `wall.height ?? preset.lipHeight ?? 0`. Zero disables
the face. Delete a wall's `height` to inherit later preset height changes.
The top moves upward from the fixed footprint. South-facing surfaces extend
from their raised top toward their floor position. Horizontal windows have
optional decorative sills; vertical openings project their width and height
along screen y. Zero-height walls cannot contain openings.

Textures tile at their original pixel size and replace the corresponding
surface color. There are no preset frame, scale, or animation fields.

## Geometry and depth

Feet-y character sorting assumes automatic wall depths. Explicit depths require
matching character sorting in the consumer game. Wallcraft's footprint-aware
preview sorting is editor-only and is not exported with the map.

`resolveWalls(walls, presets)` returns one resolved wall per input wall.
Endpoints normalize left-to-right or top-to-bottom. At connected endpoints,
the body extends by half the maximum thickness of an intersecting wall to
fill corners and T-junctions.

Each result has `surfaces`, `spec`, `horizontal`, `body`, `lip`, `bodyPieces`, `lipPieces`,
`windows`, `sills`, `collider`, `colliderPieces`, `doors`, and `depth`. Rectangles use
`{ x, y, w, h }` with top-left origin. `lip` can be null. `collider` is the
uncut footprint; use `colliderPieces` for permanent collision and each resolved
door's `{ spec, collider }` to add the blocker unless fully open.

The south edge is `body.y + body.h + (lip?.h ?? 0)`:

- Colliders stay on the authored floor centerline; the body projects upward by wall height.
- Both orientations preserve footprint dimensions; the raised face adds no
  collision area. All heights preserve doorway gaps at floor level.
- Default depth is the south edge. `wall.depth` overrides only draw order;
  larger depths draw later. Height changes projection without moving colliders.

`cutRects(rect, holes, horizontal)` subtracts axis-aligned rectangles, including
holes in different elevation bands. The boolean controls piece partitioning. It isn't a general polygon boolean operation.
`endExtension(px, py, self, all)` returns the connected endpoint extension.

## WallMap lifecycle

`this.add.wallMap(config)` returns a `WallMap`, which owns wall and door containers
rather than being a game object itself.

| Member | Behavior |
| --- | --- |
| `containers` | Surface containers per wall, followed by its door containers |
| `bodies` | Arcade static group, or null without `collide: true` |
| `setWalls(walls)` | Replaces wall list and rebuilds; returns this |
| `redraw()` | Rebuilds current config; returns this |
| `destroy()` | Destroys owned containers and static bodies |

Both rebuild methods destroy and replace the static group. See
[Phaser integration](integration.md) for reconnecting collisions.

Opening dimensions are required and stay fixed as wall height changes. Windows
use `sillHeight` for floor elevation; preset `sillThickness` is decorative.
Openings must fit the wall and cannot overlap in both position and elevation.
Windows can sit above doors. Short doors retain solid headers.

## Opening artwork

Window `texture` is a horizontal artwork key and `sideTexture` is a vertical key.
Door fields with those names hold `{ closed, open }` texture-key pairs. Both keys
must be non-empty. Assignments are per opening, independent of wall presets.
Missing artwork for an orientation means procedural fallback; a referenced but
unloaded active texture is an error, not a fallback.

Front artwork fits once to the opening, preserving alpha and replacing procedural
decoration. A top-reaching opening also includes the wall cap thickness.
Side artwork keeps its aspect ratio at projected height `width + height`.
Window side artwork sits west of the wall. Door side artwork is authored facing
west with its frame at the right canvas edge, then mirrors for an east-facing
hinged swing. Sliding side artwork sits west.

Texture fitting includes transparent outer padding. Use front images flush to
their canvas edges and door pairs with matching frame placement and canvas size.
Textured door operations switch imagery and collision immediately and return
only open/closed states; untextured doors retain animation and intermediate states.
Window images preserve their own alpha; preset glass opacity does not tint them.

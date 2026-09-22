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

The source after 0.4.0 also supports dragging the selected centerline to move a
whole wall. Both endpoints receive the same grid-snapped delta; windows retain
their offsets and other walls stay fixed. A non-colliding ghost previews the
move, then one `onUpdateWall` coordinate patch is requested on release. Endpoint
and window handles take priority. Cancellation discards the ghost without edits.

Use the root for browser rendering and type-only imports for shared types.

```ts
import { WallMapPlugin, WallMap } from "@mertdogar/phaser-procedural-walls";
import type {
  WallMapConfig, WallSpec, WallPreset, WindowSpec, Rect, ResolvedWall,
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
}
interface WindowSpec { offset: number; width: number }
interface WallPreset {
  fill: number; edge: number;
  edgeWidth?: number;
  lipHeight?: number; lipFill?: number;
  windowFill?: number; windowFrame?: number;
  windowInset?: number; windowAlpha?: number; sillHeight?: number;
  texture?: string; lipTexture?: string;
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

## Presets and faces

`fill` and `edge` are required. Optional values have these defaults.

| Field | Default | Meaning |
| --- | --- | --- |
| `edgeWidth` | `2` | Outline width |
| `lipHeight` | `0` | Face height below the body |
| `lipFill` | `fill` | Face color |
| `windowFill` | `0x3d7f88` | Glass color |
| `windowAlpha` | `0.5` | Glass opacity |
| `windowFrame` | absent | Optional 1px frame color |
| `windowInset` | `0.6` | Fraction of face height or body thickness |
| `sillHeight` | Wall thickness | Opaque sill height, clamped to window height; an explicit value overrides it, and `0` disables it |
| `texture` | absent | Loaded texture key for body and sills |
| `lipTexture` | absent | Loaded texture key for face |

Effective face height is `wall.height ?? preset.lipHeight ?? 0`. Zero disables
the face. Delete a wall's `height` to inherit later preset height changes.
The face extends downward in screen space, including an end face below a
vertical wall. Horizontal windows occupy the face when present, otherwise
the body; vertical windows occupy the body. Only horizontal face windows
have sills.

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

Each result has `spec`, `horizontal`, `body`, `lip`, `bodyPieces`, `lipPieces`,
`windows`, `sills`, `collider`, and `depth`. Rectangles use
`{ x, y, w, h }` with top-left origin. `lip` can be null.

The south edge is `body.y + body.h + (lip?.h ?? 0)`:

- Colliders match the body rectangle shifted south by the effective face height.
- Both orientations preserve footprint dimensions; the raised face adds no
  collision area. Equal-height segments preserve doorway gaps at floor level.
- Default depth is the south edge. `wall.depth` overrides only draw order;
  larger depths draw later. Height changes geometry and colliders as well.

`cutRects(rect, holes, horizontal)` subtracts holes sharing a band across a
rectangle. It isn't a general polygon boolean operation.
`endExtension(px, py, self, all)` returns the connected endpoint extension.

## WallMap lifecycle

`this.add.wallMap(config)` returns a `WallMap`, which owns one container per
wall rather than being a game object itself.

| Member | Behavior |
| --- | --- |
| `containers` | Containers in input order, each with its own depth |
| `bodies` | Arcade static group, or null without `collide: true` |
| `setWalls(walls)` | Replaces wall list and rebuilds; returns this |
| `redraw()` | Rebuilds current config; returns this |
| `destroy()` | Destroys owned containers and static bodies |

Both rebuild methods destroy and replace the static group. See
[Phaser integration](integration.md) for reconnecting collisions.

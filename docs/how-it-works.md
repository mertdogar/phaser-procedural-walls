# How it works

This page explains the decisions behind the plugin so you can predict what it will draw and why. It is background reading, not a set of steps.

## The wall model

A wall's endpoints describe the centerline of its footprint on the floor.
Thickness extends equally to either side. Height projects upward on screen:
the **body** is the raised top and the **lip** is the visible south-facing face.
Increasing height moves the top upward without moving the footprint, endpoints,
or connected walls. Each wall keeps its own height at a junction.

Only axis-aligned walls are supported. Wall geometry stays rectangular; hinged door panels can rotate.

## Corners and T-junctions

![Close-up of a T-junction and a corner](images/junctions.jpg)

You author endpoints on the centerline, so two walls meeting at a corner would leave a notch the size of half a thickness. The plugin fixes this by extension: for each endpoint of a wall, it looks for any other wall whose centerline passes through that point, including its interior. If it finds one, the endpoint is pushed outward by half of that wall's thickness.

At an L corner both walls extend and overlap. At a T-junction only the stem extends, into the bar. Since surfaces have their own outlines and drawing depths, you may see one wall's outline cross the other at a junction. Set that wall's optional `depth` to change which segment draws last.

## Depth sorting

The renderer splits solid wall sections around openings and projects their tops
and south-facing faces. Each surface gets a Container sorted by its floor south
edge. This lets a vertical door appear in front of the rear jamb and behind the
nearer wall section. Surfaces at the same floor edge use elevation to resolve ties.
Characters set `depth` to their feet y: north of a surface they draw behind it;
south of it they draw in front.

Wallcraft's **Drawing order** field sets the wall's absolute `depth`. Higher
values draw later. These overrides persist in JSON and don't move colliders.
In a consumer game, feet-y sorting alone may no longer match custom wall depths.
Leave the field blank for automatic sorting, or implement character sorting
that accounts for the overrides.

Wallcraft preview handles this separately: it compares the player's feet with
the bottom footprints of overlapping walls and places the player relative to
their drawing depths without changing wall order. If custom wall orders conflict
with the required player order, preview prioritizes walls hiding the player.
This logic is editor-only; exporting JSON does not add it to your game.

## Collision

When `collide` is on, static bodies match the floor footprint, including junction
extensions. Height never shifts or enlarges collision. Doors cut passages from
that footprint; windows leave it solid, even when their sill elevation is zero.

The raised face is visual space. Characters can pass behind it. Open doors permit
passage under headers or transom windows; there is no character-height or
head-clearance simulation.

For another physics engine, read `colliderPieces` from `resolveWalls` for the
permanent wall shapes, plus each resolved door's `collider` when it blocks passage.
The existing `collider` field is the uncut footprint bounding rectangle.

## Windows

Each window has a required `height` and `sillHeight`, the distance from the floor
to its bottom edge. Its `offset` and `width` place it along the wall. These values
stay fixed when wall height changes. Stacked windows and windows above doors
are supported: openings conflict only when both their along-wall and elevation
intervals overlap. Touching edges are allowed.

Openings must fit within the wall length and height. Invalid edits or JSON imports
report an error; they never silently resize openings. Zero-height walls cannot
contain openings.

The preset's `sillThickness` controls the opaque decorative band at the bottom
of a horizontal window. It is separate from the window's floor elevation.
`windowInset` controls the width of glass across a vertical wall's thickness.
Vertical openings use the same upward projection; solid wall above or in front
of them can hide them in this top-down view.

## Doors

Doors are wall-owned passages with independent IDs and runtime state. Geometry
cuts the wall visuals up to the required door `height`, retaining wall above a
shorter door, and cuts the footprint around each passage. A separate static body
blocks each doorway until its door is fully open; closing restores it immediately.
Without artwork, hinged panels rotate 90 degrees and sliding panels retract
out of sight within the doorway. With an assigned artwork pair, the image and
collision switch immediately. Panels are visual and cannot push characters.

The game calls door methods and checks occupancy before closing. Direction changes
reverse procedural animation without queuing commands. Rebuilding walls restores
the authored starting state. See the [door API](api.md#doorspec) for schema details.

## Textures

A preset may name a `texture` for the body and a `lipTexture` for the face. Textured rectangles are drawn with TileSprites whose tile position is set to the rectangle's world position, so a texture stays aligned across the pieces of one wall and across neighbouring walls. Each untextured surface uses a Graphics object.

![Kitchen with plank walls next to brick and plaster presets](images/presets-kitchen.jpg)

![Meeting room with stone walls](images/presets-stone.jpg)

The older scene examples above illustrate tiled materials. Wallcraft now lets you upload body and front-face images in the preset manager. It stores images as data URLs in the editor's `textures` collection and loads them into Phaser before rebuilding the walls. The library itself still expects already-loaded texture keys.

![Wallcraft map with tiled body and front-face textures](images/wallcraft-textures.png)

Preset edits affect every wall that references that preset. Renaming a preset updates those references. A wall's individual height override takes precedence over the preset height. The editor keeps changes in memory; JSON export is how you retain and transfer them.

## Opening artwork and projection

Wall materials tile across surfaces; opening artwork is one fitted image. A
window image replaces procedural glass, frame, and sill. Image alpha controls
transparency independently of the preset's glass opacity. Window artwork does
not turn a window into a passage.

Front artwork fits the opening on a horizontal wall. If an opening reaches the
wall top, its image also covers the thickness of the removed cap. This keeps a
full-height closed door attached to both the top and the floor. Outer transparent
padding is still part of the image canvas, so it produces apparent gaps.

A vertical opening is viewed edge-on. Its image height combines its length along
the floor and its elevation; width follows the image's aspect ratio. Side door
artwork sits beside the wall, where an overhead solid section cannot hide it.
It faces west by default and mirrors for an east-facing hinged swing. Vertical
window artwork sits west of the wall. This is a 2.5D visual convention, not a
3D mesh or a physical change to the footprint.

Front and side assignments are independent. Omitting one orientation preserves
its procedural fallback. Open and closed door textures represent complete states,
so their collision switches immediately instead of waiting for an animation.

## What the plugin does not do

- Diagonal walls or curved walls.
- Incremental wall geometry updates. Door operations are incremental; wall edits rebuild the map.
- Tracking character depth. Feet-y sorting works with automatic depths; custom
  drawing orders require your own sorting logic.

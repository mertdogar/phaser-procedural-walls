# How it works

This page explains the decisions behind the plugin so you can predict what it will draw and why. It is background reading, not a set of steps.

## The wall model

A wall is a centerline segment plus a thickness. The renderer turns that into two rectangles: the **body**, which is the wall top seen from above, and the **lip**, a face drawn directly below the body. The lip is what makes a wall read as tall in a top-down view. It is purely cosmetic in world space: it does not shift the wall, it hangs south of it.

Only axis-aligned walls are supported. Wall geometry stays rectangular; hinged door panels can rotate.

## Corners and T-junctions

![Close-up of a T-junction and a corner](images/junctions.jpg)

You author endpoints on the centerline, so two walls meeting at a corner would leave a notch the size of half a thickness. The plugin fixes this by extension: for each endpoint of a wall, it looks for any other wall whose centerline passes through that point, including its interior. If it finds one, the endpoint is pushed outward by half of that wall's thickness.

At an L corner both walls extend and overlap. At a T-junction only the stem extends, into the bar. Since bodies are drawn before strokes within each wall, and each wall is its own object, you may see one wall's outline cross the other at a junction. Set that wall's optional `depth` to change which segment draws last.

## Depth sorting

Each wall is a separate Container with `depth` set to its **south edge**, the bottom of the lip, unless the wall provides an explicit `depth` override. Characters set `depth` to their feet y. The automatic rule produces the two cases you expect:

![Player in front of the wall](images/player-in-front.jpg)

A character south of the wall has feet y greater than the wall's depth, so it draws on top, standing against the face.

![Player behind the wall, visible through the glass](images/player-behind-window.jpg)

A character north of the south edge draws underneath. This includes a character standing inside the wall zone, which is possible because of how collision works.

Vertical walls use the same rule with their bottom end as the south edge. A character walking alongside a vertical wall never overlaps it, so the sort order there rarely matters.

A single Container for the whole map cannot do this, since one depth value cannot be both above and below the player. That is why the plugin returns a handle over many containers instead of one Game Object.

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

When `collide` is on, each wall gets static bodies matching its bottom
footprint: the wall body rectangle shifted south by its face height. Horizontal
footprints retain the wall thickness; vertical footprints retain the wall length
and thickness, including junction extensions. The raised face is not solid space.

A wall's `height` overrides its preset's `lipHeight`. Increasing it extends the
visible face south and shifts the footprint south without enlarging it. With no
face, the collider matches the body. Height is therefore different from a
drawing-order override.

Characters collide at floor level rather than against the full visible face.
This lets a character pass behind a raised wall and keeps doorway gaps between
vertical segments open at their projected floor positions. Segments with different
face heights have different floor offsets; use matching heights for aligned gaps.

For another physics engine, read `colliderPieces` from `resolveWalls` for the
permanent wall shapes, plus each resolved door's `collider` when it blocks passage.
The existing `collider` field is the uncut footprint bounding rectangle.

## Windows

Windows on a wall with a lip are cut into the face; walls without a lip, and vertical walls, put the window into the body instead. A window is a real hole: the face is drawn as up to four tiled pieces around each window, and a translucent glass rectangle is painted over the gap. Anything drawn beneath the wall shows through with the glass tint. This is why the character behind the wall is visible in the window above.

A **sill** is drawn at the bottom of each face window, using the body fill or texture. It is opaque, sits above the glass, and gives the window a horizontal surface to sit on. Window coordinates are rounded to whole pixels so the tiled pieces meet without visible seams.

## Doors

Doors are wall-owned passages with independent IDs and runtime state. Geometry
cuts the wall visuals and footprint around each passage. A separate static body
blocks each doorway until its door is fully open; closing restores it immediately.
Hinged panels rotate 90 degrees, while sliding panels retract out of sight within
the doorway. Panels are visual and cannot push characters.

The game calls door methods and checks occupancy before closing. Direction changes
reverse the current animation without queuing commands. Rebuilding walls restores
the authored starting state. See the [door API](api.md#doorspec) for schema details.

## Textures

A preset may name a `texture` for the body and a `lipTexture` for the face. Textured rectangles are drawn with TileSprites whose tile position is set to the rectangle's world position, so a texture stays aligned across the pieces of one wall and across neighbouring walls. Untextured rectangles go into a single Graphics object per wall.

![Kitchen with plank walls next to brick and plaster presets](images/presets-kitchen.jpg)

![Meeting room with stone walls](images/presets-stone.jpg)

The older scene examples above illustrate tiled materials. Wallcraft now lets you upload body and front-face images in the preset manager. It stores images as data URLs in the editor's `textures` collection and loads them into Phaser before rebuilding the walls. The library itself still expects already-loaded texture keys.

![Wallcraft map with tiled body and front-face textures](images/wallcraft-textures.png)

Preset edits affect every wall that references that preset. Renaming a preset updates those references. A wall's individual height override takes precedence over the preset height. The editor keeps changes in memory; JSON export is how you retain and transfer them.

## What the plugin does not do

- Diagonal walls or curved walls.
- Incremental wall geometry updates. Door operations are incremental; wall edits rebuild the map.
- Tracking character depth. One line in your update loop does that.

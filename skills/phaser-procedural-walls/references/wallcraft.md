# Wallcraft workflow

Wallcraft is the bundled, in-memory wall editor. Export JSON before closing or
reloading the page; don't promise automatic persistence.

In 0.4.0 its canvas uses the public `WallEditor` component from the library.
Consumers can attach the same interactions to an existing Phaser scene without
embedding the React application. Open `/?embedded` in the demo or packaged editor
for a Phaser-only example. Keep host data, rendering, camera navigation, and UI
outside the component; feed accepted edits back with `setState`.

## Launch the editor

With Node 20 or newer and a release containing the editor CLI, run either
command. These references track source; check the installed package version
and types before assuming it contains the latest changes.

```sh
npx @mertdogar/phaser-procedural-walls@latest editor
pnpx @mertdogar/phaser-procedural-walls@latest editor
```

Open the localhost URL printed in the terminal. The server binds to
`127.0.0.1`, chooses an available port, and doesn't open a browser automatically.
Append `--port 8080` to choose a port. Ctrl+C stops it. `--help` shows usage.
There is no CLI JSON-input argument or headless export command.

## Edit walls and presets

Use the editor controls to work with the same fields as the library config.

Select and Draw tools are in the top bar. Its Help button explains navigation,
editing, preview, and saving; the GitHub button opens the project repository.

In the repository editor, **Fit map** frames the floor plan. Two-finger scrolling
pans; pinching or Ctrl+wheel zooms around the cursor. The zoom buttons and
middle-button panning also work. There is no hand tool. The canvas fills its
pane, and world axes mark `(0, 0)`. Preview follows the moving player. These
controls describe current source, not necessarily the published npm release;
the original 0.2.0 editor has a fixed viewport.

1. Draw axis-aligned walls on the 32px grid. Switch to **Select** and click a
   wall to inspect it.
2. Drag endpoint anchors or edit coordinates. Drag windows along the wall or
   edit their offsets rather than relying on even spacing. Set **Width (px)**
   beside **Offset (px)** in the inspector to resize each opening within the wall.
3. Edit thickness and height independently. Height affects the rendered face;
   it isn't a physical elevation. Clear drawing depth for automatic ordering,
   or set a larger value to draw a wall later.
4. Open **Presets** to create, duplicate, rename, or edit shared styles. Use
   **Save preset** to apply changes; switching or closing can discard unsaved
   edits. Renaming updates wall references. Only unused presets can be deleted,
   and at least one must remain.
5. Use **Preview** to walk with arrow keys and test collisions. Preview enables
   collisions for its player without changing the exported `collide` setting.
6. Use **Export JSON** to save and **Import** to reopen a map.

Wall `height` overrides preset `lipHeight`. To restore inheritance, remove
that wall's `height` field in JSON; don't substitute zero, which disables the
face. Undo/redo covers add, duplicate, delete, reorder, bulk dimensions, reset,
import, saved preset edits, accepted inspector edits, completed drags, and applied
opening artwork. Preview interactions do not alter authored door states.

## Layers and map preferences

The resizable right sidebar contains Layers above Wall inspector. Its width and
vertical split can be adjusted independently. Selecting a layer selects its wall.
The list is front-to-back; arrow buttons move the selected wall one position by
writing explicit depths, which persist in exports. Reordering does not move
colliders. Clear Drawing order to restore automatic depth for an individual wall.
Duplicate copies windows and offsets the selected copy by 32 px on both axes.
Delete removes the selected segment. Layer reordering is not drag-and-drop.

Map preferences applies height or thickness to every existing wall using separate
Apply to all buttons. Height accepts zero; thickness must be positive. Bulk
height replaces wall overrides. Presets and future walls remain unchanged.

Blank preset Sill thickness follows each wall's thickness, clipped to window height.
Explicit values override this; zero disables sills. Rename the old preset
`sillHeight` field to `sillThickness`. A short opening can be fully covered by its sill.

Preview collisions use the fixed floor footprint. Changing height raises the
wall without shifting doorway gaps. Windows remain visual, not walkable.

Preview also sorts its player against overlapping wall footprints while retaining
custom wall depths. This is editor-only logic, not part of JSON exports or the
library. Consumer games need their own character sorting for explicit depths.

## Assign images to presets

Use a preset's body or face image control to upload PNG, JPEG, or WebP files
up to 5 MB each, then save the preset. Reuse a previously uploaded image by
selecting it. These are tiled textures, not animated character sprites.

The body uses `texture`; the face uses `lipTexture`. Images repeat at their
original size; there is no tile-scale or spritesheet-frame setting. Returning
to a solid color removes the assignment but retains the uploaded asset in the
map's collection and export.

Exports add `textures: Record<string, string>` to the ordinary config. Each
key is a preset or opening texture key and each value an image data URL. Keep those keys
and the dictionary together. Missing embedded images must be uploaded or the
surface changed to a solid color in the editor.

The library doesn't consume the image dictionary automatically. Follow
[Phaser integration](integration.md#load-wallcraft-textures) to preload these
assets, then construct the map. Add functional hinged or sliding doors in the
wall inspector; window openings remain solid for collisions. Door fields and
preset colors survive JSON round trips. Press E near a door in preview to toggle
it; the preview refuses closure while the player occupies its doorway.

## Assign opening artwork

Each door or window has an **Opening artwork** section in its wall inspector.
Choose an existing image or upload PNG, JPEG, or WebP up to 5 MB, then click
**Apply artwork**. Front means horizontal walls; side means vertical walls.
Windows take one image per orientation, doors require a complete closed/open
pair. Clear an orientation to restore procedural rendering. Removing an
assignment retains the image in the map collection.

The generated sample assets have front frames flush with the canvas. Side door
pairs face west with their frame at the right edge and mirror for east-facing
swings. Matching state dimensions prevent visual jumps; outer transparent
padding creates gaps. Artwork fits once; preset materials tile.

Textured door state and collision change instantly. Procedural doors still
animate. Uploaded image alpha replaces the window's generated glass, frame, and
sill. Assignments and images are included in JSON and undo/redo history.

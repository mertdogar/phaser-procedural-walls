# Use Wallcraft

Wallcraft is the repository's React, Vite, shadcn, and Phaser editor prototype. Use it to build an axis-aligned wall map and try it with a character before exporting it to your game.

This guide describes the current repository. A published npm release may lag
behind these controls and collision changes; run from source to use this version.

## Start the editor

With Node 20 or newer, run:

```bash
npx @mertdogar/phaser-procedural-walls@latest editor
# or
pnpx @mertdogar/phaser-procedural-walls@latest editor
```

The package version must include the editor CLI. It serves a prebuilt app; no repository checkout or Vite development server is needed. Open the printed `http://127.0.0.1:PORT/` URL. The server listens only on your computer and chooses an available port by default.

To choose a port or see help:

```bash
npx @mertdogar/phaser-procedural-walls@latest editor --port 8080
npx @mertdogar/phaser-procedural-walls@latest --help
```

If a chosen port is occupied, choose another or omit `--port`. Press Ctrl+C to stop. The launcher serves only the bundled app, not files from your working directory. Maps stay in browser memory; use Export JSON to keep them.

### Run from source

For development, run these commands from the repository root:

```bash
pnpm install
pnpm dev
```

Open the local URL Vite prints. The editor starts with a sample floor plan. Changes live in memory: export before closing or reloading.

`pnpm build` builds the plugin library into `dist/` and the standalone editor into `dist/editor/`. Run `pnpm editor` to serve that build, or `pnpm editor --port 8080` to choose a port. Run `pnpm test:cli` after building to test the launcher. Rebuild after editing source files when using the packaged launcher.

## Draw and edit walls

Use **Fit map** to see the full floor plan. Two-finger trackpad scrolling pans
in either direction; pinching zooms around the cursor. With a mouse, scroll to
pan, use Ctrl+wheel or the **−** and **+** buttons to zoom, or drag with the
middle button to pan. No separate pan tool is needed.

The canvas fills the available pane. Axes cross at world coordinate `(0, 0)`;
they move with the map, not the screen. Drawing and endpoint edits snap to 32 px
without being limited to the initial viewport. The grid shows fewer lines when
zoomed out, but snapping stays at 32 px. Preview bounds follow the map, and the
camera follows the player while moving.

1. Choose the wall tool in the top bar and drag on the map. Drawing snaps to a 32 px grid and locks to a horizontal or vertical line.
2. Choose the pointer tool and click a wall. Its endpoints and inspector appear.
3. Drag either circular endpoint to resize the wall. The opposite endpoint stays fixed, and the segment stays axis-aligned.
4. Use **X1**, **Y1**, **X2**, and **Y2** for numeric coordinates. Keep either X1 = X2 or Y1 = Y2; diagonal walls are unsupported.
5. Set **Thickness** for body width and **Height** for the visible face. An edited height overrides the preset for that wall.
6. Use **Drawing order** to resolve overlapping segments. Higher values render later. Clear it for automatic sorting.

![Selected wall with endpoint handles, layers above the docked inspector, and origin axes](images/wallcraft-editor.png)

Use the **Help** question-mark button in the top bar for navigation, editing,
preview, and saving instructions. The GitHub button opens the project repository.

The editor and preview screenshots use the sample map with all wall heights set
to 80 px through **Map preferences**. The inspector is scrolled to the window
controls; in preview, the player is partially hidden behind the interior wall.

New walls use `interior` when that preset exists, otherwise the first available preset. Choose a different preset in the selected wall's inspector. **Delete** removes the selected wall; **Reset** restores the entire sample map, including its presets.

Undo/redo covers adding, duplicating, deleting, and reordering walls, bulk
dimension updates, reset, imports, and saved preset changes. Direct inspector
edits and dragging are not currently recorded in that history. Export checkpoints
before extensive editing.

## Manage wall layers

The right sidebar shows **Layers** above **Wall inspector**. Drag the vertical
divider to resize the sidebar or the horizontal divider to adjust the two
sections. Each section scrolls independently. Focus a divider and use the arrow
keys for keyboard resizing.

1. Click a layer to select its wall on the canvas and load its inspector.
2. Use **Duplicate wall** to copy it, including its windows. The copy is selected
   and offset by 32 px on both axes.
3. Use **Bring wall forward** or **Send wall backward** to move it one position.
   The list runs from front to back. Reordering writes explicit drawing depths
   to the walls, so the rendered order survives JSON export; it does not change
   their coordinates or collision footprints.
4. Use **Delete wall** to remove the selected segment. Use **Undo** to restore it.

Clear a wall's **Drawing order** in the inspector to restore automatic depth for
that wall. Preview accounts for custom depths when sorting the player against
overlapping wall footprints. Reordering uses the arrow buttons, not drag-and-drop.

## Change dimensions for the whole map

Open **Map preferences** in the top bar to edit existing walls in bulk.

1. Enter **Wall height (px)** or **Wall thickness (px)**.
2. Click **Apply to all** beside that field. Height and thickness are separate
   actions; entering both values does not apply both at once.
3. Close the dialog to inspect the result, or use **Undo** to revert an action.

Height must be zero or greater; zero removes the visible face. Thickness must
be greater than zero. Bulk height replaces each existing wall's height override.
Neither action changes presets or the defaults for future walls.

## Position windows

Select a wall and click **Add** in its Windows section. Drag a window along the selected wall, or enter its offset in the inspector. Dragging snaps to the grid; the offset measures from the wall's first authored endpoint to the near edge of the opening.

Set **Width (px)** beside **Offset (px)** for each window in the inspector.
Changes appear immediately. Width is at least 1 pixel and can't extend past
the wall's end from the current offset.

Windows are visual openings and do not create walkable gaps. For a doorway,
leave space between two wall segments.

## Manage shared presets

Open **Presets** in the top bar, then select a style.

- **New** creates a preset with the default interior style.
- **Duplicate** copies the selected saved preset.
- Edit the name, colors, face height, outline width, glass opacity, inset, or sill height, then click **Save preset**.
- Renaming keeps all linked walls assigned to the renamed preset.
- Delete is available only when no walls use the preset and at least one other preset remains.

Edits apply on save. Switching presets or closing the manager discards unsaved form edits. Individual wall height overrides remain in effect after changing a preset's face height. To inherit the preset again, remove that wall's `height` field in JSON and reimport.

Leave **Sill height** blank to match each wall's thickness. An explicit value
overrides that behavior, and zero disables sills. The sill is clipped to the
opening height, so it can cover a short opening completely. Older maps with an
explicit `sillHeight` retain that value until you clear it and save the preset.

![Preset manager with uploaded texture previews](images/wallcraft-presets.png)

## Assign images to a preset

1. In **Presets**, choose the style to edit.
2. Upload an image under **Body texture** or **Front-face texture**. PNG, JPEG, and WebP files up to 5 MB are supported.
3. Use the selectors to reuse an uploaded image on another surface or preset. A thumbnail previews the selected image.
4. Click **Save preset**, then close the manager to inspect the map.

Images tile at their original pixel size. Use a small seamless texture for repeating material; a full character sprite or spritesheet will repeat as a whole image. There are no frame-selection, animation, or texture-scale controls. Choose **Solid color** to remove an assignment. Uploaded images remain available for reuse and are embedded in exported JSON.

![Map using uploaded tiled textures](images/wallcraft-textures.png)

## Test movement and collisions

Click **Preview** next to Export JSON. The editing tools hide and a character appears. Use the arrow keys to move; diagonal movement is normalized and walls block the character. Click the canvas if it needs keyboard focus. Click **Exit preview** to resume editing.

![Playable preview with a character inside the map](images/wallcraft-preview.png)

Preview enables collision even if the imported map has `collide: false`; it does not change that exported setting. Check wall junctions, doorway gaps, window visibility, and any manual drawing-order values.

Preview sorts the player relative to overlapping walls using their bottom
footprints, including walls with custom drawing orders. This is editor-only
behavior. Your game must implement its own character sorting when using explicit
wall depths; JSON export contains wall data, not the preview's player logic.

Collisions use the wall body's bottom footprint, shifted south by its effective
face height, rather than the full raised face. Use matching face heights for
segments around an aligned doorway. See [collision geometry](how-it-works.md#collision)
for the exact model. Preview hides the layers and inspector to use the full canvas.

## Save and load maps

**Export JSON** downloads `wall-map.json`. **Import** accepts a JSON file or pasted text; the text box initially contains the current map, which is also useful for inspecting its data. Click **Import map** to apply it.

Exports contain `walls`, `presets`, optional `collide`, and optional `textures`. Texture values are embedded image data URLs, so the map can be reimported into Wallcraft without the original image files. External Phaser texture keys without embedded images must be replaced with an upload or Solid color in this editor.

## Load an exported map in Phaser

Place the exported file at `public/wall-map.json` in your Vite game. Register `WallMapPlugin` as shown in the [quick start](quickstart.md). Then load the JSON, queue its images during `preload`, and create the walls in `create`:

```ts
import Phaser from "phaser";
import type { WallMapConfig } from "@mertdogar/phaser-procedural-walls";

type EditorMap = WallMapConfig & { textures?: Record<string, string> };

class Office extends Phaser.Scene {
  preload() {
    this.load.once("filecomplete-json-office-map", (_key: string, _type: string, map: EditorMap) => {
      for (const [key, dataUrl] of Object.entries(map.textures ?? {})) {
        this.load.image(key, dataUrl);
      }
    });
    this.load.json("office-map", "/wall-map.json");
  }

  create() {
    const map = this.cache.json.get("office-map") as EditorMap;
    const walls = this.add.wallMap(map);
    // Connect your character to walls.bodies when map.collide is true.
  }
}
```

The Phaser loader finishes the queued images before `create` runs. The library
ignores the editor's `textures` field; its preset texture keys resolve against
Phaser's Texture Manager. Your character still needs a collider and, with
automatic wall depths, `setDepth(player.y)` each frame. Custom depths need
additional character sorting; see the [depth convention](api.md#depth-convention)
and [quick start](quickstart.md#4-add-a-character).

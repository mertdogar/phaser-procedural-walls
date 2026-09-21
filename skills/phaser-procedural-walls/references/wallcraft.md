# Wallcraft workflow

Wallcraft is the bundled, in-memory wall editor. Export JSON before closing or
reloading the page; don't promise automatic persistence.

## Launch the editor

With Node 20 or newer and a release containing the editor CLI, run either
command. Version 0.2.0 source includes the CLI; check publication separately
if a registry installation fails.

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

1. Draw axis-aligned walls on the 32px grid. Switch to **Select** and click a
   wall to inspect it.
2. Drag endpoint anchors or edit coordinates. Drag windows along the wall or
   edit their offsets rather than relying on even spacing. Change window
   widths in JSON; the inspector only exposes offsets.
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
face. Undo/redo covers add, delete, reset, import, and saved preset edits, not
every direct field change or drag.

## Assign images to presets

Use a preset's body or face image control to upload PNG, JPEG, or WebP files
up to 5 MB each, then save the preset. Reuse a previously uploaded image by
selecting it. These are tiled textures, not animated character sprites.

The body uses `texture`; the face uses `lipTexture`. Images repeat at their
original size; there is no tile-scale or spritesheet-frame setting. Returning
to a solid color removes the assignment but retains the uploaded asset in the
map's collection and export.

Exports add `textures: Record<string, string>` to the ordinary config. Each
key is a preset texture key and each value an image data URL. Keep those keys
and the dictionary together. Missing embedded images must be uploaded or the
surface changed to a solid color in the editor.

The library doesn't consume the image dictionary automatically. Follow
[Phaser integration](integration.md#load-wallcraft-textures) to preload these
assets, then construct the map. A doorway needs a gap between wall segments;
window openings remain solid for collisions.

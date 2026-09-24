# Add and control doors

Use this guide to add a passage to a Phaser wall map, choose its artwork, and
control it from your game. It assumes you have created a scene and registered
`WallMapPlugin` as shown in the [quick start](quickstart.md).

## Add a doorway

Create a wall with enough length and height for the opening:

```ts
const walls = this.add.wallMap({
  presets: { interior: { fill: 0xe7ded0, edge: 0x3c403a } },
  walls: [{
    x1: 100, y1: 240, x2: 420, y2: 240,
    thickness: 16, height: 100, preset: "interior",
    doors: [{
      id: "office-entry", type: "hinged",
      offset: 112, width: 80, height: 80,
      side: "start", swing: "right", open: false,
    }],
  }],
  collide: true,
});
```

The opening starts 112 world units along the authored wall. Its floor stays at
the wall footprint, and the remaining 20 units of wall height form a header.
IDs must be non-empty and unique across the map. Windows can sit above doors if
their elevation ranges don't overlap. See the [schema](api.md#doorspec).

Attach your player's Arcade collider to `walls.bodies`. The moving door panel
is visual; a separate body blocks the passage when closed.

## Choose procedural behavior

Without artwork, `type: "hinged"` rotates the panel 90 degrees and
`type: "sliding"` retracts it into the doorway. Both take 250 ms for a complete
transition. Reversing direction continues from the current position.

`side` selects the hinge or retraction end. `swing` selects the side relative to
the authored direction from the first endpoint to the second; it only affects
hinged doors. For a southbound vertical wall, `"left"` swings east and
`"right"` swings west. Reversing the endpoints preserves these authored rules.

## Assign front and side artwork

Load complete images in your scene's `preload()`:

```ts
this.load.image("entry-closed", "/art/door-closed.png");
this.load.image("entry-open", "/art/door-open.png");
this.load.image("entry-side-closed", "/art/door-side-closed.png");
this.load.image("entry-side-open", "/art/door-side-open.png");
```

Then add these fields to the door before creating the map:

```ts
texture: { closed: "entry-closed", open: "entry-open" },
sideTexture: { closed: "entry-side-closed", open: "entry-side-open" },
```

`texture` applies to horizontal walls; `sideTexture` applies to vertical walls.
Each assigned pair requires both images. An orientation without a pair uses
procedural rendering. A missing image for an active assignment throws an error.

Textured doors switch images and collision immediately. They don't rotate or
slide the uploaded image. The artwork can depict a double door while the library
still manages one passage and one door ID.

For assets that fit the opening:

- Make front artwork flush with its canvas boundaries; outer transparent padding
  creates visible gaps. Preserve transparency inside an open doorway.
- Give open and closed states matching canvas dimensions and frame placement.
- Draw side artwork facing west, with its wall attachment at the right canvas
  edge. Reserve transparent space on the left for open leaves. The renderer
  mirrors it for an east-facing hinged swing.
- Front images fit width and height, including the top thickness when the door
  reaches the wall top. Side images retain their aspect ratio at a projected
  height of door width plus door height.

Wallcraft's sample includes generated front and side pairs. In its inspector,
expand **Opening artwork**, assign or upload images, and click **Apply artwork**.
See [the editor guide](wallcraft.md#assign-door-and-window-artwork).

## Control the passage

Use the same API for procedural and textured doors:

```ts
walls.openDoor("office-entry");
walls.closeDoor("office-entry");
walls.toggleDoor("office-entry");
const state = walls.getDoorState("office-entry");
```

Procedural doors can report `"opening"` or `"closing"` during motion. Textured
doors go directly to `"open"` or `"closed"`. Repeated requests for the same
target are safe; unknown IDs throw.

Collision remains enabled until a procedural door is fully open. Closing enables
it immediately for both rendering modes. Check doorway occupants before calling
`closeDoor()`; the library does not prevent a door from closing on a character.
Wallcraft preview performs this check for its player when you press **E** nearby.

## Preserve state when rebuilding

Door methods update the existing objects and leave authored `open` values alone.
`setWalls()` and `redraw()` reset runtime states to those authored values and
replace the physics group. Save any state your game needs, update the authored
values before rebuilding, and reconnect your Arcade collider afterward.

See [WallMap lifecycle](api.md#wallmap) for the complete method contract.

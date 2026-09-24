# Door design

This document records the implemented door design. See the
[API reference](api.md#doorspec) for schema and runtime usage.

- Doors are functional: closed doors block movement, and open doors permit
  passage.
- Each door belongs to a wall segment and is positioned by offset and width,
  like a window. Moving the wall moves its doors; deleting it removes them.
- The consuming game decides when a door opens or closes. The library exposes
  those operations and updates the door's appearance and collision together.
- Wallcraft's playable preview provides a simple door interaction for testing.
- The door schema includes a `type` with the allowed values `"hinged"` and
  `"sliding"`. Both types are supported in the first version.
- Collision blocks the doorway rather than following the moving door panel.
  Swinging and sliding motion are visual; passage is enabled when fully open.
- The consuming game checks doorway occupancy before requesting closure.
  Doorway collision is restored when closing starts; the library does not
  detect obstructions or automatically reopen doors.
- Every door requires a stable, map-wide unique ID. Games address doors by ID,
  independently of wall or door ordering. Wallcraft generates IDs when doors
  are created.
- A request for the opposite state reverses motion immediately from the current
  position, for both door types. Repeating the current target has no effect;
  commands are not queued.
- Sliding doors retract into the wall and are concealed as they open. The
  retraction side is configurable.
- Sliding retraction is a visual effect clipped to the doorway. It requires no
  pocket-space validation, including near wall endpoints or windows.
- An optional `open` boolean defines the starting state and defaults to `false`.
  Wallcraft edits this authored state. Runtime state changes do not modify the
  authored map; save-game behavior belongs to the consuming game.
- Hinged doors open through a fixed 90-degree angle. The hinge can be at either
  end of the doorway, and the swing can be toward either side of the wall.
  Custom opening angles and double doors are outside the first version.
- Doors must fit within their wall segment and must not overlap windows or
  other doors on that segment. Invalid placements produce clear errors rather
  than silently moving or shrinking doors. Wallcraft prevents invalid placement
  during editing.
- Door appearance comes from the existing wall preset, with door fill and frame
  colors and sensible defaults shared by both door types. The first version
  does not introduce separate door presets or per-door appearance overrides.
- The runtime API exposes `openDoor(id)`, `closeDoor(id)`, `toggleDoor(id)`, and
  `getDoorState(id)`. Observable states are `"closed"`, `"opening"`, `"open"`, and
  `"closing"`. Unknown door IDs produce clear errors.
- `setWalls()` and `redraw()` reset doors to their authored `open` state.
  Ordinary door operations update existing doors directly. Rebuilds do not
  preserve runtime state or animation progress.

Both door types use a fixed 250 ms full transition. `side` selects the hinge or
retraction end; `swing` selects the hinged swing side relative to the authored
wall direction.

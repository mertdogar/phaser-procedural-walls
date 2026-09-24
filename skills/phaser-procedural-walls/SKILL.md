---
name: phaser-procedural-walls
description: >-
  Use when building or integrating maps with @mertdogar/phaser-procedural-walls,
  loading Wallcraft JSON exports into Phaser, configuring wall presets, tiled textures, or door/window artwork, or fixing this library's windows, wall height, drawing depth, and
  Arcade collisions. Also use for server-side geometry from this package.
  Covers library consumers and Wallcraft workflows, not library maintenance
  or unrelated Phaser development.
---

# Procedural walls and Wallcraft

Help developers use the library's existing data model and APIs. These bundled
references track repository source, including changes after the original 0.2.0
release. Check the consumer's installed version and types before assuming its
editor or collision behavior matches these references.

## Workflow

Start from the user's map, scene, and existing loading and physics setup.

1. Identify whether the task concerns map data, Phaser integration, Wallcraft,
   or server-side geometry. Ask only for missing details that change the result.
2. Read the relevant bundled references before writing code:
   - [API and geometry](references/api.md): config fields, presets, windows,
     height, depth, and pure geometry imports.
   - [Phaser integration](references/integration.md): registration, texture
     loading, collisions, depth sorting, and rebuilding maps.
   - [Wallcraft](references/wallcraft.md): editor commands, controls, exports,
     and texture assets.
3. Reuse the consumer's scene lifecycle and asset keys. Make the smallest
   change that satisfies the request; don't introduce a second map system.
4. Check the invariants below and verify with the consumer's available tests,
   typecheck, and, for visual behavior, a running scene when possible.
5. Return the changed code or valid JSON, explain relevant behavior, and state
   what was tested. Don't claim a visual or collision check you didn't run.

## Invariants

These details prevent integrations that compile but render or collide wrongly.

- Walls are axis-aligned centerlines, not polygon outlines. Keep coordinates
  finite, thickness positive, and endpoints distinct. Diagonals aren't supported.
- Every wall names an existing preset. Window offsets start at the original
  first endpoint. Openings require height; windows also require floor-relative
  sillHeight. They must fit and cannot intersect in both position and elevation.
- Windows remain solid for collision. Functional doors use wall-owned `doors`
  entries with unique IDs and `type: "hinged" | "sliding"`. The game controls
  opening and closing and checks occupancy before closure.
- `height` overrides preset `lipHeight`; it raises the wall upward while the floor
  footprint stays fixed. `depth` changes draw order only. Don't change height to fix ordering.
- Register the scene plugin before calling `this.add.wallMap(config)`.
  `collide: true` creates bodies but doesn't attach a player collider for you.
- A map rebuild replaces its static group. Reconnect any player collider after
  `setWalls()` or `redraw()`; don't retain the old group.
- Preset and opening textures are already-loaded Phaser texture keys, not URLs. Wallcraft's
  extra `textures` dictionary needs explicit loading before map construction.
  Games can omit it and preload external files; see
  [external image files](references/integration.md#use-external-image-files).
  Wallcraft imports accept only embedded data URLs in that dictionary.
- Opening artwork is fitted once. Doors use complete front/side closed-open pairs;
  textured states switch immediately, untextured states animate. See the API
  reference for side-image framing and mirroring.
- Use the `/geometry` entry point in Node or other non-browser code. The root
  entry imports Phaser. `cutRects` isn't exported from the root.

## Scope and handoff

Give concrete consumer-facing examples. Don't invent diagonal walls,
wall tile scaling, spritesheet-frame presets, incremental wall setters, or a
headless editor CLI. If a requested feature isn't supported, explain the
constraint and offer the smallest compatible approach.

Use numeric colors in JSON, not JavaScript hexadecimal literals. Preserve
existing map fields and embedded assets when editing exports. Keep runtime
checks appropriate to the consuming application: TypeScript types alone do
not validate imported JSON.

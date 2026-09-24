import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { DoorType, WallMapConfig } from "../src/types";

vi.mock("phaser", () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
import { WallMap } from "../src/WallMap";
import { parseWallConfig, serializeWallConfig } from "../demo/editor-data";

function setup(type: DoorType = "hinged", open = false, collide = true) {
  const drawings: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const graphics = () => {
    const g: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const key of ["clear", "fillStyle", "lineStyle", "fillRect", "strokeRect", "lineBetween", "fillPoints", "strokePoints", "destroy"]) g[key] = vi.fn().mockReturnValue(g);
    drawings.push(g);
    return g;
  };
  const images: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const image = (_x: number, _y: number, key: string) => {
    const item = { width: 32, height: 96 } as unknown as Record<string, ReturnType<typeof vi.fn>>;
    for (const method of ["setTexture", "setPosition", "setOrigin", "setDisplaySize", "setFlipX", "destroy"]) item[method] = vi.fn().mockReturnValue(item);
    item.getBounds = vi.fn(() => {
      const [x, y] = item.setPosition.mock.calls.at(-1)!;
      const [ox, oy] = item.setOrigin.mock.calls.at(-1)!;
      const [width, height] = item.setDisplaySize.mock.calls.at(-1)!;
      return { x: x - ox * width, y: y - oy * height, width, height };
    });
    item.setTexture(key);
    images.push(item);
    return item;
  };
  const bodies: { enable: boolean }[] = [];
  const group = { add: vi.fn(), destroy: vi.fn() };
  const events = { on: vi.fn(), once: vi.fn(), off: vi.fn() };
  const scene = {
    events,
    textures: { exists: (key: string) => key !== "missing" },
    add: {
      graphics, image,
      container: () => ({ add: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() }),
      zone: () => ({ body: null }),
    },
    physics: { add: {
      staticGroup: () => group,
      existing: (zone: { body: unknown }) => { const body = { enable: true }; zone.body = body; bodies.push(body); },
    } },
  };
  const config: WallMapConfig = { presets: { p: { fill: 0, edge: 0, lipHeight: 24 } }, collide, walls: [
    { x1: 0, y1: 0, x2: 200, y2: 0, thickness: 20, preset: "p", doors: [{ id: "entry", type, height: 24, offset: 50, width: 80, open }] },
  ] };
  const map = new WallMap(scene as unknown as Phaser.Scene, config);
  const tick = (delta: number) => {
    const [, callback, context] = events.on.mock.calls.find(([name]) => name === "update")!;
    callback.call(context, 0, delta);
  };
  return { map, config, tick, bodies, group, events, drawings, images, scene };
}

describe.each(["hinged", "sliding"] as const)("%s door runtime", (type) => {
  it("blocks until fully open, restores collision immediately on close, and reverses without jumping", () => {
    const { map, bodies, tick, config } = setup(type);
    expect(bodies).toHaveLength(3);
    const blocker = bodies[2];
    expect(map.getDoorState("entry")).toBe("closed");
    map.openDoor("entry");
    tick(100);
    map.openDoor("entry");
    expect(map.getDoorState("entry")).toBe("opening");
    expect(blocker.enable).toBe(true);
    map.closeDoor("entry");
    expect(map.getDoorState("entry")).toBe("closing");
    tick(100);
    expect(map.getDoorState("entry")).toBe("closed");
    map.toggleDoor("entry");
    tick(250);
    expect(map.getDoorState("entry")).toBe("open");
    expect(blocker.enable).toBe(false);
    map.closeDoor("entry");
    expect(blocker.enable).toBe(true);
    tick(50);
    map.toggleDoor("entry");
    tick(50);
    expect(map.getDoorState("entry")).toBe("open");
    expect(blocker.enable).toBe(false);
    map.closeDoor("entry");
    map.openDoor("entry");
    expect(map.getDoorState("entry")).toBe("open");
    expect(blocker.enable).toBe(false);
    expect(config.walls[0].doors![0].open).toBe(false);
  });

  it("honors starting state and resets runtime state on redraw and replacement", () => {
    const { map, bodies, tick, config } = setup(type, true);
    expect(map.getDoorState("entry")).toBe("open");
    expect(bodies[2].enable).toBe(false);
    map.closeDoor("entry");
    tick(100);
    map.redraw();
    expect(map.getDoorState("entry")).toBe("open");
    expect(bodies.at(-1)!.enable).toBe(false);
    map.setWalls([{ ...config.walls[0], doors: [{ id: "new", type, height: 24, offset: 10, width: 50 }] }]);
    expect(() => map.getDoorState("entry")).toThrow(/Unknown/);
    expect(map.getDoorState("new")).toBe("closed");
    map.destroy();
    expect(() => map.openDoor("new")).toThrow(/Unknown/);
  });

  it("animates without physics and throws for unknown IDs", () => {
    const { map, tick, bodies } = setup(type, false, false);
    map.openDoor("entry");
    tick(250);
    expect(map.getDoorState("entry")).toBe("open");
    expect(bodies).toHaveLength(0);
    for (const action of ["openDoor", "closeDoor", "toggleDoor", "getDoorState"] as const) expect(() => map[action]("missing")).toThrow(/Unknown door ID/);
  });
});

it("keeps the current map after rejecting invalid replacement data", () => {
  const { map, config } = setup();
  expect(() => map.setWalls([{ ...config.walls[0], doors: [{ id: "invalid", type: "hinged", height: 24, offset: 190, width: 80 }] }])).toThrow(/fit/);
  expect(map.getDoorState("entry")).toBe("closed");
});

it("removes update and shutdown listeners on destruction", () => {
  const { map, events, group } = setup();
  map.destroy();
  expect(events.off.mock.calls.map(([name]) => name)).toEqual(["update", "shutdown"]);
  expect(group.destroy).toHaveBeenCalledWith(true);
});

it("round-trips door configuration and rejects invalid imported maps", () => {
  const { config } = setup();
  expect(parseWallConfig(serializeWallConfig(config))).toEqual({ ...config, version: 2 });
  config.walls[0].doors![0].width = 1000;
  expect(() => parseWallConfig(serializeWallConfig(config))).toThrow(/fit/);
});

describe.each(["start", "end"] as const)("vertical door hinged at %s", (side) => {
  it.each(["left", "right"] as const)("projects the %s panel at its actual height throughout rotation", (swing) => {
    const { map, config, drawings, tick, bodies } = setup();
    map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, height: 100,
      doors: [{ id: "entry", type: "hinged", height: 80, offset: 50, width: 60, side, swing }],
    }]);
    const panel = drawings.at(-1)!;
    const top = () => panel.fillPoints.mock.calls.at(-1)![0] as { x: number; y: number }[];
    expect(Math.min(...top().map((p) => p.y))).toBeCloseTo(-30);
    expect(Math.max(...top().map((p) => p.y))).toBeCloseTo(30);
    map.openDoor("entry");
    tick(125);
    expect(bodies.at(-1)!.enable).toBe(true);
    tick(125);
    expect(Math.max(...top().map((p) => p.x)) - Math.min(...top().map((p) => p.x))).toBeCloseTo(60);
    const face = panel.fillPoints.mock.calls.at(-2)![0] as { x: number; y: number }[];
    expect(face[2].y - face[1].y).toBe(80);
    expect(bodies.at(-1)!.enable).toBe(false);
    map.closeDoor("entry");
    tick(250);
    expect(Math.min(...top().map((p) => p.y))).toBeCloseTo(-30);
    expect(bodies.at(-1)!.enable).toBe(true);
  });
});

it("retracts a vertical sliding panel completely", () => {
  const { map, config, drawings, tick } = setup("sliding");
  map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, height: 80 }]);
  const panel = drawings.at(-1)!;
  panel.fillPoints.mockClear();
  map.openDoor("entry");
  tick(250);
  expect(panel.clear).toHaveBeenCalled();
  expect(panel.fillPoints).not.toHaveBeenCalled();
  expect(map.getDoorState("entry")).toBe("open");
});


it("rejects imported legacy openings and preserves explicit window dimensions in JSON", () => {
  const { config } = setup();
  config.walls[0].height = 100;
  config.walls[0].windows = [{ offset: 50, width: 80, height: 20, sillHeight: 60 }];
  expect(parseWallConfig(serializeWallConfig(config))).toEqual({ ...config, version: 2 });
  const legacy = JSON.parse(serializeWallConfig(config));
  delete legacy.walls[0].doors[0].height;
  expect(() => parseWallConfig(JSON.stringify(legacy))).toThrow(/height/);
  legacy.walls[0].doors[0].height = 24;
  delete legacy.walls[0].windows[0].sillHeight;
  expect(() => parseWallConfig(JSON.stringify(legacy))).toThrow(/sillHeight/);
});


it.each(["left", "right"] as const)("exposes a short vertical door on its %s swing side without moving collision", (swing) => {
  const { map, config, drawings, tick, bodies } = setup();
  map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, height: 100,
    doors: [{ id: "entry", type: "hinged", offset: 50, width: 60, height: 80, swing }],
  }]);
  const panel = drawings.at(-1)!;
  const top = () => panel.fillPoints.mock.calls.at(-1)![0] as { x: number; y: number }[];
  const hingeX = swing === "left" ? 10 : -10;
  expect(Math.min(...top().map((p) => p.x))).toBeCloseTo(hingeX - 4);
  expect(Math.max(...top().map((p) => p.x))).toBeCloseTo(hingeX + 4);
  expect(bodies.at(-1)!.enable).toBe(true);
  map.openDoor("entry");
  tick(250);
  expect(top()[0].x).toBeCloseTo(hingeX);
  expect(bodies.at(-1)!.enable).toBe(false);
  map.closeDoor("entry");
  tick(250);
  expect(Math.min(...top().map((p) => p.x))).toBeCloseTo(hingeX - 4);
});


it.each([false, true])("switches textured doors and collision immediately (vertical=%s)", (vertical) => {
  const { map, config, images, bodies, tick } = setup();
  const textures = { closed: "closed", open: "open" };
  map.setWalls([{ ...config.walls[0], x2: vertical ? 0 : 200, y2: vertical ? 200 : 0,
    height: 100, doors: [{ id: "art", type: "hinged", offset: 50, width: 60, height: 80, swing: "right",
      ...(vertical ? { sideTexture: textures } : { texture: textures }) }],
  }]);
  const image = images.at(-1)!;
  expect(image.setDisplaySize).toHaveBeenLastCalledWith(vertical ? 140 / 3 : 60, vertical ? 140 : 80);
  expect(image.setPosition).toHaveBeenLastCalledWith(vertical ? -10 : 50, vertical ? 110 : 10);
  expect(map.getDoorState("art")).toBe("closed");
  map.openDoor("art");
  expect(image.setTexture).toHaveBeenLastCalledWith("open");
  expect(map.getDoorState("art")).toBe("open");
  expect(bodies.at(-1)!.enable).toBe(false);
  map.closeDoor("art");
  expect(image.setTexture).toHaveBeenLastCalledWith("closed");
  expect(map.getDoorState("art")).toBe("closed");
  expect(bodies.at(-1)!.enable).toBe(true);
  tick(125);
  expect(map.getDoorState("art")).toBe("closed");
});

it("keeps the vertical procedural animation when only front artwork is assigned", () => {
  const { map, config, images, tick } = setup();
  map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, doors: [{ ...config.walls[0].doors![0], texture: { closed: "closed", open: "open" } }] }]);
  expect(images).toHaveLength(0);
  map.openDoor("entry");
  tick(100);
  expect(map.getDoorState("entry")).toBe("opening");
});

it("round-trips embedded opening artwork and rejects incomplete pairs", () => {
  const { config } = setup();
  config.walls[0].doors![0].texture = { closed: "closed", open: "open" };
  const embedded = { ...config, textures: { closed: "data:image/png;base64,AAAA", open: "data:image/png;base64,BBBB" } };
  expect(parseWallConfig(serializeWallConfig(embedded))).toEqual({ ...embedded, version: 2 });
  const invalid = JSON.parse(serializeWallConfig(embedded));
  delete invalid.walls[0].doors[0].texture.open;
  expect(() => parseWallConfig(JSON.stringify(invalid))).toThrow(/both closed and open/);
});

it.each([false, true])("renders window artwork without procedural glass or sill (vertical=%s)", (vertical) => {
  const { map, config, images, drawings } = setup();
  const count = drawings.length;
  map.setWalls([{ ...config.walls[0], doors: [], x2: vertical ? 0 : 200, y2: vertical ? 200 : 0,
    height: 100, windows: [{ offset: 50, width: 60, height: 40, sillHeight: 20, texture: "window", sideTexture: "side-window" }],
  }]);
  expect(images).toHaveLength(1);
  expect(images[0].setTexture).toHaveBeenCalledWith(vertical ? "side-window" : "window");
  expect(images[0].setDisplaySize).toHaveBeenCalledWith(vertical ? 100 / 3 : 60, vertical ? 100 : 40);
  expect(drawings.slice(count).flatMap((g) => g.fillStyle.mock.calls).some((call) => call[0] === 0x3d7f88)).toBe(false);
});


it("rejects missing opening textures before destroying the current map", () => {
  const { map, config } = setup();
  expect(() => map.setWalls([{ ...config.walls[0], doors: [{ ...config.walls[0].doors![0], texture: { closed: "closed", open: "missing" } }] }])).toThrow(/Missing opening texture/);
  expect(map.getDoorState("entry")).toBe("closed");
});


it("fits full-height door artwork across the top thickness down to the floor", () => {
  const { map, config, images } = setup();
  map.setWalls([{ ...config.walls[0], doors: [{ ...config.walls[0].doors![0], texture: { closed: "closed", open: "open" } }] }]);
  expect(images[0].setPosition).toHaveBeenLastCalledWith(50, 10);
  expect(images[0].setDisplaySize).toHaveBeenLastCalledWith(80, 44);
  map.openDoor("entry");
  expect(images[0].setDisplaySize).toHaveBeenLastCalledWith(80, 44);
});

it.each(["left", "right"] as const)("mirrors side artwork only for the %s swing", (swing) => {
  const { map, config, images } = setup();
  map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, doors: [{ ...config.walls[0].doors![0], swing, sideTexture: { closed: "closed", open: "open" } }] }]);
  expect(images[0].setFlipX).toHaveBeenCalledWith(swing === "left");
});


it("automatically migrates version-1 configs before building the runtime", () => {
  const { scene } = setup();
  const map = new WallMap(scene as unknown as Phaser.Scene, {
    version: 1, presets: { p: { fill: 0, edge: 0, lipHeight: 40 } }, collide: true,
    walls: [{ x1: 0, y1: 100, x2: 200, y2: 100, thickness: 20, preset: "p",
      doors: [{ id: "legacy", type: "hinged", offset: 50, width: 80 }] }],
  });
  expect(map.getDoorState("legacy")).toBe("closed");
  map.openDoor("legacy");
  map.redraw();
  expect(map.getDoorState("legacy")).toBe("closed");
  expect(() => new WallMap(scene as unknown as Phaser.Scene, {
    version: 3, presets: {}, walls: [],
  } as unknown as WallMapConfig)).toThrow(/Unsupported wall map version/);
});


it("exposes moving door geometry for occlusion and removes fully retracted panels", () => {
  const { map, tick } = setup();
  const closed = map.getDoorSurfaces()[0];
  expect(closed.floorY).toBe(4);
  expect(closed.rect).toEqual({ x: 50, y: -28, w: 80, h: 32 });
  map.openDoor("entry");
  tick(250);
  expect(map.getDoorSurfaces()[0].rect).not.toEqual(closed.rect);
  const sliding = setup("sliding");
  sliding.map.openDoor("entry");
  sliding.tick(250);
  expect(sliding.map.getDoorSurfaces()).toEqual([]);
});

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
  const bodies: { enable: boolean }[] = [];
  const group = { add: vi.fn(), destroy: vi.fn() };
  const events = { on: vi.fn(), once: vi.fn(), off: vi.fn() };
  const scene = {
    events,
    add: {
      graphics,
      container: () => ({ add: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() }),
      zone: () => ({ body: null }),
    },
    physics: { add: {
      staticGroup: () => group,
      existing: (zone: { body: unknown }) => { const body = { enable: true }; zone.body = body; bodies.push(body); },
    } },
  };
  const config: WallMapConfig = { presets: { p: { fill: 0, edge: 0, lipHeight: 24 } }, collide, walls: [
    { x1: 0, y1: 0, x2: 200, y2: 0, thickness: 20, preset: "p", doors: [{ id: "entry", type, offset: 50, width: 80, open }] },
  ] };
  const map = new WallMap(scene as unknown as Phaser.Scene, config);
  const tick = (delta: number) => {
    const [, callback, context] = events.on.mock.calls.find(([name]) => name === "update")!;
    callback.call(context, 0, delta);
  };
  return { map, config, tick, bodies, group, events, drawings };
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
    map.setWalls([{ ...config.walls[0], doors: [{ id: "new", type, offset: 10, width: 50 }] }]);
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
  expect(() => map.setWalls([{ ...config.walls[0], doors: [{ id: "invalid", type: "hinged", offset: 190, width: 80 }] }])).toThrow(/fit/);
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
  expect(parseWallConfig(serializeWallConfig(config))).toEqual(config);
  config.walls[0].doors![0].width = 1000;
  expect(() => parseWallConfig(serializeWallConfig(config))).toThrow(/fit/);
});

describe.each(["start", "end"] as const)("vertical door hinged at %s", (side) => {
  it.each(["left", "right"] as const)("reveals the compact %s face while keeping its height and hardware fixed", (swing) => {
    const { map, config, drawings, tick, bodies } = setup();
    map.setWalls([{ ...config.walls[0], x2: 0, y2: 200, height: 80, depth: 500,
      doors: [{ id: "entry", type: "hinged", offset: 50, width: 80, side, swing }],
    }]);
    const panel = drawings.at(-1)!;
    expect(panel.strokeRect).toHaveBeenLastCalledWith(-2, 130, 4, 80);
    map.openDoor("entry");
    tick(125);
    const halfway = panel.strokeRect.mock.calls.at(-1)!;
    expect(halfway[2]).toBeCloseTo(4 / Math.SQRT2);
    expect(halfway[3]).toBe(40);
    expect(bodies.at(-1)!.enable).toBe(true);
    tick(125);
    const open = panel.strokeRect.mock.calls.at(-1)!;
    expect(open).toEqual([swing === "right" ? 2 : -6, side === "start" ? 130 : 170, 4, 40]);
    expect(map.containers.at(-1)!.setDepth).toHaveBeenLastCalledWith(500 + 0.000001);
    expect(bodies.at(-1)!.enable).toBe(false);
    map.closeDoor("entry");
    tick(250);
    expect(panel.strokeRect).toHaveBeenLastCalledWith(-2, 130, 4, 80);
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

import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { WallSpec } from "../src/types";

vi.mock("phaser", () => {
  class Vector2 {
    constructor(public x: number, public y: number) {}
    clone() { return new Vector2(this.x, this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }
  }
  return { default: {
    Scene: class { sys = { isActive: () => false }; cameras = { main: { zoom: 1 } }; },
    Math: {
      Vector2,
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Distance: { Between: (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1) },
    },
  } };
});

vi.mock("../src/WallMap", () => ({ WallMap: class {
  containers = [{ setPosition: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() }];
  destroy() {}
} }));

import { EditorScene } from "../demo/editor/EditorScene";
import { WallEditor, type WallEditorOptions } from "../src/WallEditor";
import { WallMap } from "../src/WallMap";
import { getMapBounds } from "../demo/editor-data";
import { resolveWalls } from "../src/geometry";

const pointer = (x: number, y: number) => ({ worldX: x, worldY: y, updateWorldPoint: vi.fn(), leftButtonDown: () => true, isDown: true }) as unknown as Phaser.Input.Pointer;

function makeEditor(options: Partial<WallEditorOptions> = {}) {
  const graphics = {
    setDepth: vi.fn().mockReturnThis(), clear: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(), lineBetween: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(), fillCircle: vi.fn().mockReturnThis(),
    strokeCircle: vi.fn().mockReturnThis(), fillRect: vi.fn().mockReturnThis(),
    strokeRect: vi.fn().mockReturnThis(), destroy: vi.fn(),
  };
  const input = { on: vi.fn(), off: vi.fn(), setDefaultCursor: vi.fn() };
  const events = { once: vi.fn(), off: vi.fn() };
  const camera = { zoom: 1 };
  const scene = { input, events, cameras: { main: camera }, add: { graphics: () => graphics } };
  const callbacks = { onAddWall: vi.fn(), onSelectWall: vi.fn(), onUpdateWall: vi.fn() };
  const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [] };
  const editor = new WallEditor(scene as unknown as Phaser.Scene, {
    config, selectedIndex: null, tool: "wall", ...callbacks, ...options,
  });
  const emit = (event: string, p: Phaser.Input.Pointer) => {
    for (const [name, handler, context] of input.on.mock.calls) {
      if (name === event) handler.call(context, p);
    }
  };
  return { editor, input, events, camera, graphics, emit, ...callbacks };
}

describe("editor world coordinates", () => {
  it.each([
    [10, 20, 266, 20, 110, 20],
    [266, 20, 10, 20, 110, 20],
    [10, 20, 10, 276, 10, 120],
    [10, 276, 10, 20, 10, 120],
  ])("moves the whole segment from (%s, %s) to (%s, %s) without changing its data during preview", (x1, y1, x2, y2, x, y) => {
    const wall = { x1, y1, x2, y2, thickness: 20, height: 48, preset: "p", windows: [{ offset: 192, width: 32 }] };
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] };
    const { emit, editor, onUpdateWall } = makeEditor({ config, tool: "select", selectedIndex: 0, gridSize: 16 });
    emit("pointerdown", pointer(x, y));
    expect(editor.dragging).toBe(true);
    emit("pointermove", pointer(x + 35, y - 49));
    expect(config.walls[0]).toEqual(wall);
    expect(onUpdateWall).not.toHaveBeenCalled();
    emit("pointerupoutside", pointer(x + 35, y - 49));
    expect(onUpdateWall).toHaveBeenCalledExactlyOnceWith(0, { x1: x1 + 32, y1: y1 - 48, x2: x2 + 32, y2: y2 - 48 });
    expect(wall.windows).toEqual([{ offset: 192, width: 32 }]);
    expect(editor.dragging).toBe(false);
  });

  it.each(["cancel", "disabled", "replacement", "destroy"])("cleans up a wall move on %s without emitting an edit", (action) => {
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [{ x1: 0, y1: 0, x2: 256, y2: 0, thickness: 16, preset: "p" }] };
    const { emit, editor, onUpdateWall } = makeEditor({ config, tool: "select", selectedIndex: 0 });
    const destroyed = vi.spyOn(WallMap.prototype, "destroy");
    emit("pointerdown", pointer(100, 0));
    emit("pointermove", pointer(132, 32));
    if (action === "cancel") editor.cancel();
    else if (action === "destroy") editor.destroy();
    else editor.setState({ config: action === "replacement" ? { ...config, walls: [] } : config, tool: "select", selectedIndex: null, enabled: action !== "disabled" });
    expect(destroyed).toHaveBeenCalledTimes(1);
    expect(editor.dragging).toBe(false);
    if (action !== "destroy") emit("pointerup", pointer(132, 32));
    expect(onUpdateWall).not.toHaveBeenCalled();
    destroyed.mockRestore();
  });

  it("does not emit an edit for a centerline click or a drag back to the origin", () => {
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [{ x1: 0, y1: 0, x2: 256, y2: 0, thickness: 16, preset: "p" }] }, tool: "select", selectedIndex: 0 });
    emit("pointerdown", pointer(100, 0));
    emit("pointerup", pointer(102, 1));
    emit("pointerdown", pointer(100, 0));
    emit("pointermove", pointer(164, 64));
    emit("pointerup", pointer(100, 0));
    expect(onUpdateWall).not.toHaveBeenCalled();
  });

  it("prioritizes endpoints over the centerline and uses a zoom-scaled centerline hit area", () => {
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [{ x1: 0, y1: 0, x2: 256, y2: 0, thickness: 40, preset: "p" }] };
    const { emit, editor, camera, onUpdateWall } = makeEditor({ config, tool: "select", selectedIndex: 0 });
    emit("pointerdown", pointer(250, 0));
    emit("pointerup", pointer(288, 0));
    expect(onUpdateWall).toHaveBeenCalledExactlyOnceWith(0, { x1: 0, y1: 0, x2: 288, y2: 0 });
    camera.zoom = 2;
    emit("pointerdown", pointer(100, 4));
    expect(editor.dragging).toBe(false);
    emit("pointerdown", pointer(100, 2));
    expect(editor.dragging).toBe(true);
    editor.cancel();
  });

  it("uses custom grid, camera, defaults, and overlay depth without changing host data", () => {
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [] };
    const camera = { zoom: 2 } as Phaser.Cameras.Scene2D.Camera;
    const { emit, onAddWall, graphics } = makeEditor({ config, camera, gridSize: 16, overlayDepth: 500, newWall: { preset: "p", thickness: 24, height: 80 } });
    const down = pointer(-17, 18);
    emit("pointerdown", down);
    emit("pointermove", pointer(51, 22));
    expect(onAddWall).not.toHaveBeenCalled();
    emit("pointerupoutside", pointer(51, 22));
    expect(onAddWall).toHaveBeenCalledExactlyOnceWith({ x1: -16, y1: 16, x2: 48, y2: 16, thickness: 24, height: 80, preset: "p" });
    expect(config.walls).toEqual([]);
    expect(down.updateWorldPoint).toHaveBeenCalledWith(camera);
    expect(graphics.setDepth).toHaveBeenCalledWith(500);
  });

  it("cancels a pending gesture when disabled and resumes only on a new press", () => {
    const { editor, emit, onAddWall } = makeEditor();
    emit("pointerdown", pointer(0, 0));
    expect(editor.dragging).toBe(true);
    const state = { config: { presets: { p: { fill: 0, edge: 0 } }, walls: [] }, selectedIndex: null, tool: "wall" as const };
    editor.setState({ ...state, enabled: false });
    emit("pointerup", pointer(96, 0));
    emit("pointerdown", pointer(0, 0));
    expect(editor.dragging).toBe(false);
    editor.setState({ ...state, enabled: true });
    emit("pointerup", pointer(96, 0));
    expect(onAddWall).not.toHaveBeenCalled();
    emit("pointerdown", pointer(0, 0));
    emit("pointerup", pointer(96, 0));
    expect(onAddWall).toHaveBeenCalledTimes(1);
  });

  it("cancels instead of applying a stale index after the host replaces the map", () => {
    const wall = { x1: 0, y1: 0, x2: 128, y2: 0, thickness: 16, preset: "p" };
    const { editor, emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, selectedIndex: 0, tool: "select" });
    emit("pointerdown", pointer(128, 0));
    editor.setState({ config: { presets: {}, walls: [] }, selectedIndex: null, tool: "select" });
    emit("pointerup", pointer(192, 0));
    expect(onUpdateWall).not.toHaveBeenCalled();
    expect(wall.x2).toBe(128);
  });

  it("selects a wall and clears selection on empty space", () => {
    const { emit, onSelectWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [{ x1: 0, y1: 0, x2: 128, y2: 0, thickness: 16, preset: "p" }] }, tool: "select" });
    emit("pointerdown", pointer(64, 4));
    expect(onSelectWall).toHaveBeenLastCalledWith(0);
    emit("pointerdown", pointer(300, 300));
    expect(onSelectWall).toHaveBeenLastCalledWith(null);
  });

  it("drags a window on a reversed wall without mutating its config", () => {
    const wall = { x1: 256, y1: 0, x2: 0, y2: 0, thickness: 16, preset: "p", windows: [{ offset: 64, width: 32 }] };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, tool: "select", selectedIndex: 0 });
    emit("pointerdown", pointer(176, 0));
    emit("pointermove", pointer(112, 0));
    expect(onUpdateWall).not.toHaveBeenCalled();
    emit("pointerup", pointer(112, 0));
    expect(onUpdateWall).toHaveBeenCalledExactlyOnceWith(0, { windows: [{ offset: 128, width: 32 }] });
    expect(wall.windows).toEqual([{ offset: 64, width: 32 }]);
  });

  it("does not draw on a non-primary press or a click shorter than one grid step", () => {
    const { emit, onAddWall } = makeEditor();
    emit("pointerdown", { ...pointer(0, 0), leftButtonDown: () => false } as Phaser.Input.Pointer);
    emit("pointerup", pointer(128, 0));
    emit("pointerdown", pointer(0, 0));
    emit("pointerup", pointer(2, 3));
    expect(onAddWall).not.toHaveBeenCalled();
  });

  it("cancels with Escape integration and applies new drawing defaults", () => {
    const { editor, emit, onAddWall } = makeEditor();
    emit("pointerdown", pointer(0, 0));
    editor.cancel();
    emit("pointerup", pointer(128, 0));
    expect(onAddWall).not.toHaveBeenCalled();
    editor.setNewWall({ thickness: 48 });
    emit("pointerdown", pointer(0, 0));
    emit("pointerup", pointer(128, 0));
    expect(onAddWall).toHaveBeenCalledWith(expect.objectContaining({ thickness: 48, preset: "p" }));
  });

  it("releases exactly its listeners and overlay on explicit destroy or scene shutdown", () => {
    for (const shutdown of [false, true]) {
      const { editor, input, events, graphics } = makeEditor();
      if (shutdown) {
        const [name, handler, context] = events.once.mock.calls[0];
        expect(name).toBe("shutdown");
        handler.call(context);
      } else editor.destroy();
      for (const [name, handler, context] of input.on.mock.calls) expect(input.off).toHaveBeenCalledWith(name, handler, context);
      expect(input.off).toHaveBeenCalledTimes(4);
      expect(events.off).toHaveBeenCalledWith("shutdown", expect.any(Function), editor);
      expect(graphics.destroy).toHaveBeenCalledTimes(1);
    }
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid grid size %s", (gridSize) => {
    expect(() => makeEditor({ gridSize })).toThrow("gridSize must be positive and finite");
  });

  it("reports a missing preset instead of emitting an invalid new wall", () => {
    const { emit, onAddWall } = makeEditor({ config: { presets: {}, walls: [] } });
    emit("pointerdown", pointer(0, 0));
    expect(() => emit("pointerup", pointer(128, 0))).toThrow("Choose an existing wall preset");
    expect(onAddWall).not.toHaveBeenCalled();
  });

  it.each([
    [680, 618.9588499999999, false], [735, 618.9588499999999, true],
    [680, 5000, false], [735, 5000, true],
    [680, -300, false], [735, -300, true],
  ])("sorts preview feet at %s against wall depth %s", (feet, depth, inFront) => {
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [
      { x1: 100, y1: 620, x2: 500, y2: 620, thickness: 20, height: 100, preset: "p", depth },
    ] };
    const scene = new EditorScene(config, vi.fn());
    const player = { x: 300, y: feet, height: 64, width: 32, setVelocity: vi.fn().mockReturnThis(), setDepth: vi.fn() };
    Object.assign(scene, { preview: true, player, previewWalls: resolveWalls(config.walls, config.presets), cursors: {
      left: { isDown: false }, right: { isDown: false }, up: { isDown: false }, down: { isDown: false },
    } });
    scene.update();
    const actualDepth = player.setDepth.mock.calls[0][0];
    if (inFront) expect(actualDepth).toBeGreaterThan(depth);
    else expect(actualDepth).toBeLessThan(depth);
  });
  it.each([[1600, 1280, 2112, 1280], [-320, -160, -64, -160]])(
    "draws beyond the original viewport from (%s, %s) to (%s, %s)",
    (x1, y1, x2, y2) => {
      const onAddWall = vi.fn();
      const config = { presets: { interior: { fill: 0, edge: 0 } }, walls: [] };
      const { emit } = makeEditor({ config, onAddWall });
      emit("pointerdown", pointer(x1, y1));
      emit("pointerup", pointer(x2, y2));
      expect(onAddWall).toHaveBeenCalledWith(expect.objectContaining({ x1, y1, x2, y2 }));
    },
  );

  it("does not clamp a dragged endpoint on a large map", () => {
    const wall: WallSpec = { x1: 1600, y1: 1280, x2: 2112, y2: 1280, thickness: 20, preset: "p" };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, tool: "select", selectedIndex: 0 });
    emit("pointerdown", pointer(2112, 1280));
    emit("pointerup", pointer(2240, 1290));
    expect(onUpdateWall).toHaveBeenCalledWith(0, { x1: 1600, y1: 1280, x2: 2240, y2: 1280 });
  });

  it("includes negative coordinates, wall thickness, and faces in map bounds", () => {
    const config = {
      presets: { p: { fill: 0, edge: 0 } },
      walls: [{ x1: -320, y1: 1504, x2: 2112, y2: 1504, thickness: 32, height: 160, preset: "p" }],
    };
    const bounds = getMapBounds(config);
    expect(bounds.x).toBeLessThan(-320);
    expect(bounds.x + bounds.width).toBeGreaterThan(2112);
    expect(bounds.y + bounds.height).toBeGreaterThan(1680);
  });

  it("fits a large map into the available camera area", () => {
    const config = {
      presets: { p: { fill: 0, edge: 0 } },
      walls: [{ x1: 320, y1: 1504, x2: 2112, y2: 1504, thickness: 32, preset: "p" }],
    };
    const scene = new EditorScene(config, vi.fn());
    const camera = {
      width: 960, height: 640, zoom: 1,
      setZoom(zoom: number) { this.zoom = zoom; },
      centerOn: vi.fn(),
    };
    Object.assign(scene.cameras.main, camera);
    scene.fitMap();
    const bounds = getMapBounds(config);
    expect(bounds.width * scene.cameras.main.zoom).toBeLessThanOrEqual(960 * 0.9);
    expect(bounds.height * scene.cameras.main.zoom).toBeLessThanOrEqual(560);
    expect(camera.centerOn).toHaveBeenCalled();
  });

  it("pans in world units without adding a wall", () => {
    const onAddWall = vi.fn();
    const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [] };
    const scene = new EditorScene(config, vi.fn());
    Object.assign(scene.cameras.main, { zoom: 0.5, scrollX: 1000, scrollY: 800 });
    Object.assign(scene, { input: { setDefaultCursor: vi.fn() }, editor: makeEditor().editor });
    scene.setEditorState(config, null, "wall", false, { onAddWall, onSelectWall: vi.fn(), onUpdateWall: vi.fn() });
    scene["handlePointerDown"]({ x: 100, y: 100, middleButtonDown: () => true } as Phaser.Input.Pointer);
    scene["handlePointerMove"]({ x: 200, y: 150 } as Phaser.Input.Pointer);
    scene["handlePointerUp"]();
    expect(scene.cameras.main.scrollX).toBe(800);
    expect(scene.cameras.main.scrollY).toBe(700);
    expect(onAddWall).not.toHaveBeenCalled();
  });

  it.each([[0, 1], [1, 16], [2, 480]])("pans both axes with wheel delta mode %s", (deltaMode, unit) => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    Object.assign(scene, { editor: makeEditor().editor, scale: { displayScale: { x: 2, y: 2 }, canvasBounds: { height: 480 } } });
    Object.assign(scene.cameras.main, { zoom: 0.5, scrollX: 100, scrollY: 200 });
    const zoom = vi.spyOn(scene, "zoomBy");
    scene["handleWheel"]({ event: { deltaX: 3, deltaY: -5, deltaMode, ctrlKey: false } } as Phaser.Input.Pointer);
    expect(scene.cameras.main.scrollX).toBe(100 + 12 * unit);
    expect(scene.cameras.main.scrollY).toBe(200 - 20 * unit);
    expect(zoom).not.toHaveBeenCalled();
  });

  it("draws world origin axes across the entire visible viewport", () => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    const grid = { clear: vi.fn().mockReturnThis(), lineStyle: vi.fn().mockReturnThis(), lineBetween: vi.fn(), strokeCircle: vi.fn() };
    Object.assign(scene, { grid });
    Object.assign(scene.cameras.main, { zoom: 0.5, preRender: vi.fn(), worldView: { x: -500, y: -1000, right: 500, bottom: 1000 } });
    scene["drawGrid"]();
    expect(grid.lineBetween).toHaveBeenCalledWith(-500, 0, 500, 0);
    expect(grid.lineBetween).toHaveBeenCalledWith(0, -1000, 0, 1000);
    expect(grid.strokeCircle).toHaveBeenCalledWith(0, 0, 8);
  });

  it("zooms pinch gestures at the pointer without panning", () => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    Object.assign(scene, { editor: makeEditor().editor });
    const zoom = vi.spyOn(scene, "zoomBy").mockImplementation(() => {});
    scene["handleWheel"]({ x: 300, y: 200, event: { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true } } as Phaser.Input.Pointer);
    expect(zoom).toHaveBeenCalledWith(Math.exp(0.1), 300, 200);
  });

  it("ignores navigation gestures while drawing a wall", () => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    const { editor, emit } = makeEditor();
    Object.assign(scene, { editor });
    emit("pointerdown", pointer(32, 32));
    const zoom = vi.spyOn(scene, "zoomBy");
    scene["handleWheel"]({ event: { deltaY: -10, ctrlKey: true } } as Phaser.Input.Pointer);
    expect(zoom).not.toHaveBeenCalled();
  });

  it("expands the actual scene physics bounds when loading a large map", async () => {
    const config = {
      presets: { p: { fill: 0, edge: 0 } },
      walls: [{ x1: 320, y1: 1504, x2: 2112, y2: 1504, thickness: 32, height: 160, preset: "p" }],
    };
    const scene = new EditorScene(config, vi.fn());
    scene.sys.isActive = () => true;
    const setBounds = vi.fn();
    Object.assign(scene, { physics: { world: { bounds: { x: 0, y: 0, right: 960, bottom: 640 }, setBounds } } });
    vi.spyOn(scene, "fitMap").mockImplementation(() => {});
    await scene["refreshWalls"]();
    const bounds = getMapBounds(config);
    expect(setBounds).toHaveBeenCalledWith(bounds.x, bounds.y, bounds.width, bounds.height);
    expect(scene.fitMap).toHaveBeenCalled();
  });
});

describe("door editing", () => {
  it.each([false, true])("drags doors using authored offsets on a reversed=%s wall", (reversed) => {
    const wall: WallSpec = { x1: reversed ? 320 : 0, y1: 0, x2: reversed ? 0 : 320, y2: 0, thickness: 16, preset: "p", doors: [{ id: "entry", type: "hinged", offset: 64, width: 64 }] };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, selectedIndex: 0, tool: "select" });
    emit("pointerdown", pointer(reversed ? 224 : 96, 0));
    emit("pointerup", pointer(reversed ? 192 : 128, 0));
    expect(onUpdateWall).toHaveBeenCalledExactlyOnceWith(0, { doors: [{ ...wall.doors![0], offset: 96 }] });
    expect(wall.doors![0].offset).toBe(64);
  });

  it("prevents dragging a door over a window and shrinking a wall through a door", () => {
    const wall: WallSpec = { x1: 0, y1: 0, x2: 320, y2: 0, thickness: 16, preset: "p", windows: [{ offset: 192, width: 64 }], doors: [{ id: "entry", type: "sliding", offset: 64, width: 64 }] };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, selectedIndex: 0, tool: "select" });
    emit("pointerdown", pointer(96, 0));
    emit("pointerup", pointer(224, 0));
    expect(onUpdateWall).toHaveBeenLastCalledWith(0, { doors: wall.doors });
    emit("pointerdown", pointer(320, 0));
    emit("pointerup", pointer(96, 0));
    expect(onUpdateWall).toHaveBeenLastCalledWith(0, { x1: 0, y1: 0, x2: 320, y2: 0 });
  });

  it("prevents a window drag from overlapping a door", () => {
    const wall: WallSpec = { x1: 0, y1: 0, x2: 320, y2: 0, thickness: 16, preset: "p", windows: [{ offset: 192, width: 64 }], doors: [{ id: "entry", type: "sliding", offset: 64, width: 64 }] };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, selectedIndex: 0, tool: "select" });
    emit("pointerdown", pointer(224, 0));
    emit("pointerup", pointer(96, 0));
    expect(onUpdateWall).toHaveBeenLastCalledWith(0, { windows: wall.windows });
  });

  it("accounts for projected face height when dragging a vertical door", () => {
    const wall: WallSpec = { x1: 0, y1: 0, x2: 0, y2: 320, thickness: 16, height: 80, preset: "p", doors: [{ id: "entry", type: "hinged", offset: 64, width: 64 }] };
    const { emit, onUpdateWall } = makeEditor({ config: { presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, selectedIndex: 0, tool: "select" });
    emit("pointerdown", pointer(0, 176));
    emit("pointerup", pointer(0, 208));
    expect(onUpdateWall).toHaveBeenLastCalledWith(0, { doors: [{ ...wall.doors![0], offset: 96 }] });
  });
});

it("spawns near the map center rather than outside the sample's closed perimeter", async () => {
  const { initialConfig } = await import("../demo/editor-data");
  const scene = new EditorScene(initialConfig, vi.fn());
  const spawn = scene["findSpawn"]();
  expect(spawn.x).toBeGreaterThan(128 + 20);
  expect(spawn.x).toBeLessThan(832 - 20);
  expect(spawn.y).toBeGreaterThan(96 + 24);
  expect(spawn.y).toBeLessThan(544);
});

it("preview refuses closure on an occupant and permits it after they move away", () => {
  const config = { presets: { p: { fill: 0, edge: 0 } }, walls: [{ x1: 0, y1: 0, x2: 256, y2: 0, thickness: 16, preset: "p", doors: [{ id: "entry", type: "hinged" as const, offset: 96, width: 64 }] }] };
  const error = vi.fn();
  const scene = new EditorScene(config, error);
  const canvas = {};
  vi.stubGlobal("document", { activeElement: canvas });
  const toggleDoor = vi.fn();
  const player = { x: 128, y: 0, body: { x: 119, y: -5, width: 18, height: 10 } };
  Object.assign(scene, { game: { canvas }, preview: true, player, previewWalls: resolveWalls(config.walls, config.presets), wallMap: { getDoorState: () => "open", toggleDoor } });
  scene["interactDoor"]({ repeat: false } as KeyboardEvent);
  expect(toggleDoor).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith("Step out of the doorway before closing it.");
  player.y = 32;
  player.body.y = 22;
  scene["interactDoor"]({ repeat: false } as KeyboardEvent);
  expect(toggleDoor).toHaveBeenCalledExactlyOnceWith("entry");
  scene["interactDoor"]({ repeat: true } as KeyboardEvent);
  expect(toggleDoor).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

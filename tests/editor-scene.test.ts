import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import type { WallSpec } from "../src/types";

vi.mock("phaser", () => {
  class Vector2 {
    constructor(public x: number, public y: number) {}
    clone() { return new Vector2(this.x, this.y); }
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

vi.mock("../src/WallMap", () => ({ WallMap: class { destroy() {} } }));

import { EditorScene } from "../demo/editor/EditorScene";
import { getMapBounds } from "../demo/editor-data";

const pointer = (x: number, y: number) => ({ worldX: x, worldY: y, updateWorldPoint: vi.fn(), middleButtonDown: () => false }) as unknown as Phaser.Input.Pointer;

describe("editor world coordinates", () => {
  it.each([[1600, 1280, 2112, 1280], [-320, -160, -64, -160]])(
    "draws beyond the original viewport from (%s, %s) to (%s, %s)",
    (x1, y1, x2, y2) => {
      const onAddWall = vi.fn();
      const config = { presets: { interior: { fill: 0, edge: 0 } }, walls: [] };
      const scene = new EditorScene(config, vi.fn());
      scene.setEditorState(config, null, "wall", false, {
        onAddWall, onSelectWall: vi.fn(), onUpdateWall: vi.fn(),
      });
      scene["handlePointerDown"](pointer(x1, y1));
      scene["handlePointerUp"](pointer(x2, y2));
      expect(onAddWall).toHaveBeenCalledWith(expect.objectContaining({ x1, y1, x2, y2 }));
    },
  );

  it("does not clamp a dragged endpoint on a large map", () => {
    const wall: WallSpec = { x1: 1600, y1: 1280, x2: 2112, y2: 1280, thickness: 20, preset: "p" };
    const scene = new EditorScene({ presets: { p: { fill: 0, edge: 0 } }, walls: [wall] }, vi.fn());
    expect(scene["moveEndpoint"](wall, "end", scene["snapPoint"](2240, 1290)))
      .toMatchObject({ x1: 1600, y1: 1280, x2: 2240, y2: 1280 });
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
    Object.assign(scene, { input: { setDefaultCursor: vi.fn() } });
    scene.setEditorState(config, null, "wall", false, { onAddWall, onSelectWall: vi.fn(), onUpdateWall: vi.fn() });
    scene["handlePointerDown"]({ x: 100, y: 100, middleButtonDown: () => true } as Phaser.Input.Pointer);
    scene["handlePointerMove"]({ x: 200, y: 150 } as Phaser.Input.Pointer);
    scene["handlePointerUp"]({} as Phaser.Input.Pointer);
    expect(scene.cameras.main.scrollX).toBe(800);
    expect(scene.cameras.main.scrollY).toBe(700);
    expect(onAddWall).not.toHaveBeenCalled();
  });

  it.each([[0, 1], [1, 16], [2, 480]])("pans both axes with wheel delta mode %s", (deltaMode, unit) => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    Object.assign(scene, { scale: { displayScale: { x: 2, y: 2 }, canvasBounds: { height: 480 } } });
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
    const zoom = vi.spyOn(scene, "zoomBy").mockImplementation(() => {});
    scene["handleWheel"]({ x: 300, y: 200, event: { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true } } as Phaser.Input.Pointer);
    expect(zoom).toHaveBeenCalledWith(Math.exp(0.1), 300, 200);
  });

  it("ignores navigation gestures while drawing a wall", () => {
    const scene = new EditorScene({ presets: {}, walls: [] }, vi.fn());
    scene["handlePointerDown"](pointer(32, 32));
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

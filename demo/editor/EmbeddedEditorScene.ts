import Phaser from "phaser";
import { WallEditor, WallMap, type WallEditorTool, type WallMapConfig, type WallSpec } from "../../src";

export class EmbeddedEditorScene extends Phaser.Scene {
  create(): void {
    let config: WallMapConfig = {
      presets: {
        brick: { fill: 0xb59a8c, edge: 0x4a3830, lipHeight: 64, lipFill: 0x8f7a70 },
        green: { fill: 0x8aab96, edge: 0x244d38, lipHeight: 48 },
      },
      walls: [{ x1: 96, y1: 224, x2: 480, y2: 224, thickness: 16, preset: "brick" }],
    };
    let selectedIndex: number | null = null;
    let tool: WallEditorTool = "wall";
    let enabled = true;
    const walls = new WallMap(this, config);
    const help = this.add.text(16, 16, "", { fontSize: "16px", color: "#183c2c", lineSpacing: 8 }).setDepth(20000);
    const sync = () => {
      editor.setState({ config, selectedIndex, tool, enabled });
      help.setText([
        "Embedded WallEditor — an ordinary Phaser scene",
        "D draw · S select · Delete remove · Escape cancel · E enable/disable",
        "Selected wall: P preset · T thickness · H height · W toggle window",
        `Tool: ${tool} · ${enabled ? "enabled" : "disabled"} · Selected: ${selectedIndex ?? "none"}`,
      ]);
    };
    const commit = (next: WallSpec[]) => {
      config = { ...config, walls: next };
      walls.setWalls(next);
      sync();
    };
    const update = (index: number, patch: Partial<WallSpec>) => {
      commit(config.walls.map((wall, i) => i === index ? { ...wall, ...patch } : wall));
    };
    const editor = new WallEditor(this, {
      config, selectedIndex, tool,
      newWall: { preset: "brick", thickness: 16 },
      onAddWall: (wall) => {
        selectedIndex = config.walls.length;
        tool = "select";
        commit([...config.walls, wall]);
      },
      onSelectWall: (index) => { selectedIndex = index; sync(); },
      onUpdateWall: update,
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { editor.cancel(); return; }
      if (event.key.toLowerCase() === "e") { enabled = !enabled; sync(); return; }
      if (!enabled) return;
      if (event.key.toLowerCase() === "d") { tool = "wall"; sync(); return; }
      if (event.key.toLowerCase() === "s") { tool = "select"; sync(); return; }
      if (selectedIndex === null) return;
      const wall = config.walls[selectedIndex];
      if (event.key === "Delete" || event.key === "Backspace") {
        const next = config.walls.filter((_, index) => index !== selectedIndex);
        selectedIndex = null;
        commit(next);
      } else if (event.key.toLowerCase() === "p") {
        update(selectedIndex, { preset: wall.preset === "brick" ? "green" : "brick" });
      } else if (event.key.toLowerCase() === "t") {
        update(selectedIndex, { thickness: wall.thickness === 16 ? 32 : 16 });
      } else if (event.key.toLowerCase() === "h") {
        update(selectedIndex, { height: wall.height === 96 ? 48 : 96 });
      } else if (event.key.toLowerCase() === "w") {
        const length = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
        update(selectedIndex, { windows: wall.windows?.length ? [] : [{ offset: 0, width: Math.min(64, length), height: (wall.height ?? config.presets[wall.preset].lipHeight ?? 0) / 2, sillHeight: (wall.height ?? config.presets[wall.preset].lipHeight ?? 0) / 4 }] });
      }
    };
    this.input.keyboard?.on("keydown", onKey);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", onKey);
      walls.destroy();
    });
    sync();
  }
}

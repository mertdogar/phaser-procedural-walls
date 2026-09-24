import Phaser from "phaser";
import { useEffect, useRef, useState } from "react";
import type { WallSpec } from "../../src/types";
import type { WallMapConfig } from "../editor-data";
import { EditorScene, type EditorTool } from "./EditorScene";
import { Button } from "../components/ui/button";

interface WallCanvasProps {
  config: WallMapConfig;
  selectedIndex: number | null;
  tool: EditorTool;
  preview: boolean;
  onAddWall: (wall: WallSpec) => void;
  onSelectWall: (index: number | null) => void;
  onUpdateWall: (index: number, patch: Partial<WallSpec>) => void;
}

export function WallCanvas({ config, selectedIndex, tool, preview, onAddWall, onSelectWall, onUpdateWall }: WallCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EditorScene | null>(null);
  const [textureError, setTextureError] = useState("");

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const scene = new EditorScene(config, setTextureError);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      width: host.clientWidth,
      height: host.clientHeight,
      backgroundColor: "#f2efe8",
      physics: { default: "arcade" },
      input: { mouse: { preventDefaultWheel: true } },
      scale: { mode: Phaser.Scale.NONE },
      scene,
    });
    const refresh = () => {
      game.scale.resize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(host);
    return () => {
      observer.disconnect();
      sceneRef.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setEditorState(config, selectedIndex, tool, preview, { onAddWall, onSelectWall, onUpdateWall });
  }, [config, onAddWall, onSelectWall, onUpdateWall, preview, selectedIndex, tool]);

  return <>
    <div ref={hostRef} className="size-full overflow-hidden rounded-lg" aria-label={preview ? "Playable wall preview" : "Interactive wall canvas"} />
    <div className="absolute bottom-7 left-8 flex gap-1 rounded-lg border bg-background p-1 shadow-sm" aria-label="Map navigation">
      <Button variant="ghost" size="sm" aria-label="Zoom out" onClick={() => sceneRef.current?.zoomBy(0.8)}>−</Button>
      <Button variant="ghost" size="sm" onClick={() => sceneRef.current?.fitMap()}>Fit map</Button>
      <Button variant="ghost" size="sm" aria-label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.25)}>+</Button>
    </div>
    {textureError && <p role="alert" className="absolute bottom-16 left-8 rounded border bg-background p-3 text-sm text-destructive">{textureError}</p>}
    {preview && <p className="absolute top-4 left-4 rounded border bg-background p-2 text-sm">Arrow keys to move · E near a door to open or close</p>}
  </>;
}

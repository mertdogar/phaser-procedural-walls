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
    const scene = new EditorScene(config, setTextureError);
    sceneRef.current = scene;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 960,
      height: 640,
      backgroundColor: "#f2efe8",
      physics: { default: "arcade" },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 640 },
      scene,
    });
    const refresh = () => game.scale.refresh();
    const observer = new ResizeObserver(refresh);
    observer.observe(hostRef.current);
    requestAnimationFrame(refresh);
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
  </>;
}

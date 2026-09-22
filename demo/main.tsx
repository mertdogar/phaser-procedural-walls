import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Phaser from "phaser";
import { EmbeddedEditorScene } from "./editor/EmbeddedEditorScene";
import "./styles.css";

if (new URLSearchParams(location.search).has("embedded")) {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "root",
    backgroundColor: "#f2efe8",
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: EmbeddedEditorScene,
  });
} else createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

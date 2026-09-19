import Phaser from "phaser";
import { WallMap } from "./WallMap";
import type { WallMapConfig } from "./types";

declare module "phaser" {
  namespace GameObjects {
    interface GameObjectFactory {
      wallMap(config: WallMapConfig): WallMap;
    }
  }
}

export class WallMapPlugin extends Phaser.Plugins.ScenePlugin {
  constructor(scene: Phaser.Scene, pluginManager: Phaser.Plugins.PluginManager, pluginKey: string) {
    super(scene, pluginManager, pluginKey);
    if (typeof (scene.add as { wallMap?: unknown }).wallMap === "function") return;
    pluginManager.registerGameObject("wallMap", function (
      this: Phaser.GameObjects.GameObjectFactory,
      config: WallMapConfig,
    ) {
      return new WallMap(this.scene, config);
    });
  }
}

export interface WallPreset {
  fill: number;
  edge: number;
  edgeWidth?: number;
  lipHeight?: number;
  lipFill?: number;
  windowFill?: number;
  windowFrame?: number;
  windowInset?: number;
  windowAlpha?: number;
  sillThickness?: number;
  texture?: string;
  lipTexture?: string;
  doorFill?: number;
  doorFrame?: number;
}

export type DoorType = "hinged" | "sliding";
export type DoorState = "closed" | "opening" | "open" | "closing";

export interface DoorTextures {
  closed: string;
  open: string;
}

export interface DoorSpec {
  id: string;
  type: DoorType;
  offset: number;
  width: number;
  height: number;
  open?: boolean;
  side?: "start" | "end";
  swing?: "left" | "right";
  texture?: DoorTextures;
  sideTexture?: DoorTextures;
}

export interface ResolvedDoor {
  spec: DoorSpec;
  collider: Rect;
}

export interface WindowSpec {
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  texture?: string;
  sideTexture?: string;
}

export interface WallSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height?: number;
  depth?: number;
  preset: string;
  windows?: WindowSpec[];
  doors?: DoorSpec[];
}

export interface WallMapConfig {
  presets: Record<string, WallPreset>;
  walls: WallSpec[];
  collide?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallSurface {
  rect: Rect;
  kind: "body" | "lip" | "window" | "sill";
  floorY: number;
  texture?: string;
  depth: number;
}

export interface ResolvedWall {
  surfaces: WallSurface[];
  spec: WallSpec;
  horizontal: boolean;
  body: Rect;
  lip: Rect | null;
  bodyPieces: Rect[];
  lipPieces: Rect[];
  windows: Rect[];
  sills: Rect[];
  collider: Rect;
  colliderPieces: Rect[];
  doors: ResolvedDoor[];
  depth: number;
}

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
  sillHeight?: number;
  texture?: string;
  lipTexture?: string;
}

export interface WindowSpec {
  offset: number;
  width: number;
}

export interface WallSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  preset: string;
  windows?: WindowSpec[];
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

export interface ResolvedWall {
  spec: WallSpec;
  horizontal: boolean;
  body: Rect;
  lip: Rect | null;
  bodyPieces: Rect[];
  lipPieces: Rect[];
  windows: Rect[];
  sills: Rect[];
  collider: Rect;
  depth: number;
}

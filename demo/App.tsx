import {
  BrickWallIcon,
  DownloadIcon,
  FileUpIcon,
  MousePointer2Icon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveWalls } from "../src/geometry";
import type { WallPreset, WallSpec } from "../src/types";
import type { WallMapConfig } from "./editor-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WallCanvas } from "./editor/WallCanvas";
import type { EditorTool } from "./editor/EditorScene";
import { initialConfig, parseWallConfig, serializeWallConfig } from "./editor-data";

export default function App() {
  const [config, setConfig] = useState<WallMapConfig>(initialConfig);
  const [tool, setTool] = useState<EditorTool>("wall");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<WallMapConfig[]>([]);
  const [future, setFuture] = useState<WallMapConfig[]>([]);
  const [preview, setPreview] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState(serializeWallConfig(initialConfig));
  const [importError, setImportError] = useState("");

  const commitConfig = useCallback((next: WallMapConfig) => {
    setConfig((current) => {
      setHistory((items) => [...items.slice(-24), current]);
      return next;
    });
    setFuture([]);
  }, []);

  const addWall = useCallback((wall: WallSpec) => {
    setConfig((current) => {
      setHistory((items) => [...items.slice(-24), current]);
      const next = { ...current, walls: [...current.walls, wall] };
      setSelectedIndex(next.walls.length - 1);
      return next;
    });
    setFuture([]);
    setTool("select");
  }, []);

  const updateWall = useCallback((index: number, patch: Partial<WallSpec>) => {
    setConfig((current) => {
      const walls = current.walls.map((wall, wallIndex) => wallIndex === index ? { ...wall, ...patch } : wall);
      return { ...current, walls };
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (selectedIndex === null) return;
    commitConfig({ ...config, walls: config.walls.filter((_, index) => index !== selectedIndex) });
    setSelectedIndex(null);
  }, [commitConfig, config, selectedIndex]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [config, ...items]);
    setConfig(previous);
    setSelectedIndex(null);
  }, [config, history]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items, config]);
    setConfig(next);
    setSelectedIndex(null);
  }, [config, future]);

  const reset = useCallback(() => {
    commitConfig(initialConfig);
    setSelectedIndex(null);
  }, [commitConfig]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (presetsOpen || importOpen) return;
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable='true']")) return;
      if ((event.key === "Backspace" || event.key === "Delete") && selectedIndex !== null) {
        event.preventDefault();
        deleteSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelected, redo, selectedIndex, undo, presetsOpen, importOpen]);

  const openImport = () => {
    setImportValue(serializeWallConfig(config));
    setImportError("");
    setImportOpen(true);
  };

  const applyImport = () => {
    try {
      const next = parseWallConfig(importValue);
      commitConfig(next);
      setSelectedIndex(null);
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not parse JSON.");
    }
  };

  const exportJson = () => {
    const blob = new Blob([serializeWallConfig(config)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wall-map.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePreview = () => {
    setPreview((current) => !current);
    setSelectedIndex(null);
  };

  const editorProps: EditorProps = {
    config,
    tool,
    selectedIndex,
    historyCount: history.length,
    futureCount: future.length,
    preview,
    onToolChange: setTool,
    onAddWall: addWall,
    onSelectWall: setSelectedIndex,
    onUpdateWall: updateWall,
    onDeleteSelected: deleteSelected,
    onUndo: undo,
    onRedo: redo,
    onReset: reset,
    onImport: openImport,
    onExport: exportJson,
    onPreviewToggle: togglePreview,
    onPresets: () => setPresetsOpen(true),
  };

  return (
    <TooltipProvider>
      <Editor {...editorProps} />
      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Wall presets</DialogTitle>
            <DialogDescription>Manage shared wall styles. Saved changes update all walls using the preset.</DialogDescription>
          </DialogHeader>
          <PresetManager config={config} onChange={commitConfig} />
        </DialogContent>
      </Dialog>
      <ImportDialog
        open={importOpen}
        value={importValue}
        error={importError}
        onOpenChange={setImportOpen}
        onValueChange={setImportValue}
        onApply={applyImport}
      />
    </TooltipProvider>
  );
}

interface EditorProps {
  config: WallMapConfig;
  tool: EditorTool;
  selectedIndex: number | null;
  historyCount: number;
  futureCount: number;
  preview: boolean;
  onToolChange: (tool: EditorTool) => void;
  onAddWall: (wall: WallSpec) => void;
  onSelectWall: (index: number | null) => void;
  onUpdateWall: (index: number, patch: Partial<WallSpec>) => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onImport: () => void;
  onExport: () => void;
  onPreviewToggle: () => void;
  onPresets: () => void;
}

function Editor(props: EditorProps) {
  return (
    <div className="flex h-screen min-h-[680px] flex-col bg-background">
      <TopBar {...props} />
      <main className="relative min-h-0 flex-1 p-3">
        <div className="size-full overflow-hidden rounded-xl border bg-muted shadow-inner">
          <WallCanvas {...canvasProps(props)} />
        </div>
        {!props.preview && (
          <>
            <div className="absolute top-8 left-8">
              <ToolPicker tool={props.tool} onChange={props.onToolChange} vertical />
            </div>
            <Card className="absolute top-8 right-8 max-h-[calc(100%-4rem)] w-80 gap-4 overflow-hidden py-4 shadow-xl">
              <CardHeader className="px-4">
                <CardTitle>Wall inspector</CardTitle>
                <CardDescription>Select a wall to edit its geometry.</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 overflow-auto px-4">
                <WallInspector {...inspectorProps(props)} />
              </CardContent>
              <CardFooter className="px-4">
                <SelectionFooter {...props} />
              </CardFooter>
            </Card>
          </>
        )}
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full border bg-background px-4 py-2 text-xs text-muted-foreground shadow-sm">
          {props.preview ? "Arrow keys to move · wall collisions enabled" : "32 px grid · drag to draw · click to select"}
        </div>
      </main>
    </div>
  );
}

function TopBar(props: EditorProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-5">
      <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground"><BrickWallIcon /></div>
        <div>
          <h1 className="font-semibold leading-tight">Wallcraft</h1>
          <p className="text-xs text-muted-foreground">Untitled floor plan</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TooltipButton label="Undo" onClick={props.onUndo} disabled={!props.historyCount}><Undo2Icon /></TooltipButton>
        <TooltipButton label="Redo" onClick={props.onRedo} disabled={!props.futureCount}><Redo2Icon /></TooltipButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button variant="outline" size="sm" onClick={props.onPresets} disabled={props.preview}>Presets</Button>
        <FileActions
          preview={props.preview}
          onImport={props.onImport}
          onExport={props.onExport}
          onPreviewToggle={props.onPreviewToggle}
        />
      </div>
    </header>
  );
}

function FileActions({ preview, onImport, onExport, onPreviewToggle }: {
  preview: boolean;
  onImport: () => void;
  onExport: () => void;
  onPreviewToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onImport}><FileUpIcon data-icon="inline-start" />Import</Button>
      <Button size="sm" onClick={onExport}><DownloadIcon data-icon="inline-start" />Export JSON</Button>
      <Button variant="outline" size="sm" aria-pressed={preview} onClick={onPreviewToggle}>
        {preview ? <XIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
        {preview ? "Exit preview" : "Preview"}
      </Button>
    </div>
  );
}

function ToolPicker({ tool, onChange, vertical = false }: { tool: EditorTool; onChange: (tool: EditorTool) => void; vertical?: boolean }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={tool}
      onValueChange={(value) => value && onChange(value as EditorTool)}
      orientation={vertical ? "vertical" : "horizontal"}
      className={vertical ? "flex-col bg-background p-1 shadow-lg" : "bg-background"}
    >
      <ToggleGroupItem value="select" aria-label="Select walls"><MousePointer2Icon />{!vertical && "Select"}</ToggleGroupItem>
      <ToggleGroupItem value="wall" aria-label="Draw walls"><BrickWallIcon />{!vertical && "Draw wall"}</ToggleGroupItem>
    </ToggleGroup>
  );
}

function WallInspector({ config, selectedIndex, onUpdateWall }: {
  config: WallMapConfig;
  selectedIndex: number | null;
  onUpdateWall: (index: number, patch: Partial<WallSpec>) => void;
}) {
  const wall = selectedIndex === null ? null : config.walls[selectedIndex];
  if (!wall || selectedIndex === null) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <MousePointer2Icon />
        <p className="text-sm">Choose Select, then click a wall.</p>
      </div>
    );
  }
  const updateNumber = (key: "x1" | "y1" | "x2" | "y2" | "thickness" | "height", value: string) => {
    const number = Number(value);
    if (Number.isFinite(number)) onUpdateWall(selectedIndex, { [key]: number });
  };
  const automaticDepth = resolveWalls(config.walls, config.presets)[selectedIndex]?.depth ?? 0;
  const wallLength = Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
  const updateWindowOffset = (windowIndex: number, value: string) => {
    const offset = Number(value);
    const window = wall.windows?.[windowIndex];
    if (!window || !Number.isFinite(offset)) return;
    const windows = wall.windows?.map((item, index) => index === windowIndex
      ? { ...item, offset: Math.min(Math.max(0, offset), Math.max(0, wallLength - item.width)) }
      : item);
    onUpdateWall(selectedIndex, { windows });
  };
  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor={`preset-${selectedIndex}`}>Preset</FieldLabel>
        <Select value={wall.preset} onValueChange={(preset) => onUpdateWall(selectedIndex, { preset })}>
          <SelectTrigger id={`preset-${selectedIndex}`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            {Object.keys(config.presets).map((preset) => <SelectItem key={preset} value={preset}>{preset}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {(["x1", "y1", "x2", "y2"] as const).map((key) => (
          <Field key={key}>
            <FieldLabel htmlFor={`${key}-${selectedIndex}`}>{key.toUpperCase()}</FieldLabel>
            <Input id={`${key}-${selectedIndex}`} type="number" step="32" value={wall[key]} onChange={(event) => updateNumber(key, event.target.value)} />
          </Field>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor={`thickness-${selectedIndex}`}>Thickness</FieldLabel>
        <Input id={`thickness-${selectedIndex}`} type="number" min="4" max="64" value={wall.thickness} onChange={(event) => updateNumber("thickness", event.target.value)} />
        <FieldDescription>Wall body width in pixels.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`height-${selectedIndex}`}>Height</FieldLabel>
        <Input
          id={`height-${selectedIndex}`}
          type="number"
          min="0"
          max="160"
          step="4"
          value={wall.height ?? config.presets[wall.preset]?.lipHeight ?? 0}
          onChange={(event) => updateNumber("height", event.target.value)}
        />
        <FieldDescription>Visible wall face height in pixels.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`depth-${selectedIndex}`}>Drawing order</FieldLabel>
        <Input
          id={`depth-${selectedIndex}`}
          type="number"
          step="1"
          value={wall.depth ?? ""}
          placeholder={`Auto (${automaticDepth})`}
          onChange={(event) => {
            const depth = event.target.value === "" ? undefined : Number(event.target.value);
            if (depth === undefined || Number.isFinite(depth)) onUpdateWall(selectedIndex, { depth });
          }}
        />
        <FieldDescription>Higher values draw later. Leave blank for automatic depth.</FieldDescription>
      </Field>
      <Field>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <FieldLabel>Windows</FieldLabel>
            <FieldDescription>{wall.windows?.length ?? 0} openings · drag on the map</FieldDescription>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              const width = Math.min(64, Math.max(32, wallLength - 32));
              onUpdateWall(selectedIndex, { windows: [...(wall.windows ?? []), { offset: Math.max(16, (wallLength - width) / 2), width }] });
            }}
          >
            <PlusIcon data-icon="inline-start" />Add
          </Button>
        </div>
        {(wall.windows?.length ?? 0) > 0 && (
          <FieldGroup className="gap-3">
            {wall.windows?.map((window, windowIndex) => (
              <Field key={windowIndex} orientation="horizontal">
                <FieldLabel htmlFor={`window-${selectedIndex}-${windowIndex}`}>Window {windowIndex + 1}</FieldLabel>
                <Input
                  id={`window-${selectedIndex}-${windowIndex}`}
                  className="w-28"
                  type="number"
                  min="0"
                  max={Math.max(0, wallLength - window.width)}
                  step="32"
                  value={window.offset}
                  onChange={(event) => updateWindowOffset(windowIndex, event.target.value)}
                  aria-label={`Window ${windowIndex + 1} offset`}
                />
              </Field>
            ))}
          </FieldGroup>
        )}
      </Field>
    </FieldGroup>
  );
}

function PresetManager({ config, onChange }: { config: WallMapConfig; onChange: (config: WallMapConfig) => void }) {
  const [selected, setSelected] = useState(Object.keys(config.presets)[0] ?? "");
  const addPreset = (source?: WallPreset) => {
    const base = source ? `${selected}-copy` : "new-preset";
    let name = base;
    for (let suffix = 2; Object.hasOwn(config.presets, name); suffix++) name = `${base}-${suffix}`;
    onChange({ ...config, presets: { ...config.presets, [name]: { ...(source ?? initialConfig.presets.interior) } } });
    setSelected(name);
  };
  const preset = config.presets[selected];
  const usage = config.walls.filter((wall) => wall.preset === selected).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor="manage-preset">Preset</FieldLabel>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger id="manage-preset" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              {Object.keys(config.presets).map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Button variant="outline" onClick={() => addPreset()}><PlusIcon />New</Button>
        <Button variant="outline" disabled={!preset} onClick={() => addPreset(preset)}>Duplicate</Button>
      </div>
      {preset && <PresetForm
        key={selected}
        name={selected}
        preset={preset}
        names={Object.keys(config.presets)}
        usage={usage}
        textures={config.textures ?? {}}
        onSave={(name, next, textures) => {
          const presets = Object.fromEntries(Object.entries(config.presets).map(([key, value]) => key === selected ? [name, next] : [key, value]));
          onChange({ ...config, presets, textures, walls: config.walls.map((wall) => wall.preset === selected ? { ...wall, preset: name } : wall) });
          setSelected(name);
        }}
        onDelete={() => {
          const presets = Object.fromEntries(Object.entries(config.presets).filter(([key]) => key !== selected));
          onChange({ ...config, presets });
          setSelected(Object.keys(presets)[0]);
        }}
      />}
    </div>
  );
}

function PresetForm({ name, preset, names, usage, textures, onSave, onDelete }: {
  name: string;
  preset: WallPreset;
  names: string[];
  usage: number;
  textures: Record<string, string>;
  onSave: (name: string, preset: WallPreset, textures: Record<string, string>) => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState(preset);
  const [saved, setSaved] = useState(false);
  const [images, setImages] = useState(textures);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadTexture = async (key: "texture" | "lipTexture", file?: File) => {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read the image."));
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = data;
      await image.decode();
      const id = `wallcraft-${crypto.randomUUID()}`;
      setImages((current) => ({ ...current, [id]: data }));
      setDraft((current) => ({ ...current, [key]: id }));
      setSaved(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not load the image.");
    } finally {
      setUploading(false);
    }
  };
  const trimmedName = draftName.trim();
  const validName = trimmedName.length > 0 && (trimmedName === name || !names.includes(trimmedName));
  const update = (patch: Partial<WallPreset>) => { setDraft({ ...draft, ...patch }); setSaved(false); };
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (validName && !uploading) { onSave(trimmedName, draft, images); setSaved(true); } }}>
      <Field>
        <FieldLabel htmlFor="preset-name">Name</FieldLabel>
        <Input id="preset-name" value={draftName} aria-invalid={!validName} onChange={(event) => { setDraftName(event.target.value); setSaved(false); }} />
        <FieldDescription>{validName ? `${usage} wall${usage === 1 ? "" : "s"} use this preset. Renaming keeps walls linked.` : "Enter a unique, non-empty name."}</FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {([["texture", "Body texture"], ["lipTexture", "Front-face texture"]] as const).map(([key, label]) => (
          <Field key={key}>
            <FieldLabel htmlFor={`preset-${key}`}>{label}</FieldLabel>
            <Select value={draft[key] ?? "none"} onValueChange={(value) => { if (value) update({ [key]: value === "none" ? undefined : value }); }}>
              <SelectTrigger id={`preset-${key}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="none">Solid color</SelectItem>
                {Array.from(new Set([...Object.keys(images), ...(draft[key] ? [draft[key]] : [])])).map((id, index) => <SelectItem key={id} value={id}>Image {index + 1}{!images[id] ? " (not loaded)" : ""}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            {draft[key] && images[draft[key]] && <img src={images[draft[key]]} alt={`${label} preview`} className="h-16 w-full rounded border object-contain" />}
            <Input aria-label={`Upload ${label.toLowerCase()}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { void uploadTexture(key, event.target.files?.[0]); event.target.value = ""; }} />
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Images repeat at their original size. PNG, JPEG, or WebP, up to 5 MB each. Uploaded images are included in exported JSON.</p>
      {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {([
          ["fill", "Body color", draft.fill],
          ["edge", "Outline color", draft.edge],
          ["lipFill", "Face color", draft.fill],
          ["windowFill", "Glass color", 0x3d7f88],
          ["windowFrame", "Window frame", undefined],
        ] as const).map(([key, label, fallback]) => (
          <Field key={key}>
            <FieldLabel htmlFor={`preset-${key}`}>{label}</FieldLabel>
            <Input id={`preset-${key}`} type="color" className="p-1" value={`#${(draft[key] ?? fallback ?? 0).toString(16).padStart(6, "0")}`} onChange={(event) => update({ [key]: Number.parseInt(event.target.value.slice(1), 16) })} />
            {key !== "fill" && key !== "edge" && <Button type="button" variant="ghost" size="xs" onClick={() => update({ [key]: undefined })}>{draft[key] === undefined ? "Using default" : "Use default"}</Button>}
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {([
          ["lipHeight", "Face height", 0, 160, 1],
          ["edgeWidth", "Outline width", 2, 16, 1],
          ["windowInset", "Window inset", 0.6, 1, 0.01],
          ["windowAlpha", "Glass opacity", 0.5, 1, 0.01],
          ["sillHeight", "Sill height", 8, 64, 1],
        ] as const).map(([key, label, fallback, max, step]) => (
          <Field key={key}>
            <FieldLabel htmlFor={`preset-${key}`}>{label}</FieldLabel>
            <Input id={`preset-${key}`} type="number" min="0" max={max} step={step} placeholder={String(fallback)} value={draft[key] ?? ""} onChange={(event) => update({ [key]: event.target.value === "" ? undefined : Number(event.target.value) })} />
          </Field>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Face height applies to walls without an individual height override. Blank number fields use defaults.</p>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="destructive" disabled={usage > 0 || names.length < 2} onClick={onDelete}>Delete preset</Button>
        <span className="text-sm text-muted-foreground" role="status">{saved ? "Preset saved" : ""}</span>
        <Button type="submit" disabled={!validName || uploading}>{uploading ? "Loading image…" : "Save preset"}</Button>
      </div>
      {(usage > 0 || names.length < 2) && <p className="text-xs text-muted-foreground">{usage > 0 ? "Reassign walls before deleting this preset." : "Keep at least one preset to draw walls."}</p>}
    </form>
  );
}

function SelectionFooter(props: Pick<EditorProps, "selectedIndex" | "onDeleteSelected" | "onReset">) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Button variant="ghost" size="sm" onClick={props.onReset}><RotateCcwIcon data-icon="inline-start" />Reset</Button>
      <Button variant="destructive" size="sm" disabled={props.selectedIndex === null} onClick={props.onDeleteSelected}>
        <Trash2Icon data-icon="inline-start" />Delete
      </Button>
    </div>
  );
}

function ImportDialog({ open, value, error, onOpenChange, onValueChange, onApply }: {
  open: boolean;
  value: string;
  error: string;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onApply: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const readFile = async (file?: File) => {
    if (file) onValueChange(await file.text());
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import wall JSON</DialogTitle>
          <DialogDescription>Load a WallMapConfig file or paste its contents below.</DialogDescription>
        </DialogHeader>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => readFile(event.target.files?.[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUpIcon data-icon="inline-start" />Choose JSON file</Button>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="import-json">JSON source</FieldLabel>
          <Textarea id="import-json" className="min-h-72 font-mono text-xs" aria-invalid={Boolean(error)} value={value} onChange={(event) => onValueChange(event.target.value)} spellCheck={false} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onApply}>Import map</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TooltipButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" {...props}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
  );
}

function canvasProps(props: EditorProps) {
  return {
    config: props.config,
    selectedIndex: props.selectedIndex,
    tool: props.tool,
    preview: props.preview,
    onAddWall: props.onAddWall,
    onSelectWall: props.onSelectWall,
    onUpdateWall: props.onUpdateWall,
  };
}

function inspectorProps(props: EditorProps) {
  return { config: props.config, selectedIndex: props.selectedIndex, onUpdateWall: props.onUpdateWall };
}

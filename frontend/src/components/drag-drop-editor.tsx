"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { DragDropPlayer } from "@/components/drag-drop-player";
import { ImageUploadButton } from "@/components/image-upload-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dragDropPrimaryPlacements } from "@/lib/drag-drop-grading";
import type {
  StoredTaskDragDropItem,
  StoredTaskDragDropSolution,
  StoredTaskDragDropTarget,
} from "@/lib/task-schema";
import { cn } from "@/lib/utils";

type Props = {
  backgroundUrl: string | null;
  items: StoredTaskDragDropItem[];
  targets: StoredTaskDragDropTarget[];
  solutions: StoredTaskDragDropSolution[];
  onUploadBackground: (files: FileList | null) => void;
  onReplaceItemImage: (id: string, files: FileList | null) => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onUpdateItem: (
    id: string,
    patch: Partial<
      Pick<StoredTaskDragDropItem, "label" | "widthPercent" | "equivalenceKey">
    >,
  ) => void;
  onAddTarget: () => string;
  onRemoveTarget: (id: string) => void;
  onUpdateTarget: (
    id: string,
    patch: Partial<Pick<StoredTaskDragDropTarget, "x" | "y" | "snapRadius">>,
  ) => void;
  onUpdatePrimary: (placements: Record<string, string>) => void;
  onAddSolution: () => string;
  onRemoveSolution: (id: string) => void;
  onUpdateSolution: (id: string, placements: Record<string, string>) => void;
};
const clamp = (v: number) =>
  Math.round(Math.max(0, Math.min(100, v)) * 1000) / 1000;

export function DragDropEditor(p: Props) {
  const { backgroundUrl, items, targets, solutions } = p;
  const [mode, setMode] = useState("positions");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [solutionId, setSolutionId] = useState("primary");
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () =>
      setSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [backgroundUrl, mode]);
  const selected = targets.find((t) => t.id === targetId) ?? targets[0];
  const selectedIndex = targets.findIndex((t) => t.id === selected?.id);
  const alternative = solutions.find((s) => s.id === solutionId);
  const placements =
    alternative?.placements ?? dragDropPrimaryPlacements(items);
  const change = (next: Record<string, string>) =>
    alternative
      ? p.onUpdateSolution(alternative.id, next)
      : p.onUpdatePrimary(next);
  const targetIds = new Set(targets.map((t) => t.id));
  const incomplete = [
    { name: "Principal", placements: dragDropPrimaryPlacements(items) },
    ...solutions.map((s, i) => ({
      name: `Alterna ${i + 1}`,
      placements: s.placements,
    })),
  ].filter((s) => {
    const assigned = items.map((item) => s.placements[item.id]);
    return (
      assigned.some((id) => !targetIds.has(id)) ||
      new Set(assigned).size !== assigned.length
    );
  });
  const assign = (id: string, destination: string) => {
    const next = { ...placements };
    const previous = next[id];
    const other = items.find(
      (item) => item.id !== id && next[item.id] === destination,
    );
    if (destination) next[id] = destination;
    else delete next[id];
    if (destination && other) {
      if (targetIds.has(previous)) next[other.id] = previous;
      else delete next[other.id];
    }
    change(next);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    p.onUpdateTarget(drag.id, {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    });
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <FieldGroup>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v)}
          variant="outline"
          aria-label="Modo del editor"
        >
          <ToggleGroupItem value="positions">Editar posiciones</ToggleGroupItem>
          <ToggleGroupItem value="solutions">Definir solución</ToggleGroupItem>
        </ToggleGroup>
        <ImageUploadButton
          id="drag-background"
          onChange={(e) => {
            p.onUploadBackground(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {items.length} piezas · {targets.length} destinos
      </p>
      {incomplete.length > 0 && (
        <Alert>
          <AlertDescription>
            Soluciones incompletas: {incomplete.map((s) => s.name).join(", ")}.
            Coloca cada pieza en un destino distinto antes de guardar.
          </AlertDescription>
        </Alert>
      )}
      {mode === "positions" ? (
        <FieldSet>
          <FieldLegend>Posiciones permitidas</FieldLegend>
          <FieldDescription>
            Marca todos los lugares donde se puede colocar una pieza, incluidos
            los que pueden quedar vacíos. Arrastra un destino o ajústalo con las
            flechas; Shift permite un ajuste fino.
          </FieldDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTargetId(p.onAddTarget())}
          >
            <PlusIcon data-icon="inline-start" />
            Agregar destino
          </Button>
          {backgroundUrl && (
            <div
              ref={stageRef}
              className="relative mx-auto w-full max-w-3xl"
              data-drag-target-editor
            >
              <img
                src={backgroundUrl}
                alt="Escenario para editar destinos"
                className="block h-auto w-full"
                draggable={false}
              />
              {targets.map((t, i) => {
                const diameter = Math.max(
                  24,
                  (t.snapRadius / 50) * Math.min(size.width, size.height),
                );
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={`Mover destino ${i + 1}`}
                    aria-pressed={selected?.id === t.id}
                    className={cn(
                      "absolute flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-dashed bg-background/80 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected?.id === t.id
                        ? "border-primary text-primary"
                        : "border-muted-foreground text-foreground",
                    )}
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      width: diameter,
                      height: diameter,
                    }}
                    onClick={() => setTargetId(t.id)}
                    onPointerDown={(e) => {
                      if (!e.isPrimary || e.button !== 0) return;
                      e.preventDefault();
                      setTargetId(t.id);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = { id: t.id, pointerId: e.pointerId };
                    }}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.2 : 1;
                      const offset = (
                        {
                          ArrowLeft: [-step, 0],
                          ArrowRight: [step, 0],
                          ArrowUp: [0, -step],
                          ArrowDown: [0, step],
                        } as Record<string, number[]>
                      )[e.key];
                      if (!offset) return;
                      e.preventDefault();
                      setTargetId(t.id);
                      p.onUpdateTarget(t.id, {
                        x: clamp(t.x + offset[0]),
                        y: clamp(t.y + offset[1]),
                      });
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          )}
          {selected && (
            <FieldGroup className="mx-auto w-full max-w-3xl">
              <Field>
                <FieldLabel htmlFor="drag-selected-target">
                  Destino a editar
                </FieldLabel>
                <NativeSelect
                  id="drag-selected-target"
                  value={selected.id}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  {targets.map((t, i) => (
                    <NativeSelectOption key={t.id} value={t.id}>
                      Destino {i + 1}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    ["x", "Horizontal (%)"],
                    ["y", "Vertical (%)"],
                    ["snapRadius", "Radio de encaje (%)"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`drag-target-${key}`}>
                      {label}
                    </FieldLabel>
                    <Input
                      id={`drag-target-${key}`}
                      type="number"
                      min={key === "snapRadius" ? 0.1 : 0}
                      max={100}
                      step={0.1}
                      value={selected[key]}
                      onChange={(e) => {
                        const v = e.target.valueAsNumber;
                        if (Number.isFinite(v))
                          p.onUpdateTarget(selected.id, {
                            [key]:
                              key === "snapRadius"
                                ? Math.max(0.1, clamp(v))
                                : clamp(v),
                          });
                      }}
                    />
                  </Field>
                ))}
              </FieldGroup>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Quitar destino ${selectedIndex + 1}`}
                onClick={() => p.onRemoveTarget(selected.id)}
              >
                <XIcon data-icon="inline-start" />
                Quitar destino {selectedIndex + 1}
              </Button>
            </FieldGroup>
          )}
        </FieldSet>
      ) : (
        <FieldSet>
          <FieldLegend>Soluciones válidas</FieldLegend>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-auto">
              <FieldLabel htmlFor="drag-solution">Solución válida</FieldLabel>
              <NativeSelect
                id="drag-solution"
                value={alternative?.id ?? "primary"}
                onChange={(e) => setSolutionId(e.target.value)}
              >
                <NativeSelectOption value="primary">
                  Principal
                </NativeSelectOption>
                {solutions.map((s, i) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    Alterna {i + 1}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSolutionId(p.onAddSolution())}
            >
              <PlusIcon data-icon="inline-start" />
              Otra solución
            </Button>
            {alternative && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  p.onRemoveSolution(alternative.id);
                  setSolutionId("primary");
                }}
              >
                Quitar alternativa
              </Button>
            )}
          </div>
          <FieldDescription>
            Coloca todas las piezas. Puedes dejar destinos vacíos. Al ocupar el
            destino de otra pieza, se intercambian; si venías de la bandeja, la
            otra pieza vuelve a ella.
          </FieldDescription>
          {backgroundUrl && (
            <DragDropPlayer
              key={alternative?.id ?? "primary"}
              backgroundUrl={backgroundUrl}
              items={items}
              targets={targets}
              placements={placements}
              onChange={change}
              showTargets
            />
          )}
        </FieldSet>
      )}
      <FieldSet>
        <FieldLegend>Piezas</FieldLegend>
        <FieldDescription>
          Usa el mismo grupo en «Piezas equivalentes» para fichas
          intercambiables, por ejemplo B. Déjalo vacío para conservar la
          equivalencia por imagen.
        </FieldDescription>
        <Button type="button" variant="outline" size="sm" onClick={p.onAddItem}>
          <PlusIcon data-icon="inline-start" />
          Agregar pieza
        </Button>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((item, i) => (
            <FieldSet key={item.id} className="min-w-0 rounded-md border p-3">
              <FieldLegend variant="label">Pieza {i + 1}</FieldLegend>
              <div className="flex items-center gap-3">
                {item.image && (
                  <img
                    src={item.image.url}
                    alt={item.label}
                    className="size-16 object-contain"
                  />
                )}
                <ImageUploadButton
                  id={`drag-image-${item.id}`}
                  onChange={(e) => {
                    p.onReplaceItemImage(item.id, e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Quitar pieza ${i + 1}`}
                  onClick={() => p.onRemoveItem(item.id)}
                >
                  <XIcon />
                </Button>
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`drag-name-${item.id}`}>
                    Nombre de la pieza {i + 1}
                  </FieldLabel>
                  <Input
                    id={`drag-name-${item.id}`}
                    value={item.label}
                    onChange={(e) =>
                      p.onUpdateItem(item.id, { label: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`drag-equivalence-${item.id}`}>
                    Piezas equivalentes {i + 1}
                  </FieldLabel>
                  <Input
                    id={`drag-equivalence-${item.id}`}
                    value={item.equivalenceKey ?? ""}
                    maxLength={100}
                    placeholder="Sin grupo explícito"
                    onChange={(e) =>
                      p.onUpdateItem(item.id, {
                        equivalenceKey: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`drag-width-${item.id}`}>
                    Ancho de la pieza {i + 1}: {item.widthPercent}%
                  </FieldLabel>
                  <Slider
                    id={`drag-width-${item.id}`}
                    value={[item.widthPercent]}
                    min={1}
                    max={100}
                    step={0.5}
                    onValueChange={([widthPercent]) =>
                      p.onUpdateItem(item.id, { widthPercent })
                    }
                  />
                </Field>
                {mode === "solutions" && (
                  <Field data-invalid={!targetIds.has(placements[item.id])}>
                    <FieldLabel htmlFor={`drag-placement-${item.id}`}>
                      Destino de la pieza {i + 1}
                    </FieldLabel>
                    <NativeSelect
                      id={`drag-placement-${item.id}`}
                      aria-invalid={!targetIds.has(placements[item.id])}
                      value={
                        targetIds.has(placements[item.id])
                          ? placements[item.id]
                          : ""
                      }
                      onChange={(e) => assign(item.id, e.target.value)}
                    >
                      <NativeSelectOption value="">
                        Sin colocar
                      </NativeSelectOption>
                      {targets.map((t, n) => (
                        <NativeSelectOption key={t.id} value={t.id}>
                          Destino {n + 1}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              </FieldGroup>
            </FieldSet>
          ))}
        </div>
      </FieldSet>
    </FieldGroup>
  );
}

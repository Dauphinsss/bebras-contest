"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ImagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT,
  type StoredTaskDragDropItem,
  type StoredTaskDragDropTarget,
} from "@/lib/task-schema";
import { cn } from "@/lib/utils";

type DragDropEditorProps = {
  backgroundUrl: string | null;
  items: StoredTaskDragDropItem[];
  targets: StoredTaskDragDropTarget[];
  onUploadBackground: (files: FileList | null) => void;
  onReplaceItemImage: (itemId: string, files: FileList | null) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (
    itemId: string,
    patch: Partial<Pick<StoredTaskDragDropItem, "label" | "widthPercent">>,
  ) => void;
  onUpdateTarget: (
    targetId: string,
    patch: Partial<Pick<StoredTaskDragDropTarget, "x" | "y" | "snapRadius">>,
  ) => void;
};

type StageSize = {
  width: number;
  height: number;
};

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function DragDropEditor({
  backgroundUrl,
  items,
  targets,
  onUploadBackground,
  onReplaceItemImage,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onUpdateTarget,
}: DragDropEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    targetId: string;
  } | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const updateStageSize = () => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [backgroundUrl]);

  const activeItem =
    items.find((item) => item.id === activeItemId) ?? items[0] ?? null;

  const updateTargetFromPointer = (
    targetId: string,
    clientX: number,
    clientY: number,
  ) => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    const width = stage.clientWidth;
    const height = stage.clientHeight;

    if (width === 0 || height === 0) {
      return;
    }

    onUpdateTarget(targetId, {
      x: roundCoordinate(
        Math.max(
          0,
          Math.min(
            100,
            ((clientX - rect.left - stage.clientLeft) / width) * 100,
          ),
        ),
      ),
      y: roundCoordinate(
        Math.max(
          0,
          Math.min(
            100,
            ((clientY - rect.top - stage.clientTop) / height) * 100,
          ),
        ),
      ),
    });
  };

  const handleMarkerPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
    targetId: string,
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId, targetId };
    setActiveItemId(itemId);
  };

  const handleMarkerPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    updateTargetFromPointer(dragState.targetId, event.clientX, event.clientY);
  };

  const finishMarkerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <FieldGroup className="gap-4">
      <FieldSet className="gap-4">
        <FieldLegend className="mb-0" variant="label">
          Escenario de fondo
        </FieldLegend>
        <Field>
          <FieldContent className="gap-4">
            {!backgroundUrl && (
              <Input
                accept="image/*"
                type="file"
                onChange={(event) => {
                  onUploadBackground(event.target.files);
                  event.target.value = "";
                }}
              />
            )}
            {backgroundUrl && (
              <div className="flex flex-col gap-4">
                <div
                  className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-sm border bg-muted/30 [box-shadow:var(--shadow-hard)]"
                  ref={stageRef}
                  role="group"
                  aria-label="Ubicación de los destinos de encaje"
                  onClick={(event) => {
                    if (!activeItem) {
                      return;
                    }

                    updateTargetFromPointer(
                      activeItem.correctTargetId,
                      event.clientX,
                      event.clientY,
                    );
                  }}
                >
                  <img
                    alt="Escenario de fondo"
                    className="block h-auto w-full select-none"
                    draggable={false}
                    src={backgroundUrl}
                  />

                  {items.map((item, index) => {
                    const target = targets.find(
                      (candidate) => candidate.id === item.correctTargetId,
                    );

                    if (!target) {
                      return null;
                    }

                    const selected = item.id === activeItem?.id;
                    const radiusPixels =
                      ((Number.isFinite(target.snapRadius)
                        ? target.snapRadius
                        : 0) /
                        100) *
                      Math.min(stageSize.width, stageSize.height);
                    const widthPercent = Number.isFinite(item.widthPercent)
                      ? item.widthPercent
                      : DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT;
                    const itemWidthPixels =
                      (widthPercent / 100) * stageSize.width;

                    return (
                      <div
                        key={target.id}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${Number.isFinite(target.x) ? target.x : 0}%`,
                          top: `${Number.isFinite(target.y) ? target.y : 0}%`,
                        }}
                      >
                        <div
                          className={cn(
                            "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed",
                            selected
                              ? "border-primary"
                              : "border-muted-foreground/70",
                          )}
                          style={{
                            height: `${radiusPixels * 2}px`,
                            width: `${radiusPixels * 2}px`,
                          }}
                        />
                        <button
                          className={cn(
                            "pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-transparent shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
                            item.image
                              ? "block overflow-hidden rounded-sm bg-transparent p-0"
                              : "size-8 rounded-full bg-background text-xs font-semibold",
                            selected && item.image
                              ? "border-primary ring-2 ring-primary/30"
                              : selected &&
                                  "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30",
                          )}
                          style={{
                            touchAction: "none",
                            ...(item.image
                              ? { width: `${itemWidthPixels}px` }
                              : {}),
                          }}
                          type="button"
                          aria-label={`Mover destino de ${item.label || `objeto ${index + 1}`}`}
                          aria-pressed={selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveItemId(item.id);
                          }}
                          onPointerCancel={finishMarkerDrag}
                          onPointerDown={(event) =>
                            handleMarkerPointerDown(event, item.id, target.id)
                          }
                          onPointerMove={handleMarkerPointerMove}
                          onPointerUp={finishMarkerDrag}
                        >
                          {item.image ? (
                            <img
                              alt=""
                              className="block h-auto w-full select-none"
                              draggable={false}
                              src={item.image.url}
                            />
                          ) : (
                            index + 1
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-start">
                  <label>
                    <input
                      accept="image/*"
                      className="sr-only"
                      type="file"
                      onChange={(event) => {
                        onUploadBackground(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" asChild>
                      <span>
                        <ImagePlusIcon data-icon="inline-start" />
                        Reemplazar imagen
                      </span>
                    </Button>
                  </label>
                </div>
              </div>
            )}
          </FieldContent>
        </Field>
      </FieldSet>

      <FieldSet className="gap-4">
        <FieldLegend className="mb-0" variant="label">
          Objetos arrastrables
        </FieldLegend>
        <div className="flex flex-col gap-4">
          {items.map((item, index) => {
            const target = targets.find(
              (candidate) => candidate.id === item.correctTargetId,
            );
            const selected = item.id === activeItem?.id;

            return (
              <Card
                key={item.id}
                className={cn(
                  "rounded-xl border bg-card shadow-sm",
                  selected && "border-primary ring-2 ring-primary/20",
                )}
              >
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">
                        {item.label.trim() || `Objeto ${index + 1}`}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        type="button"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        onClick={() => setActiveItemId(item.id)}
                      >
                        {selected ? "Seleccionado" : "Seleccionar"}
                      </Button>
                      {items.length > 1 && (
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div
                    className={cn("grid gap-4", target && "md:grid-cols-3")}
                  >
                    <Field>
                      <FieldLabel htmlFor={`drag-item-label-${item.id}`}>
                        Nombre
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id={`drag-item-label-${item.id}`}
                          placeholder="Ej. Pieza azul"
                          value={item.label}
                          onChange={(event) =>
                            onUpdateItem(item.id, { label: event.target.value })
                          }
                        />
                      </FieldContent>
                    </Field>

                    {target && (
                      <>
                        <Field>
                          <FieldLabel htmlFor={`drag-item-width-${item.id}`}>
                            Ancho en escenario (%)
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              id={`drag-item-width-${item.id}`}
                              max="100"
                              min="0.1"
                              step="0.1"
                              type="number"
                              value={
                                Number.isFinite(item.widthPercent)
                                  ? item.widthPercent
                                  : ""
                              }
                              onChange={(event) =>
                                onUpdateItem(item.id, {
                                  widthPercent: event.target.valueAsNumber,
                                })
                              }
                            />
                            <FieldDescription>
                              Porcentaje del ancho del escenario.
                            </FieldDescription>
                          </FieldContent>
                        </Field>

                        <Field>
                          <FieldLabel htmlFor={`drag-target-radius-${target.id}`}>
                            Radio de encaje (%)
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              id={`drag-target-radius-${target.id}`}
                              max="100"
                              min="0.1"
                              step="0.1"
                              type="number"
                              value={
                                Number.isFinite(target.snapRadius)
                                  ? target.snapRadius
                                  : ""
                              }
                              onChange={(event) =>
                                onUpdateTarget(target.id, {
                                  snapRadius: event.target.valueAsNumber,
                                })
                              }
                            />
                            <FieldDescription>
                              Porcentaje del lado más corto del escenario.
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      </>
                    )}
                  </div>

                  <Field>
                    <FieldLabel>Imagen del objeto</FieldLabel>
                    <FieldContent className="gap-4">
                      {!item.image && (
                        <Input
                          accept="image/*"
                          type="file"
                          onChange={(event) => {
                            onReplaceItemImage(item.id, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      )}
                      {item.image && (
                        <div className="flex flex-col gap-4">
                          <div className="flex justify-center">
                            <img
                              alt={item.image.name}
                              className="block h-auto max-h-44 max-w-full rounded-lg"
                              src={item.image.url}
                            />
                          </div>
                          <div className="flex justify-start">
                            <label>
                              <input
                                accept="image/*"
                                className="sr-only"
                                type="file"
                                onChange={(event) => {
                                  onReplaceItemImage(
                                    item.id,
                                    event.target.files,
                                  );
                                  event.target.value = "";
                                }}
                              />
                              <Button type="button" variant="outline" asChild>
                                <span>Reemplazar imagen</span>
                              </Button>
                            </label>
                          </div>
                        </div>
                      )}
                    </FieldContent>
                  </Field>

                </CardContent>
              </Card>
            );
          })}

          <Button type="button" onClick={onAddItem}>
            <PlusIcon data-icon="inline-start" />
            Agregar objeto
          </Button>
        </div>
      </FieldSet>
    </FieldGroup>
  );
}

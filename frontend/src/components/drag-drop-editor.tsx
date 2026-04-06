"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { StoredTaskDragDropItem } from "@/lib/task-schema";

type DragDropEditorProps = {
  backgroundUrl: string | null;
  items: StoredTaskDragDropItem[];
  onUploadBackground: (files: FileList | null) => void;
  onReplaceItemImage: (itemId: string, files: FileList | null) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (
    itemId: string,
    patch: Partial<Pick<StoredTaskDragDropItem, "label" | "targetX" | "targetY" | "tolerance">>,
  ) => void;
};

export function DragDropEditor({
  backgroundUrl,
  items,
  onUploadBackground,
  onReplaceItemImage,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}: DragDropEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ itemId: string } | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeItemId) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const stage = stageRef.current;
      const dragState = dragStateRef.current;

      if (!stage || !dragState) {
        return;
      }

      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;

      onUpdateItem(dragState.itemId, {
        targetX: Math.max(0, Math.min(100, x)),
        targetY: Math.max(0, Math.min(100, y)),
      });
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      setActiveItemId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeItemId, onUpdateItem]);

  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Escenario de fondo</FieldLegend>
        <FieldDescription>
          Sube la imagen principal donde el participante soltará los objetos.
        </FieldDescription>
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
                >
                  <img
                    alt="Escenario de fondo"
                    className="block h-auto w-full"
                    src={backgroundUrl}
                  />

                  {items.map((item) => {
                    if (!item.image) {
                      return null;
                    }

                    return (
                      <button
                        key={item.id}
                        className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center gap-1 rounded-sm border bg-background/95 p-2 text-xs font-medium [box-shadow:var(--shadow-hard)]"
                        style={{
                          left: `${item.targetX}%`,
                          top: `${item.targetY}%`,
                        }}
                        type="button"
                        onMouseDown={() => {
                          dragStateRef.current = { itemId: item.id };
                          setActiveItemId(item.id);
                        }}
                      >
                        <img
                          alt={item.image.name}
                          className="block max-h-16 max-w-20 object-contain"
                          src={item.image.url}
                        />
                        <span>{item.label || "Objeto"}</span>
                      </button>
                    );
                  })}
                </div>
                <FieldDescription>
                  Arrastra cada objeto sobre la vista previa para fijar su posición correcta.
                </FieldDescription>
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

      <FieldSet>
        <FieldLegend variant="label">Objetos arrastrables</FieldLegend>
        <FieldDescription>
          Cada objeto tiene una imagen y una posición correcta dentro del escenario.
        </FieldDescription>
        <div className="flex flex-col gap-4">
          {items.map((item, index) => (
            <Card key={item.id} className="rounded-xl border bg-card shadow-sm">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Objeto {index + 1}</CardTitle>
                    <CardDescription>
                      Define su imagen y la posición correcta sobre el fondo.
                    </CardDescription>
                  </div>
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
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-6">
                <Field>
                  <FieldLabel htmlFor={`drag-item-label-${item.id}`}>Nombre</FieldLabel>
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
                                onReplaceItemImage(item.id, event.target.files);
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

                <div className="grid gap-4 md:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor={`drag-item-tolerance-${item.id}`}>
                      Margen permitido (%)
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id={`drag-item-tolerance-${item.id}`}
                        max="100"
                        min="1"
                        step="1"
                        type="number"
                        value={String(item.tolerance)}
                        onChange={(event) =>
                          onUpdateItem(item.id, {
                            tolerance: Number(event.target.value || 1),
                          })
                        }
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>Posición actual</FieldLabel>
                    <FieldContent>
                      <div className="flex h-10 items-center border bg-muted px-3 text-sm">
                        X: {Math.round(item.targetX)}% · Y: {Math.round(item.targetY)}%
                      </div>
                    </FieldContent>
                  </Field>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" onClick={onAddItem}>
            <PlusIcon data-icon="inline-start" />
            Agregar objeto
          </Button>
        </div>
      </FieldSet>
    </FieldGroup>
  );
}

"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { StoredTaskDragDropItem } from "@/lib/task-schema";

type Placement = {
  x: number;
  y: number;
};

type DragDropPlayerProps = {
  backgroundUrl: string;
  items: StoredTaskDragDropItem[];
  placements: Record<string, Placement>;
  onPlaceItem: (itemId: string, placement: Placement) => void;
  onResetItem: (itemId: string) => void;
};

export function DragDropPlayer({
  backgroundUrl,
  items,
  placements,
  onPlaceItem,
  onResetItem,
}: DragDropPlayerProps) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const placedItems = useMemo(
    () => items.filter((item) => placements[item.id]),
    [items, placements],
  );
  const trayItems = useMemo(
    () => items.filter((item) => !placements[item.id]),
    [items, placements],
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative overflow-hidden rounded-sm border bg-muted/30 [box-shadow:var(--shadow-hard)]"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!draggingItemId) {
            return;
          }

          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;

          onPlaceItem(draggingItemId, {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
          });
          setDraggingItemId(null);
        }}
      >
        <img
          alt="Escenario de la tarea"
          className="block h-auto w-full"
          src={backgroundUrl}
        />

        {placedItems.map((item) => {
          const placement = placements[item.id];

          if (!item.image || !placement) {
            return null;
          }

          return (
            <button
              key={item.id}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center gap-2 rounded-sm border bg-background/95 p-2 text-xs font-medium [box-shadow:var(--shadow-hard)]",
                draggingItemId === item.id && "opacity-70",
              )}
              draggable
              style={{
                left: `${placement.x}%`,
                top: `${placement.y}%`,
              }}
              type="button"
              onDoubleClick={() => onResetItem(item.id)}
              onDragEnd={() => setDraggingItemId(null)}
              onDragStart={() => setDraggingItemId(item.id)}
            >
              <img
                alt={item.image.name}
                className="block max-h-20 max-w-24 object-contain"
                src={item.image.url}
              />
              <span>{item.label || "Objeto"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Arrastra cada objeto al lugar que consideres correcto. Haz doble clic sobre
          un objeto colocado para devolverlo a la bandeja.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trayItems.map((item) => (
            <button
              key={item.id}
              className="flex min-h-32 cursor-grab flex-col items-center justify-center gap-3 rounded-sm border bg-background p-4 text-center [box-shadow:var(--shadow-hard)]"
              draggable
              type="button"
              onDragEnd={() => setDraggingItemId(null)}
              onDragStart={() => setDraggingItemId(item.id)}
            >
              {item.image ? (
                <img
                  alt={item.image.name}
                  className="block max-h-20 max-w-full object-contain"
                  src={item.image.url}
                />
              ) : (
                <div className="h-20 w-20 rounded-sm border border-dashed border-border" />
              )}
              <span className="text-sm font-medium">{item.label || "Objeto"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

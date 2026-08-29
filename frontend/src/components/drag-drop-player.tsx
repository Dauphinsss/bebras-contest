"use client";

import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  StoredTaskDragDropItem,
  StoredTaskDragDropTarget,
} from "@/lib/task-schema";

export type DragDropPlacements = Record<string, string>;

type PublicDragDropItem = Pick<
  StoredTaskDragDropItem,
  "id" | "label" | "image"
>;

type PointerDrag = {
  itemId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type DragPreview = {
  itemId: string;
  x: number;
  y: number;
};

type DragDropPlayerProps = {
  backgroundUrl: string;
  items: PublicDragDropItem[];
  targets: StoredTaskDragDropTarget[];
  placements: DragDropPlacements;
  disabled?: boolean;
  onChange: (placements: DragDropPlacements) => void;
};

function compareIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function findTargetAtPoint(
  clientX: number,
  clientY: number,
  stage: DOMRect,
  targets: StoredTaskDragDropTarget[],
) {
  const stageSize = Math.min(stage.width, stage.height);

  return targets
    .map((target) => {
      const radius = (target.snapRadius / 100) * stageSize;
      const x = stage.left + (target.x / 100) * stage.width;
      const y = stage.top + (target.y / 100) * stage.height;
      const distance = Math.hypot(clientX - x, clientY - y);

      return { target, radius, distance };
    })
    .filter(({ radius, distance }) => radius > 0 && distance <= radius)
    .sort(
      (left, right) =>
        left.distance / left.radius - right.distance / right.radius ||
        compareIds(left.target.id, right.target.id),
    )[0]?.target;
}

export function DragDropPlayer({
  backgroundUrl,
  items,
  targets,
  placements,
  disabled = false,
  onChange,
}: DragDropPlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );
  const placedItems = useMemo(
    () => items.filter((item) => targetById.has(placements[item.id] ?? "")),
    [items, placements, targetById],
  );
  const trayItems = useMemo(
    () => items.filter((item) => !targetById.has(placements[item.id] ?? "")),
    [items, placements, targetById],
  );
  const previewItem = dragPreview
    ? items.find((item) => item.id === dragPreview.itemId)
    : null;

  const placeItem = (itemId: string, targetId: string) => {
    if (
      disabled ||
      !targetById.has(targetId) ||
      !items.some((item) => item.id === itemId)
    ) {
      return false;
    }

    const previousTargetId = targetById.has(placements[itemId] ?? "")
      ? placements[itemId]
      : undefined;

    if (previousTargetId === targetId) {
      return false;
    }

    const occupyingItem = items.find(
      (item) => item.id !== itemId && placements[item.id] === targetId,
    );
    const next = Object.fromEntries(
      items.flatMap((item) => {
        const placedTargetId = placements[item.id];
        return targetById.has(placedTargetId ?? "")
          ? [[item.id, placedTargetId]]
          : [];
      }),
    );

    next[itemId] = targetId;

    if (occupyingItem) {
      if (previousTargetId) {
        next[occupyingItem.id] = previousTargetId;
      } else {
        delete next[occupyingItem.id];
      }
    }

    onChange(next);
    setSelectedItemId(null);
    return true;
  };

  const placeItemAtPoint = (
    itemId: string,
    clientX: number,
    clientY: number,
  ) => {
    const stage = stageRef.current?.getBoundingClientRect();

    if (!stage || disabled) {
      return false;
    }

    const target = findTargetAtPoint(clientX, clientY, stage, targets);
    return target ? placeItem(itemId, target.id) : false;
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    if (disabled) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDragRef.current = {
      itemId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    setSelectedItemId(itemId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId || disabled) {
      return;
    }

    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
    ) {
      return;
    }

    drag.moved = true;
    event.preventDefault();
    setDragPreview({ itemId: drag.itemId, x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    pointerDragRef.current = null;
    setDragPreview(null);

    if (drag.moved && !disabled) {
      placeItemAtPoint(drag.itemId, event.clientX, event.clientY);
    }
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    pointerDragRef.current = null;
    setDragPreview(null);
  };

  const itemButtonProps = (itemId: string) => ({
    "aria-pressed": selectedItemId === itemId,
    disabled,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      if (!disabled && event.detail === 0) {
        setSelectedItemId(itemId);
      }
    },
    onPointerCancel: handlePointerCancel,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      handlePointerDown(event, itemId),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  });

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stageRef}
        aria-label="Escenario de la tarea. Selecciona un objeto y toca el escenario para colocarlo."
        className={cn(
          "relative overflow-hidden rounded-sm border bg-muted/30 [box-shadow:var(--shadow-hard)]",
          selectedItemId && !disabled && "cursor-crosshair",
        )}
        onClick={(event) => {
          if (!selectedItemId || disabled) {
            return;
          }

          placeItemAtPoint(selectedItemId, event.clientX, event.clientY);
        }}
      >
        <img
          alt="Escenario de la tarea"
          className="block h-auto w-full"
          src={backgroundUrl}
        />

        {placedItems.map((item) => {
          const target = targetById.get(placements[item.id]);

          if (!target) {
            return null;
          }

          return (
            <button
              key={item.id}
              {...itemButtonProps(item.id)}
              className={cn(
                "absolute touch-none -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                selectedItemId === item.id && "ring-2 ring-primary",
                dragPreview?.itemId === item.id && "opacity-50",
              )}
              style={{ left: `${target.x}%`, top: `${target.y}%` }}
              type="button"
            >
              {item.image ? (
                <img
                  alt={item.image.name}
                  className="block max-h-20 max-w-24 object-contain"
                  draggable={false}
                  src={item.image.url}
                />
              ) : (
                <span className="block max-w-24 bg-background/90 px-2 py-1 text-sm font-medium">
                  {item.label || "Objeto"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Arrastra un objeto, o selecciónalo y toca el escenario para colocarlo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trayItems.map((item) => (
            <button
              key={item.id}
              {...itemButtonProps(item.id)}
              className={cn(
                "flex min-h-32 touch-none cursor-grab flex-col items-center justify-center gap-3 rounded-sm border bg-background p-4 text-center [box-shadow:var(--shadow-hard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70",
                selectedItemId === item.id &&
                  "border-primary ring-2 ring-primary",
                dragPreview?.itemId === item.id && "opacity-50",
              )}
              type="button"
            >
              {item.image ? (
                <img
                  alt={item.image.name}
                  className="block max-h-20 max-w-full object-contain"
                  draggable={false}
                  src={item.image.url}
                />
              ) : (
                <div className="size-20 rounded-sm border border-dashed border-border" />
              )}
              <span className="text-sm font-medium">
                {item.label || "Objeto"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {dragPreview && previewItem && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-sm border bg-background/90 p-2 opacity-80 shadow-lg"
          style={{ left: dragPreview.x, top: dragPreview.y }}
        >
          {previewItem.image ? (
            <img
              alt=""
              className="block max-h-16 max-w-20 object-contain"
              src={previewItem.image.url}
            />
          ) : (
            <span className="text-sm font-medium">
              {previewItem.label || "Objeto"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

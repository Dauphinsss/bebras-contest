"use client";

import { useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  StoredTaskDragDropItem,
  StoredTaskDragDropTarget,
} from "@/lib/task-schema";
import { DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT } from "@/lib/task-schema";

export type DragDropPlacements = Record<string, string>;

type PublicDragDropItem = Pick<
  StoredTaskDragDropItem,
  "id" | "label" | "image" | "widthPercent"
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
  width: number;
};

type KeyboardCursor = {
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

type StageBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

function getStageBounds(stage: HTMLDivElement): StageBounds {
  const rect = stage.getBoundingClientRect();
  return {
    left: rect.left + stage.clientLeft,
    top: rect.top + stage.clientTop,
    width: stage.clientWidth,
    height: stage.clientHeight,
  };
}

function compareIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function findTargetAtPoint(
  clientX: number,
  clientY: number,
  stage: StageBounds,
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
  const itemButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pointerDragRef = useRef<PointerDrag | null>(null);
  const suppressClickItemIdRef = useRef<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<KeyboardCursor | null>(
    null,
  );
  const [keyboardMode, setKeyboardMode] = useState(false);

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
  const keyboardCursorItem = keyboardCursor
    ? items.find((item) => item.id === keyboardCursor.itemId)
    : null;

  const itemWidth = (item: PublicDragDropItem) =>
    Number.isFinite(item.widthPercent) && item.widthPercent > 0
      ? item.widthPercent
      : DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT;

  const cursorForItem = (itemId: string): KeyboardCursor => {
    const target = targetById.get(placements[itemId] ?? "");
    return {
      itemId,
      x: target?.x ?? 50,
      y: target?.y ?? 50,
    };
  };

  const clearSelection = () => {
    setSelectedItemId(null);
    setKeyboardCursor(null);
    setKeyboardMode(false);
  };

  const selectItem = (itemId: string, fromKeyboard: boolean) => {
    setSelectedItemId(itemId);
    setKeyboardCursor(cursorForItem(itemId));
    setKeyboardMode(fromKeyboard);

    if (fromKeyboard) {
      window.requestAnimationFrame(() => stageRef.current?.focus());
    }
  };

  const focusItem = (itemId: string) => {
    window.requestAnimationFrame(() => {
      itemButtonRefs.current.get(itemId)?.focus();
    });
  };

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
    clearSelection();
    return true;
  };

  const swapItemLocations = (firstItemId: string, secondItemId: string) => {
    const firstTargetId = targetById.has(placements[firstItemId] ?? "")
      ? placements[firstItemId]
      : undefined;
    const secondTargetId = targetById.has(placements[secondItemId] ?? "")
      ? placements[secondItemId]
      : undefined;

    if (!firstTargetId && !secondTargetId) {
      return false;
    }

    const next = Object.fromEntries(
      items.flatMap((item) => {
        const targetId = placements[item.id];
        return targetById.has(targetId ?? "") ? [[item.id, targetId]] : [];
      }),
    );

    if (secondTargetId) {
      next[firstItemId] = secondTargetId;
    } else {
      delete next[firstItemId];
    }

    if (firstTargetId) {
      next[secondItemId] = firstTargetId;
    } else {
      delete next[secondItemId];
    }

    onChange(next);
    clearSelection();
    return true;
  };

  const placeItemAtPoint = (
    itemId: string,
    clientX: number,
    clientY: number,
  ) => {
    const stageElement = stageRef.current;

    if (!stageElement || disabled) {
      return false;
    }

    const stage = getStageBounds(stageElement);
    const target = findTargetAtPoint(clientX, clientY, stage, targets);
    return target ? placeItem(itemId, target.id) : false;
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    if (disabled || !event.isPrimary || event.button !== 0) {
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
    setSelectedItemId(drag.itemId);
    setKeyboardMode(false);
    event.preventDefault();
    const item = items.find((candidate) => candidate.id === drag.itemId);
    const stageWidth = stageRef.current?.clientWidth ?? 0;
    setDragPreview({
      itemId: drag.itemId,
      x: event.clientX,
      y: event.clientY,
      width: item
        ? (itemWidth(item) / 100) * stageWidth
        : (DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT / 100) * stageWidth,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    pointerDragRef.current = null;
    setDragPreview(null);

    if (drag.moved && !disabled) {
      suppressClickItemIdRef.current = drag.itemId;
      window.setTimeout(() => {
        if (suppressClickItemIdRef.current === drag.itemId) {
          suppressClickItemIdRef.current = null;
        }
      }, 0);
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

  const itemButtonProps = (item: PublicDragDropItem) => ({
    "aria-label": item.label || "Objeto",
    "aria-pressed": selectedItemId === item.id,
    disabled,
    ref: (node: HTMLButtonElement | null) => {
      if (node) {
        itemButtonRefs.current.set(item.id, node);
      } else {
        itemButtonRefs.current.delete(item.id);
      }
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      if (disabled) {
        return;
      }

      if (suppressClickItemIdRef.current === item.id) {
        suppressClickItemIdRef.current = null;
        return;
      }

      if (selectedItemId === item.id) {
        clearSelection();
        return;
      }

      if (selectedItemId) {
        if (swapItemLocations(selectedItemId, item.id)) {
          focusItem(item.id);
        } else {
          selectItem(item.id, event.detail === 0);
        }
      } else {
        selectItem(item.id, event.detail === 0);
      }
    },
    onPointerCancel: handlePointerCancel,
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
      handlePointerDown(event, item.id),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  });

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stageRef}
        aria-label="Escenario de la tarea. Selecciona un objeto y toca el escenario, o usa las flechas y Enter, para colocarlo."
        className={cn(
          "relative mx-auto w-full max-w-3xl overflow-hidden rounded-sm border bg-muted/30 [box-shadow:var(--shadow-hard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selectedItemId && !disabled && "cursor-crosshair",
        )}
        onFocus={() => {
          if (!selectedItemId || disabled) {
            return;
          }

          setKeyboardCursor((current) =>
            current?.itemId === selectedItemId
              ? current
              : cursorForItem(selectedItemId),
          );
          setKeyboardMode(true);
        }}
        onKeyDown={(event) => {
          if (!selectedItemId || disabled) {
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            const itemId = selectedItemId;
            clearSelection();
            focusItem(itemId);
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            const stageElement = stageRef.current;
            const cursor = keyboardCursor;
            if (!stageElement || !cursor) {
              return;
            }

            const stage = getStageBounds(stageElement);
            if (
              placeItemAtPoint(
                selectedItemId,
                stage.left + (cursor.x / 100) * stage.width,
                stage.top + (cursor.y / 100) * stage.height,
              )
            ) {
              focusItem(selectedItemId);
            }
            return;
          }

          const movement = {
            ArrowDown: [0, 1],
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
          }[event.key];

          if (!movement) {
            return;
          }

          event.preventDefault();
          const step = event.shiftKey ? 5 : 1;
          setKeyboardCursor((current) => {
            const cursor =
              current?.itemId === selectedItemId
                ? current
                : cursorForItem(selectedItemId);
            return {
              itemId: selectedItemId,
              x: Math.min(100, Math.max(0, cursor.x + movement[0] * step)),
              y: Math.min(100, Math.max(0, cursor.y + movement[1] * step)),
            };
          });
          setKeyboardMode(true);
        }}
        onClick={(event) => {
          if (!selectedItemId || disabled) {
            return;
          }

          setKeyboardMode(false);
          placeItemAtPoint(selectedItemId, event.clientX, event.clientY);
        }}
        tabIndex={selectedItemId && !disabled ? 0 : -1}
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
              {...itemButtonProps(item)}
              className={cn(
                "absolute touch-none -translate-x-1/2 -translate-y-1/2 cursor-grab overflow-hidden rounded-sm border-2 border-transparent bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                selectedItemId === item.id && "ring-2 ring-primary",
                dragPreview?.itemId === item.id && "opacity-50",
              )}
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${itemWidth(item)}%`,
              }}
              type="button"
            >
              {item.image ? (
                <img
                  alt=""
                  className="block h-auto w-full object-contain"
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

        {keyboardMode && keyboardCursor && keyboardCursorItem && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-sm border-2 border-primary bg-background/80 opacity-80 ring-2 ring-ring"
            data-keyboard-cursor
            style={{
              left: `${keyboardCursor.x}%`,
              top: `${keyboardCursor.y}%`,
              width: `${itemWidth(keyboardCursorItem)}%`,
            }}
          >
            {keyboardCursorItem.image ? (
              <img
                alt=""
                className="block h-auto w-full object-contain"
                src={keyboardCursorItem.image.url}
              />
            ) : (
              <span className="block bg-background/90 px-2 py-1 text-sm font-medium">
                {keyboardCursorItem.label || "Objeto"}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Arrastra un objeto, o selecciónalo y toca el escenario para colocarlo.
          Con teclado, usa las flechas para moverlo, Shift para avanzar más y
          Enter para intentar encajarlo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trayItems.map((item) => (
            <button
              key={item.id}
              {...itemButtonProps(item)}
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
                  alt=""
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
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-sm border-2 border-primary/60 bg-background/90 opacity-80 shadow-lg"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            width: `${dragPreview.width}px`,
          }}
        >
          {previewItem.image ? (
            <img
              alt=""
              className="block h-auto w-full object-contain"
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

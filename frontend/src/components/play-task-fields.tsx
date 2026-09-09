"use client";

import { CheckIcon } from "lucide-react";
import {
  StateGridPlayer,
  readAssignments,
} from "@/components/assignment-player";
import type { GridConfig } from "@/lib/assignment-answers";
import { ImageHotspotPlayer } from "@/components/image-hotspot-player";
import type { HotspotConfig } from "@/lib/image-hotspot";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import {
  DragDropPlayer,
  type DragDropPlacements,
} from "@/components/drag-drop-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import type { PlayTask } from "@/lib/play-api";
import {
  readMultipleChoiceLayout,
  type StoredTaskDragDropTarget,
} from "@/lib/task-schema";
import { cn } from "@/lib/utils";

function compareIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function normalizeDragDropPlacements(
  value: unknown,
  itemIds: string[],
  targets: StoredTaskDragDropTarget[],
): DragDropPlacements {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const targetIds = new Set(targets.map((target) => target.id));
  const occupiedTargetIds = new Set<string>();
  const normalized: DragDropPlacements = {};

  for (const itemId of itemIds) {
    const placement = source[itemId];

    if (typeof placement === "string") {
      if (targetIds.has(placement) && !occupiedTargetIds.has(placement)) {
        normalized[itemId] = placement;
        occupiedTargetIds.add(placement);
      }
      continue;
    }

    if (
      !placement ||
      typeof placement !== "object" ||
      Array.isArray(placement)
    ) {
      continue;
    }

    const legacy = placement as Record<string, unknown>;
    const x = legacy.x;
    const y = legacy.y;

    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      continue;
    }

    const target = targets
      .filter(
        (candidate) =>
          Math.hypot(x - candidate.x, y - candidate.y) <= candidate.snapRadius,
      )
      .sort(
        (left, right) =>
          Math.hypot(x - left.x, y - left.y) -
            Math.hypot(x - right.x, y - right.y) ||
          compareIds(left.id, right.id),
      )[0];

    if (target && !occupiedTargetIds.has(target.id)) {
      normalized[itemId] = target.id;
      occupiedTargetIds.add(target.id);
    }
  }

  return normalized;
}

export function PlayTaskFields({
  task,
  value,
  onChange,
  disabled = false,
}: {
  task: PlayTask;
  value: unknown;
  onChange: (payload: unknown) => void;
  disabled?: boolean;
}) {
  const response =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const selected: string[] = Array.isArray(response.selected)
    ? response.selected
    : [];
  const dragDropPlacements = normalizeDragDropPlacements(
    response.placements,
    task.dragDropItems.map((item) => item.id),
    task.dragDropTargets,
  );
  const horizontalChoices =
    readMultipleChoiceLayout(task.answerConfig) === "horizontal";

  return (
    <>
      {task.answerType === "state_grid" && task.answerConfig?.version === 1 && (
        <StateGridPlayer
          config={task.answerConfig as unknown as GridConfig}
          value={readAssignments(value, "cells")}
          disabled={disabled}
          onChange={(cells) => onChange({ version: 1, cells })}
        />
      )}
      {task.answerType === "image_hotspot" &&
        task.answerConfig?.version === 1 && (
          <ImageHotspotPlayer
            config={task.answerConfig as unknown as HotspotConfig}
            regionId={
              typeof response.regionId === "string" ? response.regionId : null
            }
            disabled={disabled}
            onChange={(regionId) => onChange({ version: 1, regionId })}
          />
        )}
      {task.answerType === "multiple_choice" && (
        <div
          className={cn(
            "gap-3",
            horizontalChoices
              ? "grid grid-cols-2 items-stretch lg:grid-cols-4"
              : "flex flex-col",
          )}
        >
          {task.answers.map((answer) => {
            const isSelected = selected.includes(answer.id);
            const multi = task.multipleChoiceMode === "all";
            return (
              <button
                key={answer.id}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full gap-3 rounded-md border-2 bg-card px-4 py-4 transition",
                  horizontalChoices
                    ? "h-full flex-col items-center text-center"
                    : "items-center text-left",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-hard"
                    : "border-border hover:border-primary/50",
                  disabled && "cursor-default opacity-90",
                )}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  if (multi) {
                    onChange({
                      selected: isSelected
                        ? selected.filter((id) => id !== answer.id)
                        : [...selected, answer.id],
                    });
                  } else {
                    onChange({ selected: [answer.id] });
                  }
                }}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border-2 border-foreground",
                    multi ? "rounded-none" : "rounded-full",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-background",
                  )}
                >
                  {isSelected && (
                    <CheckIcon className="size-3.5" strokeWidth={3} />
                  )}
                </span>
                <div
                  className={cn(
                    "min-w-0",
                    horizontalChoices ? "w-full" : "flex-1",
                  )}
                >
                  <TaskContentRenderer
                    blocks={answer.blocks}
                    className="gap-2 text-base"
                    minImageWidth="0px"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {task.answerType === "multiple_choice" &&
        task.multipleChoiceMode === "all" && (
          <p className="text-xs text-muted-foreground">
            Debes marcar todas las opciones correctas.
          </p>
        )}

      {task.answerType === "short_text" && (
        <Input
          aria-label="Tu respuesta"
          placeholder="Escribe tu respuesta"
          disabled={disabled}
          value={String(response.text ?? "")}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      )}

      {task.answerType === "range" && (
        <Input
          aria-label="Tu respuesta numérica"
          type="number"
          placeholder="Escribe un número"
          disabled={disabled}
          value={String(response.value ?? "")}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      )}

      {task.answerType === "drag_drop" && !task.dragDropBackground && (
        <Alert variant="destructive">
          <AlertTitle>Esta tarea no se puede responder</AlertTitle>
          <AlertDescription>
            Le falta la imagen de fondo. Avisa a tu maestro y continúa con las
            demás tareas.
          </AlertDescription>
        </Alert>
      )}

      {task.answerType === "drag_drop" && task.dragDropBackground && (
        <DragDropPlayer
          backgroundUrl={task.dragDropBackground.url}
          disabled={disabled}
          items={task.dragDropItems}
          placements={dragDropPlacements}
          targets={task.dragDropTargets}
          onChange={(placements) => onChange({ placements })}
        />
      )}
    </>
  );
}

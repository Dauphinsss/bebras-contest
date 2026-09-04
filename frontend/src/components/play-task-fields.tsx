"use client";

import { CheckIcon } from "lucide-react";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import {
  DragDropPlayer,
  type DragDropPlacements,
} from "@/components/drag-drop-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import type { PlayTask } from "@/lib/play-api";
import type { StoredTaskDragDropTarget } from "@/lib/task-schema";
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

  return (
    <>
      {task.answerType === "multiple_choice" && (
        <div className="flex flex-col gap-3">
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
                  "flex w-full items-center gap-3 rounded-md border-2 bg-card px-4 py-4 text-left transition",
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
                <div className="min-w-0 flex-1">
                  <TaskContentRenderer
                    blocks={answer.blocks}
                    className="gap-2 text-base"
                  />
                </div>
              </button>
            );
          })}
          {task.multipleChoiceMode === "all" && (
            <p className="text-xs text-muted-foreground">
              Debes marcar todas las opciones correctas.
            </p>
          )}
        </div>
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

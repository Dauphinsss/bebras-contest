"use client";

import { CheckIcon } from "lucide-react";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { DragDropPlayer } from "@/components/drag-drop-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import type { PlayTask } from "@/lib/play-api";
import type { StoredTaskDragDropItem } from "@/lib/task-schema";
import { cn } from "@/lib/utils";

export function PlayTaskFields({
  task,
  value,
  onChange,
  disabled = false,
}: {
  task: PlayTask;
  value: any;
  onChange: (payload: any) => void;
  disabled?: boolean;
}) {
  const selected: string[] = Array.isArray(value?.selected) ? value.selected : [];

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
                  {isSelected && <CheckIcon className="size-3.5" strokeWidth={3} />}
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
          placeholder="Escribe tu respuesta"
          disabled={disabled}
          value={value?.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
        />
      )}

      {task.answerType === "range" && (
        <Input
          type="number"
          placeholder="Escribe un número"
          disabled={disabled}
          value={value?.value ?? ""}
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
          items={
            task.dragDropItems.map((item) => ({
              ...item,
              targetX: 0,
              targetY: 0,
              tolerance: 0,
            })) as StoredTaskDragDropItem[]
          }
          placements={
            (value?.placements ?? {}) as Record<string, { x: number; y: number }>
          }
          onPlaceItem={(itemId, placement) =>
            onChange({
              placements: { ...(value?.placements ?? {}), [itemId]: placement },
            })
          }
          onResetItem={(itemId) => {
            const next = { ...(value?.placements ?? {}) };
            delete next[itemId];
            onChange({ placements: next });
          }}
        />
      )}
    </>
  );
}

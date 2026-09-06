"use client";

import { PlayTaskFields } from "@/components/play-task-fields";
import { TaskContentRenderer } from "@/components/task-content-renderer";
import type { PlayTask } from "@/lib/play-api";

const answerTitles: Record<string, string> = {
  multiple_choice: "Opciones de respuesta",
  short_text: "Respuesta corta",
  range: "Respuesta por rangos",
  drag_drop: "Arrastrar y soltar",
};

/** Shared document/interaction boundary for the tester and the contest player. */
export function TaskPlayContent({
  task,
  value,
  onChange,
  disabled = false,
  showHeadings = false,
}: {
  task: PlayTask;
  value: unknown;
  onChange: (payload: unknown) => void;
  disabled?: boolean;
  showHeadings?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <TaskContentRenderer blocks={task.bodyBlocks} className="gap-4" />
      {task.challengeBlocks.length > 0 && (
        <section className="flex flex-col gap-3">
          {showHeadings && (
            <h2 className="text-xl font-semibold sm:text-2xl">
              Pregunta o desafío
            </h2>
          )}
          <TaskContentRenderer
            blocks={task.challengeBlocks}
            className="gap-4"
          />
        </section>
      )}
      <section className="flex flex-col gap-4">
        {showHeadings && (
          <h2 className="text-xl font-semibold sm:text-2xl">
            {answerTitles[task.answerType] ?? "Tu respuesta"}
          </h2>
        )}
        <PlayTaskFields
          task={task}
          value={value}
          disabled={disabled}
          onChange={disabled ? () => undefined : onChange}
        />
      </section>
    </div>
  );
}

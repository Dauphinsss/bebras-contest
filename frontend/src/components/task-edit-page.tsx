"use client";

import { TaskUploadForm } from "@/components/task-upload-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTaskById } from "@/lib/task-storage";

export function TaskEditPage() {
  const taskId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null;
  const task = taskId ? getTaskById(taskId) : null;

  if (!task) {
    return (
      <Alert>
        <AlertTitle>Tarea no encontrada</AlertTitle>
        <AlertDescription>
          No se pudo cargar la tarea que intentas editar.
        </AlertDescription>
      </Alert>
    );
  }

  return <TaskUploadForm initialTask={task} />;
}

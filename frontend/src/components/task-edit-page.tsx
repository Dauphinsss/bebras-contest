"use client";

import { useEffect, useState } from "react";

import { TaskUploadForm } from "@/components/task-upload-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTask } from "@/lib/tasks-api";
import { type StoredTask } from "@/lib/task-schema";

export function TaskEditPage() {
  const taskId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null;
  const [task, setTask] = useState<StoredTask | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let active = true;

    void getTask(taskId)
      .then((loadedTask) => {
        if (!active) {
          return;
        }

        setTask(loadedTask);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setNotFound(true);
      });

    return () => {
      active = false;
    };
  }, [taskId]);

  if (!taskId || notFound) {
    return (
      <Alert>
        <AlertTitle>Tarea no encontrada</AlertTitle>
        <AlertDescription>
          No se pudo cargar la tarea que intentas editar.
        </AlertDescription>
      </Alert>
    );
  }

  if (!task) {
    return null;
  }

  return <TaskUploadForm initialTask={task} />;
}

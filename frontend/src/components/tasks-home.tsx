"use client";

import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  GraduationCapIcon,
  PlayCircleIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TaskOrigin } from "@/components/task-origin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listTasks,
  mapTaskToHomeItem,
  removeTask,
  setTaskPractice,
  type HomeTaskItem,
} from "@/lib/tasks-api";

export function TasksHome() {
  const [tasks, setTasks] = useState<HomeTaskItem[]>([]);
  const [taskToDelete, setTaskToDelete] = useState<HomeTaskItem | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void listTasks()
      .then((loadedTasks) => {
        if (!active) {
          return;
        }

        setTasks(loadedTasks.map(mapTaskToHomeItem));
      })
      .catch(() => {
        toast.error("No se pudieron cargar las tareas.");
      });

    return () => {
      active = false;
    };
  }, []);

  const togglePractice = (task: HomeTaskItem) => {
    const next = !task.isPractice;
    void setTaskPractice(task.id, next)
      .then(() => {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id ? { ...item, isPractice: next } : item,
          ),
        );
        toast.success(
          next ? "Tarea añadida a práctica." : "Tarea quitada de práctica.",
        );
      })
      .catch(() => {
        toast.error("No se pudo actualizar la práctica.");
      });
  };

  const confirmDelete = async () => {
    if (!taskToDelete || deletingTaskId) {
      return;
    }

    setDeletingTaskId(taskToDelete.id);
    try {
      await removeTask(taskToDelete.id);
      setTasks((current) =>
        current.filter((task) => task.id !== taskToDelete.id),
      );
      setTaskToDelete(null);
      toast.success("La tarea se eliminó correctamente.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la tarea.",
      );
    } finally {
      setDeletingTaskId(null);
    }
  };

  const deletingSelectedTask = deletingTaskId === taskToDelete?.id;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Tareas
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Redacta las tareas del banco, pruébalas como las verá un estudiante
            y elige cuáles quedan disponibles para practicar.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <a href="/tareas/nueva">
            <FilePlus2Icon data-icon="inline-start" />
            Registrar tarea
          </a>
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>No hay tareas registradas</AlertTitle>
          <AlertDescription>
            Crea la primera tarea para empezar a probar el flujo editorial.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="divide-y border-y">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex min-w-0 flex-col gap-4 px-3 py-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold break-words">
                    <a
                      href={`/tareas/editar?id=${task.id}`}
                      className="outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {task.title}
                    </a>
                  </h2>
                  {task.isPractice && (
                    <Badge className="gap-1">
                      <GraduationCapIcon className="size-3" />
                      Práctica
                    </Badge>
                  )}
                </div>

                <TaskOrigin country={task.country} year={task.year} />

                <div className="flex flex-wrap gap-2">
                  {task.levels.map((level) => (
                    <Badge key={level} variant="outline">
                      {level}
                    </Badge>
                  ))}
                  {task.categories.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid w-full shrink-0 gap-2 lg:w-72 lg:grid-cols-2">
                <Button
                  size="sm"
                  type="button"
                  variant={task.isPractice ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => togglePractice(task)}
                >
                  <GraduationCapIcon data-icon="inline-start" />
                  {task.isPractice ? "En práctica" : "Práctica"}
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                >
                  <a href={`/tareas/editar?id=${task.id}`}>
                    <FilePenLineIcon data-icon="inline-start" />
                    Editar
                  </a>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                >
                  <a href={`/tareas/probador?id=${task.id}`}>
                    <PlayCircleIcon data-icon="inline-start" />
                    Probar
                  </a>
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setTaskToDelete(task)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={taskToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingSelectedTask) {
            setTaskToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete
                ? `Se eliminará "${taskToDelete.title}". Esta acción no se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSelectedTask}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingSelectedTask}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deletingSelectedTask && <Spinner data-icon="inline-start" />}
              {deletingSelectedTask ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

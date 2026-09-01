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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
    <div className="flex w-full flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-sm text-muted-foreground">
                Centro de gestión editorial para tareas Bebras.
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Bebras Bolivia
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Administra borradores, revisa el estado de cada tarea y prueba
                  su experiencia final antes de publicarla.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href="/tareas/nueva">
                  <FilePlus2Icon data-icon="inline-start" />
                  Registrar tarea
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Tareas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tasks.length === 0 ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>No hay tareas registradas</AlertTitle>
              <AlertDescription>
                Crea la primera tarea para empezar a probar el flujo editorial.
              </AlertDescription>
            </Alert>
          ) : (
            tasks.map((task) => (
              <Card
                key={task.id}
                variant="soft-gradient"
                className="relative isolate gap-0 py-0 transition hover:border-primary/40 focus-within:border-primary/40"
              >
                <a
                  href={`/tareas/editar?id=${task.id}`}
                  aria-label={`Abrir edición de ${task.title}`}
                  className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <CardHeader className="gap-4 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{task.status}</Badge>
                        <Badge variant="outline">{task.ageSummary}</Badge>
                        {task.isPractice && (
                          <Badge className="gap-1">
                            <GraduationCapIcon className="size-3" />
                            Práctica
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <CardTitle className="text-xl sm:text-2xl">
                          {task.title}
                        </CardTitle>
                        <CardDescription className="text-sm leading-6 sm:text-base">
                          {task.question}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="relative z-10 grid w-full shrink-0 gap-2 lg:w-72 lg:grid-cols-2">
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
                  </div>
                </CardHeader>
                <Separator />
                <CardFooter className="flex flex-wrap gap-2 py-4">
                  {task.categories.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                </CardFooter>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

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

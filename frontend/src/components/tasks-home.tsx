"use client";

import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  FolderKanbanIcon,
  FilePenLineIcon,
  FilePlus2Icon,
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
import {
  listTasks,
  mapTaskToHomeItem,
  removeTask,
  type HomeTaskItem,
} from "@/lib/tasks-api";

export function TasksHome() {
  const [tasks, setTasks] = useState<HomeTaskItem[]>([]);

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
                  Administra borradores, revisa el estado de cada tarea y prueba su
                  experiencia final antes de publicarla.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <a href="/competencias">
                  <FolderKanbanIcon data-icon="inline-start" />
                  Competencias
                </a>
              </Button>
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
          <CardDescription>
            Estas son las tareas registradas actualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
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
                className="cursor-pointer transition hover:border-primary/40"
                onDoubleClick={() => {
                  window.location.href = `/tareas/editar?id=${task.id}`;
                }}
              >
                <CardHeader className="gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{task.status}</Badge>
                      <Badge variant="outline">{task.ageSummary}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/tareas/editar?id=${task.id}`}>
                          <FilePenLineIcon data-icon="inline-start" />
                          Editar
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/tareas/probador?id=${task.id}`}>
                          <PlayCircleIcon data-icon="inline-start" />
                          Probar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeTask(task.id)
                            .then(() => {
                              setTasks((current) =>
                                current.filter((currentTask) => currentTask.id !== task.id),
                              );
                              toast.success("La tarea se eliminó correctamente.");
                            })
                            .catch(() => {
                              toast.error("No se pudo eliminar la tarea.");
                            });
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <CardTitle className="text-xl sm:text-2xl">{task.title}</CardTitle>
                    <CardDescription className="text-sm leading-6 sm:text-base">
                      {task.question}
                    </CardDescription>
                  </div>
                </CardHeader>
                <Separator />
                <CardFooter className="flex flex-wrap gap-2 pt-5">
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
    </div>
  );
}

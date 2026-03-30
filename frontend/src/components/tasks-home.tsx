"use client";

import { useEffect, useState } from "react";
import {
  FilePenLineIcon,
  FilePlus2Icon,
  PlayCircleIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        toast.error("No se pudieron cargar las tareas desde el backend.");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Bebras Bolivia</h1>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="/tareas/nueva">
              <FilePlus2Icon data-icon="inline-start" />
              Registrar tarea
            </a>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Tareas</CardTitle>
          <CardDescription>
            Estas son las tareas cargadas actualmente en el backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="cursor-pointer rounded-2xl border border-border/70 bg-card p-4"
              onDoubleClick={() => {
                window.location.href = `/tareas/editar?id=${task.id}`;
              }}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{task.status}</Badge>
                  </div>
                  <div className="flex gap-2">
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
                            toast.success("La tarea se eliminó del backend.");
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

                <div>
                  <h2 className="font-heading text-xl font-semibold tracking-tight">
                    {task.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {task.question}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {task.categories.map((category) => (
                    <Badge key={category} variant="outline">
                      {category}
                    </Badge>
                  ))}
                  <Badge variant="outline">{task.ageSummary}</Badge>
                </div>
              </div>
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

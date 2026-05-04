"use client";

import { useEffect, useState } from "react";
import {
  AlarmClockIcon,
  CalendarRangeIcon,
  FilePlus2Icon,
  FilePenLineIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { removeContest, listContests } from "@/lib/contests-api";
import {
  formatContestTaskSummary,
  formatContestWindow,
  type StoredContest,
} from "@/lib/contest-schema";
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

export function ContestsHome() {
  const [contests, setContests] = useState<StoredContest[]>([]);

  useEffect(() => {
    let active = true;

    void listContests()
      .then((loadedContests) => {
        if (!active) {
          return;
        }

        setContests(loadedContests);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "No se pudieron cargar las competencias.");
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
                Centro de planificación de competencias.
              </div>
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Competencias
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Configura las sesiones, revisa su ventana de ejecución y asigna el paquete de tareas.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href="/competencias/nueva">
                  <FilePlus2Icon data-icon="inline-start" />
                  Nueva competencia
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Listado</CardTitle>
          <CardDescription>
            Aquí puedes revisar y editar las competencias creadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          {contests.length === 0 ? (
            <Alert>
              <AlertTitle>No hay competencias registradas</AlertTitle>
              <AlertDescription>
                Crea la primera competencia y asígnale tareas para arrancar el flujo.
              </AlertDescription>
            </Alert>
          ) : (
            contests.map((contest) => (
              <Card key={contest.id} variant="soft-gradient" className="gap-0 py-0">
                <CardHeader className="gap-4 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{contest.status}</Badge>
                        <Badge variant="outline">{contest.level}</Badge>
                        <Badge variant="outline">{contest.taskCount} tareas</Badge>
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-xl sm:text-2xl">{contest.title}</CardTitle>
                        <CardDescription>{formatContestWindow(contest.startsAt, contest.endsAt)}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <AlarmClockIcon className="size-4" />
                          {contest.durationMinutes} minutos
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <CalendarRangeIcon className="size-4" />
                          {contest.allowPairs ? "Permite parejas" : "Solo individual"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/competencias/editar?id=${contest.id}`}>
                          <FilePenLineIcon data-icon="inline-start" />
                          Editar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void removeContest(contest.id)
                            .then(() => {
                              setContests((current) =>
                                current.filter((currentContest) => currentContest.id !== contest.id),
                              );
                              toast.success("La competencia se eliminó correctamente.");
                            })
                            .catch((error) => {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "No se pudo eliminar la competencia.",
                              );
                            });
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardFooter className="flex flex-col items-start gap-3 py-5">
                  {contest.tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aún no tiene tareas asignadas.
                    </p>
                  ) : (
                    contest.tasks.map((task) => (
                      <div key={task.id} className="w-full">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="secondary">#{task.position}</Badge>
                          <span className="font-medium">{task.task.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatContestTaskSummary(task.task)}
                        </p>
                      </div>
                    ))
                  )}
                </CardFooter>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

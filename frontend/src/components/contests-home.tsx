"use client";

import { useEffect, useState } from "react";
import {
  AlarmClockIcon,
  BarChart3Icon,
  CalculatorIcon,
  CalendarRangeIcon,
  FilePlus2Icon,
  FilePenLineIcon,
  PauseIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  consolidateContest,
  listContests,
  removeContest,
  resumeContest,
  suspendContest,
} from "@/lib/contests-api";
import {
  CONTEST_STATE_LABELS,
  formatContestWindow,
  type StoredContest,
} from "@/lib/contest-schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type ConfirmAction = "suspend" | "resume" | "consolidate" | "delete";

type Confirmation = {
  action: ConfirmAction;
  contest: StoredContest;
};

const CONFIRMATION_COPY: Record<
  ConfirmAction,
  {
    title: string;
    description: (contest: StoredContest) => string;
    confirm: string;
  }
> = {
  suspend: {
    title: "¿Suspender este desafío?",
    description: () =>
      "Nadie podrá empezar ni responder mientras esté suspendida, y el tiempo de quienes ya están rindiendo queda en pausa.",
    confirm: "Suspender",
  },
  resume: {
    title: "¿Reanudar este desafío?",
    description: () =>
      "Se habilita de nuevo y a cada equipo que estaba rindiendo se le devuelve el tiempo que estuvo en pausa.",
    confirm: "Reanudar",
  },
  consolidate: {
    title: "¿Consolidar este desafío?",
    description: () =>
      "Se cerrarán los intentos que continúen abiertos y se calcularán los resultados definitivos.",
    confirm: "Consolidar",
  },
  delete: {
    title: "¿Eliminar este desafío?",
    description: (contest) =>
      `Se eliminará "${contest.title}" y sus grupos, equipos y resultados. Esta acción no se puede deshacer.`,
    confirm: "Eliminar",
  },
};

export function ContestsHome() {
  const [contests, setContests] = useState<StoredContest[]>([]);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const replaceContest = (updated: StoredContest) => {
    setContests((current) =>
      current.map((contest) => (contest.id === updated.id ? updated : contest)),
    );
  };

  const runAction = async (
    contest: StoredContest,
    action: () => Promise<StoredContest>,
    successMessage: (updated: StoredContest) => string,
  ) => {
    setBusyId(contest.id);

    try {
      const updated = await action();
      replaceContest(updated);
      toast.success(successMessage(updated));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspend = (contest: StoredContest) =>
    runAction(
      contest,
      () => suspendContest(contest.id),
      () => "Desafío suspendido. El tiempo quedó en pausa.",
    );

  const handleResume = (contest: StoredContest) =>
    runAction(
      contest,
      () => resumeContest(contest.id),
      (updated) => {
        const resumed = (
          updated as StoredContest & { resumedAttempts?: number }
        ).resumedAttempts;
        return resumed
          ? `Desafío reanudado. Se devolvió el tiempo a ${resumed} intento(s).`
          : "Desafío reanudado.";
      },
    );

  const handleConsolidate = (contest: StoredContest) =>
    runAction(
      contest,
      () => consolidateContest(contest.id),
      (updated) => {
        const closed = (updated as StoredContest & { closedAttempts?: number })
          .closedAttempts;
        return closed
          ? `Desafío consolidado. Se cerraron ${closed} intento(s) vencido(s).`
          : "Desafío consolidado. Puntajes y ranking al día.";
      },
    );

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
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los desafíos.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const handleDelete = (contest: StoredContest) => {
    setBusyId(contest.id);
    void removeContest(contest.id)
      .then(() => {
        setContests((current) =>
          current.filter((currentContest) => currentContest.id !== contest.id),
        );
        toast.success("El desafío se eliminó correctamente.");
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo eliminar el desafío.",
        );
      })
      .finally(() => {
        setBusyId(null);
      });
  };

  const confirmAction = () => {
    if (!confirming) {
      return;
    }

    const { action, contest } = confirming;
    setConfirming(null);

    if (action === "suspend") {
      void handleSuspend(contest);
    } else if (action === "resume") {
      void handleResume(contest);
    } else if (action === "consolidate") {
      void handleConsolidate(contest);
    } else {
      handleDelete(contest);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Desafíos
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Programa las fases de cada desafío, elige sus tareas y sigue su
            estado.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <a href="/competencias/nueva">
            <FilePlus2Icon data-icon="inline-start" />
            Nuevo desafío
          </a>
        </Button>
      </div>

      {contests.length === 0 ? (
        <Alert>
          <AlertTitle>No hay desafíos registrados</AlertTitle>
          <AlertDescription>
            Crea el primer desafío y asígnale tareas para arrancar el flujo.
          </AlertDescription>
        </Alert>
      ) : (
        <ul className="divide-y border-y">
          {contests.map((contest) => (
            <li
              key={contest.id}
              className="flex min-w-0 flex-col gap-4 py-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold break-words">
                    {contest.title}
                  </h2>
                  <Badge variant="secondary">
                    {CONTEST_STATE_LABELS[contest.state]}
                  </Badge>
                  {contest.category && (
                    <Badge variant="outline">{contest.category}</Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <CalendarRangeIcon className="size-4 shrink-0" />
                    Inscripción:{" "}
                    {contest.registrationStartsAt && contest.registrationEndsAt
                      ? formatContestWindow(
                          contest.registrationStartsAt,
                          contest.registrationEndsAt,
                        )
                      : "sin definir"}
                  </span>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <PlayIcon className="size-4 shrink-0" />
                    Rendición:{" "}
                    {formatContestWindow(contest.startsAt, contest.endsAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <AlarmClockIcon className="size-4" />
                    {contest.durationMinutes} min por equipo
                  </span>
                  <span>{contest.taskCount} tarea(s)</span>
                  <span>
                    {contest.allowPairs ? "Permite parejas" : "Solo individual"}
                  </span>
                </div>
              </div>

              <div className="grid w-full shrink-0 gap-2 lg:w-72 lg:grid-cols-2">
                {[
                  "abierta",
                  "suspendida",
                  "cerrada",
                  "consolidada",
                  "publicada",
                ].includes(contest.state) && (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <a href={`/competencias/resultados?id=${contest.id}`}>
                      <BarChart3Icon data-icon="inline-start" />
                      Resultados
                    </a>
                  </Button>
                )}
                {contest.state === "abierta" && (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={busyId === contest.id}
                    className="w-full justify-start"
                    onClick={() =>
                      setConfirming({ action: "suspend", contest })
                    }
                  >
                    <PauseIcon data-icon="inline-start" />
                    Suspender
                  </Button>
                )}
                {contest.state === "suspendida" && (
                  <Button
                    size="sm"
                    type="button"
                    disabled={busyId === contest.id}
                    className="w-full justify-start"
                    onClick={() => setConfirming({ action: "resume", contest })}
                  >
                    <PlayIcon data-icon="inline-start" />
                    Reanudar
                  </Button>
                )}
                {contest.state === "cerrada" && (
                  <Button
                    size="sm"
                    type="button"
                    disabled={busyId === contest.id}
                    className="w-full justify-start"
                    onClick={() =>
                      setConfirming({ action: "consolidate", contest })
                    }
                  >
                    <CalculatorIcon data-icon="inline-start" />
                    Consolidar
                  </Button>
                )}
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                >
                  <a href={`/competencias/editar?id=${contest.id}`}>
                    <FilePenLineIcon data-icon="inline-start" />
                    Editar
                  </a>
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  disabled={busyId === contest.id}
                  className="w-full justify-start"
                  onClick={() => setConfirming({ action: "delete", contest })}
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
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming ? CONFIRMATION_COPY[confirming.action].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming
                ? CONFIRMATION_COPY[confirming.action].description(
                    confirming.contest,
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAction}>
              {confirming ? CONFIRMATION_COPY[confirming.action].confirm : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

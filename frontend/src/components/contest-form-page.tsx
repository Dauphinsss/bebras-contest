"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  FileStackIcon,
  FolderTreeIcon,
  LoaderCircleIcon,
  SaveIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createContest,
  getContest,
  updateContest,
} from "@/lib/contests-api";
import {
  toDatetimeLocalValue,
  type ContestDraftInput,
} from "@/lib/contest-schema";
import { listTasks } from "@/lib/tasks-api";
import { buildAgeSummary, type StoredTask } from "@/lib/task-schema";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ContestFormPageProps = {
  contestId?: string | null;
};

type FormState = ContestDraftInput;

function createInitialState(): FormState {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 90 * 60 * 1000);

  return {
    title: "",
    level: "",
    durationMinutes: 90,
    startsAt: toDatetimeLocalValue(start.toISOString()),
    endsAt: toDatetimeLocalValue(end.toISOString()),
    allowPairs: false,
    showFeedback: false,
    isVisible: false,
    status: "draft",
    taskIds: [],
  };
}

function createStateFromContest(contest: Awaited<ReturnType<typeof getContest>>): FormState {
  return {
    title: contest.title,
    level: contest.level,
    durationMinutes: contest.durationMinutes,
    startsAt: toDatetimeLocalValue(contest.startsAt),
    endsAt: toDatetimeLocalValue(contest.endsAt),
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    isVisible: contest.isVisible,
    status: contest.status,
    taskIds: contest.tasks
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((task) => task.task.id),
  };
}

function formatTaskMeta(task: StoredTask) {
  return `${buildAgeSummary(task.difficulties)} · ${
    task.categories.join(", ") || "Sin categoría"
  }`;
}

export function ContestFormPage({ contestId = null }: ContestFormPageProps) {
  const resolvedContestId =
    contestId ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null);
  const [form, setForm] = useState<FormState>(createInitialState);
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([
      listTasks(),
      resolvedContestId ? getContest(resolvedContestId) : Promise.resolve(null),
    ])
      .then(([loadedTasks, loadedContest]) => {
        if (!active) {
          return;
        }

        setTasks(loadedTasks);

        if (loadedContest) {
          setForm(createStateFromContest(loadedContest));
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (resolvedContestId) {
          setNotFound(true);
        } else {
          toast.error(error instanceof Error ? error.message : "No se pudieron cargar los datos.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedContestId]);

  const selectedTasks = useMemo(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    return form.taskIds
      .map((taskId) => tasksById.get(taskId))
      .filter((task): task is StoredTask => task !== undefined);
  }, [form.taskIds, tasks]);

  const availableTasks = useMemo(
    () => tasks.filter((task) => !form.taskIds.includes(task.id)),
    [form.taskIds, tasks],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!form.title.trim()) {
      errors.push("El nombre de la competencia es obligatorio.");
    }

    if (!form.level.trim()) {
      errors.push("El nivel de la competencia es obligatorio.");
    }

    if (!Number.isFinite(form.durationMinutes) || form.durationMinutes <= 0) {
      errors.push("La duración debe ser mayor que cero.");
    }

    if (!form.startsAt || !form.endsAt) {
      errors.push("Debes definir fecha de inicio y fin.");
    } else if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      errors.push("La fecha de fin debe ser posterior a la de inicio.");
    }

    if (form.taskIds.length === 0) {
      errors.push("Debes seleccionar al menos una tarea.");
    }

    return errors;
  }, [form]);

  const toggleTask = (taskId: string) => {
    setForm((current) => ({
      ...current,
      taskIds: current.taskIds.includes(taskId)
        ? current.taskIds.filter((currentTaskId) => currentTaskId !== taskId)
        : [...current.taskIds, taskId],
    }));
  };

  const moveTask = (taskId: string, direction: "up" | "down") => {
    setForm((current) => {
      const index = current.taskIds.indexOf(taskId);

      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= current.taskIds.length) {
        return current;
      }

      const nextTaskIds = [...current.taskIds];
      [nextTaskIds[index], nextTaskIds[targetIndex]] = [
        nextTaskIds[targetIndex],
        nextTaskIds[index],
      ];

      return {
        ...current,
        taskIds: nextTaskIds,
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setSaving(true);

    try {
      const payload: ContestDraftInput = {
        ...form,
        title: form.title.trim(),
        level: form.level.trim(),
      };

      const savedContest = resolvedContestId
        ? await updateContest(resolvedContestId, payload)
        : await createContest(payload);

      if (!resolvedContestId) {
        window.location.href = `/competencias/editar?id=${savedContest.id}`;
        return;
      }

      setForm(createStateFromContest(savedContest));
      toast.success("La competencia se guardó correctamente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la competencia.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <Alert>
        <AlertTitle>Competencia no encontrada</AlertTitle>
        <AlertDescription>
          No se pudo cargar la competencia que intentas editar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <FolderTreeIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Datos generales</CardTitle>
              <CardDescription>
                Define el marco básico de la competencia antes de asignar tareas.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="contest-title">Nombre</Label>
            <Input
              id="contest-title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ej. Bebras Secundaria 2026"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contest-level">Nivel</Label>
            <Input
              id="contest-level"
              value={form.level}
              onChange={(event) =>
                setForm((current) => ({ ...current, level: event.target.value }))
              }
              placeholder="Ej. 12-14"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contest-duration">Duración en minutos</Label>
            <Input
              id="contest-duration"
              min={1}
              type="number"
              value={String(form.durationMinutes)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  durationMinutes: Number(event.target.value || 0),
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contest-status">Estado</Label>
            <Input
              id="contest-status"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value }))
              }
              placeholder="draft"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contest-starts-at">Inicio</Label>
            <Input
              id="contest-starts-at"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startsAt: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contest-ends-at">Fin</Label>
            <Input
              id="contest-ends-at"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-6 border-t pt-5">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={form.allowPairs}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, allowPairs: checked === true }))
              }
            />
            Permitir parejas
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={form.showFeedback}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, showFeedback: checked === true }))
              }
            />
            Mostrar feedback
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={form.isVisible}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, isVisible: checked === true }))
              }
            />
            Visible al público
          </label>
        </CardFooter>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-3">
              <FileStackIcon className="text-muted-foreground" />
              <div>
                <CardTitle>Tareas disponibles</CardTitle>
                <CardDescription>
                  Selecciona las tareas que formarán parte de la competencia.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-6">
            {tasks.length === 0 ? (
              <Alert>
                <AlertTitle>No hay tareas registradas</AlertTitle>
                <AlertDescription>
                  Crea tareas primero para poder armar una competencia.
                </AlertDescription>
              </Alert>
            ) : (
              availableTasks.concat(selectedTasks).map((task) => {
                const selected = form.taskIds.includes(task.id);

                return (
                  <Card
                    key={task.id}
                    variant={selected ? "soft-gradient" : "default"}
                    className="gap-3 py-4"
                  >
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{task.title}</CardTitle>
                          <CardDescription>{formatTaskMeta(task)}</CardDescription>
                        </div>
                        <Button
                          type="button"
                          variant={selected ? "default" : "outline"}
                          onClick={() => toggleTask(task.id)}
                        >
                          {selected ? (
                            <>
                              <CheckCircle2Icon data-icon="inline-start" />
                              Seleccionada
                            </>
                          ) : (
                            "Agregar"
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Orden de la competencia</CardTitle>
            <CardDescription>
              Revisa el orden final de las tareas seleccionadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-6">
            {selectedTasks.length === 0 ? (
              <Alert>
                <AlertTitle>No hay tareas elegidas</AlertTitle>
                <AlertDescription>
                  Selecciona al menos una tarea desde la lista de la izquierda.
                </AlertDescription>
              </Alert>
            ) : (
              selectedTasks.map((task, index) => (
                <Card key={task.id} variant="soft-gradient" className="gap-3 py-4">
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">#{index + 1}</Badge>
                          <Badge variant="outline">{buildAgeSummary(task.difficulties)}</Badge>
                        </div>
                        <CardTitle className="text-lg">{task.title}</CardTitle>
                        <CardDescription>{task.categories.join(", ") || "Sin categoría"}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon-sm"
                          type="button"
                          variant="outline"
                          disabled={index === 0}
                          onClick={() => moveTask(task.id, "up")}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          size="icon-sm"
                          type="button"
                          variant="outline"
                          disabled={index === selectedTasks.length - 1}
                          onClick={() => moveTask(task.id, "down")}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleTask(task.id)}
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Faltan datos</AlertTitle>
          <AlertDescription>{validationErrors[0]}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium">
                {form.taskIds.length} tarea(s) seleccionada(s)
              </div>
              <div className="text-sm text-muted-foreground">
                Guarda la competencia para dejar persistido el orden actual.
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              <SaveIcon data-icon="inline-start" />
              {saving
                ? "Guardando..."
                : resolvedContestId
                  ? "Guardar competencia"
                  : "Crear competencia"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

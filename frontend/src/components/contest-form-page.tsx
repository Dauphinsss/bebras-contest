"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownIcon,
  CalendarIcon,
  CheckCircle2Icon,
  Clock8Icon,
  FileStackIcon,
  ArrowUpIcon,
  LoaderCircleIcon,
  SaveIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

import {
  createContest,
  getContest,
  publishContest,
  updateContest,
} from "@/lib/contests-api";
import {
  CONTEST_CATEGORIES,
  type ContestTaskConfigInput,
  toDatetimeLocalValue,
  type ContestDraftInput,
} from "@/lib/contest-schema";
import { listTasks } from "@/lib/tasks-api";
import { buildAgeSummary, type StoredTask } from "@/lib/task-schema";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ContestFormPageProps = {
  contestId?: string | null;
};

type FormState = ContestDraftInput;

function createDefaultTaskConfig(taskId: string): ContestTaskConfigInput {
  return {
    taskId,
    minScore: 0,
    noAnswerScore: 0,
    maxScore: 10,
  };
}

function createInitialState(): FormState {
  return {
    title: "",
    category: "",
    durationMinutes: 45,
    startsAt: "",
    endsAt: "",
    questionDisplayMode: "one_by_one",
    allowPairs: false,
    showFeedback: false,
    showSolutions: false,
    showTotalScore: false,
    tasks: [],
  };
}

function createStateFromContest(contest: Awaited<ReturnType<typeof getContest>>): FormState {
  return {
    title: contest.title,
    category: contest.category,
    durationMinutes: contest.durationMinutes,
    startsAt: toDatetimeLocalValue(contest.startsAt),
    endsAt: toDatetimeLocalValue(contest.endsAt),
    questionDisplayMode: contest.questionDisplayMode,
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    tasks: contest.tasks
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((task) => ({
        taskId: task.taskId,
        minScore: task.minScore,
        noAnswerScore: task.noAnswerScore,
        maxScore: task.maxScore,
      })),
  };
}

function formatTaskMeta(task: StoredTask) {
  return `${buildAgeSummary(task.difficulties)} · ${
    task.categories.join(", ") || "Sin categoría"
  }`;
}

function parseDateTimeLocal(value: string) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function toTimeValue(value: string) {
  const date = parseDateTimeLocal(value);

  if (!date) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function updateDatePart(
  currentValue: string,
  nextDate: Date | undefined,
  fallbackHour: number,
) {
  if (!nextDate) {
    return currentValue;
  }

  const currentDate = parseDateTimeLocal(currentValue);
  const nextValue = new Date(nextDate);

  if (currentDate) {
    nextValue.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  } else {
    nextValue.setHours(fallbackHour, 0, 0, 0);
  }

  return toDatetimeLocalValue(nextValue.toISOString());
}

function updateDateRangeParts(
  currentStartsAt: string,
  currentEndsAt: string,
  nextRange: DateRange | undefined,
) {
  return {
    startsAt: updateDatePart(currentStartsAt, nextRange?.from, 8),
    endsAt: updateDatePart(currentEndsAt, nextRange?.to, 18),
  };
}

function updateTimePart(currentValue: string, nextTime: string) {
  const currentDate = parseDateTimeLocal(currentValue) ?? new Date();
  const [hours, minutes] = nextTime.split(":").map((part) => Number(part));

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return currentValue;
  }

  const nextValue = new Date(currentDate);
  nextValue.setHours(hours, minutes, 0, 0);
  return toDatetimeLocalValue(nextValue.toISOString());
}

function TimeInput({
  label,
  value,
  invalid = false,
  onChange,
}: {
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const currentTime = toTimeValue(value);
  const [draftValue, setDraftValue] = useState(currentTime);

  useEffect(() => {
    setDraftValue(currentTime);
  }, [currentTime]);

  return (
    <div className="relative sm:w-40">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 text-muted-foreground peer-disabled:opacity-50">
        <Clock8Icon className="size-4" />
        <span className="sr-only">{label} hora</span>
      </div>
      <Input
        aria-invalid={invalid}
        aria-label={`${label} hora`}
        className="peer appearance-none bg-background pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        type="time"
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);

          if (nextValue) {
            onChange(updateTimePart(value, nextValue));
          }
        }}
      />
    </div>
  );
}

function DateRangeField({
  startsAt,
  endsAt,
  invalid = false,
  onDateChange,
  onStartsAtChange,
  onEndsAtChange,
}: {
  startsAt: string;
  endsAt: string;
  invalid?: boolean;
  onDateChange: (nextStartsAt: string, nextEndsAt: string) => void;
  onStartsAtChange: (nextValue: string) => void;
  onEndsAtChange: (nextValue: string) => void;
}) {
  const startDate = parseDateTimeLocal(startsAt);
  const endDate = parseDateTimeLocal(endsAt);
  const selectedRange: DateRange | undefined = startDate
    ? { from: startDate, to: endDate ?? undefined }
    : undefined;
  const rangeLabel =
    startDate && endDate
      ? `${format(startDate, "d 'de' MMMM 'de' yyyy", { locale: es })} - ${format(
          endDate,
          "d 'de' MMMM 'de' yyyy",
          { locale: es },
        )}`
      : "Selecciona rango";

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="contest-date-range">
        Ventana de disponibilidad <span className="text-destructive">*</span>
      </FieldLabel>
      <FieldContent>
        <div className="flex flex-col gap-3 lg:flex-row">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="contest-date-range"
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal lg:flex-1",
                  (!startDate || !endDate) && "text-muted-foreground",
                )}
                aria-invalid={invalid}
              >
                <CalendarIcon data-icon="inline-start" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              data-calendar-popover
              className="w-auto rounded-sm p-0"
              align="start"
            >
              <Calendar
                initialFocus
                mode="range"
                selected={selectedRange}
                onSelect={(nextRange) => {
                  const nextValues = updateDateRangeParts(startsAt, endsAt, nextRange);
                  onDateChange(nextValues.startsAt, nextValues.endsAt);
                }}
              />
            </PopoverContent>
          </Popover>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <FieldLabel>Hora de inicio</FieldLabel>
              <TimeInput
                invalid={invalid}
                label="Hora de inicio"
                value={startsAt}
                onChange={onStartsAtChange}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Hora de fin</FieldLabel>
              <TimeInput
                invalid={invalid}
                label="Hora de fin"
                value={endsAt}
                onChange={onEndsAtChange}
              />
            </div>
          </div>
        </div>
        <FieldDescription>
          La competencia se abre y cierra automáticamente dentro de esta ventana.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
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
  const [publishing, setPublishing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

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
    return form.tasks
      .map((taskConfig) => tasksById.get(taskConfig.taskId))
      .filter((task): task is StoredTask => task !== undefined);
  }, [form.tasks, tasks]);

  const availableTasks = useMemo(
    () => tasks.filter((task) => !form.tasks.some((taskConfig) => taskConfig.taskId === task.id)),
    [form.tasks, tasks],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!form.title.trim()) {
      errors.push("El nombre de la competencia es obligatorio.");
    }

    if (!Number.isFinite(form.durationMinutes) || form.durationMinutes <= 0) {
      errors.push("La duración debe ser mayor que cero.");
    }

    if (!form.startsAt || !form.endsAt) {
      errors.push("Debes definir fecha de inicio y fin.");
    } else if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      errors.push("La fecha de fin debe ser posterior a la de inicio.");
    }

    if (form.tasks.length === 0) {
      errors.push("Debes seleccionar al menos una tarea.");
    }

    if (form.tasks.some((task) => task.maxScore < task.minScore)) {
      errors.push("El puntaje máximo no puede ser menor que el puntaje mínimo.");
    }

    return errors;
  }, [form]);

  const hasTitleError = submitAttempted && !form.title.trim();
  const hasDurationError =
    submitAttempted &&
    (!Number.isFinite(form.durationMinutes) || form.durationMinutes <= 0);
  const hasDateError =
    submitAttempted &&
    (!form.startsAt ||
      !form.endsAt ||
      new Date(form.endsAt) <= new Date(form.startsAt));

  const handlePublish = async () => {
    if (!resolvedContestId) {
      toast.error("Primero guarda la competencia antes de publicarla.");
      return;
    }

    setSubmitAttempted(true);

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setPublishing(true);

    try {
      const savedContest = await updateContest(resolvedContestId, {
        ...form,
        title: form.title.trim(),
      });
      const publishedContest = await publishContest(savedContest.id);

      setForm(createStateFromContest(publishedContest));
      toast.success("La competencia quedó publicada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar la competencia.");
    } finally {
      setPublishing(false);
    }
  };

  const toggleTask = (taskId: string) => {
    setForm((current) => ({
      ...current,
      tasks: current.tasks.some((task) => task.taskId === taskId)
        ? current.tasks.filter((task) => task.taskId !== taskId)
        : [...current.tasks, createDefaultTaskConfig(taskId)],
    }));
  };

  const moveTask = (taskId: string, direction: "up" | "down") => {
    setForm((current) => {
      const index = current.tasks.findIndex((task) => task.taskId === taskId);

      if (index === -1) {
        return current;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= current.tasks.length) {
        return current;
      }

      const nextTasks = [...current.tasks];
      [nextTasks[index], nextTasks[targetIndex]] = [
        nextTasks[targetIndex],
        nextTasks[index],
      ];

      return {
        ...current,
        tasks: nextTasks,
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setSaving(true);

    try {
      const payload: ContestDraftInput = {
        ...form,
        title: form.title.trim(),
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
          <CardTitle>Datos generales</CardTitle>
          <CardDescription>
            Define el nombre, la duración y la ventana de la competencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={hasTitleError || undefined}>
                <FieldLabel htmlFor="contest-title">
                  Nombre <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="contest-title"
                    aria-invalid={hasTitleError}
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Ej. Bebras Secundaria 2026"
                  />
                </FieldContent>
              </Field>
              <Field data-invalid={hasDurationError || undefined}>
                <FieldLabel htmlFor="contest-duration">
                  Duración por equipo (minutos) <span className="text-destructive">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="contest-duration"
                    aria-invalid={hasDurationError}
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
                  <FieldDescription>
                    Tiempo que tiene cada equipo desde que entra.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
            <FieldGroup>
              <DateRangeField
                startsAt={form.startsAt}
                endsAt={form.endsAt}
                invalid={hasDateError}
                onDateChange={(nextStartsAt, nextEndsAt) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: nextStartsAt,
                    endsAt: nextEndsAt,
                  }))
                }
                onStartsAtChange={(nextValue) =>
                  setForm((current) => ({ ...current, startsAt: nextValue }))
                }
                onEndsAtChange={(nextValue) =>
                  setForm((current) => ({ ...current, endsAt: nextValue }))
                }
              />
            </FieldGroup>
            {hasDateError && (
              <FieldError
                errors={[
                  { message: "La fecha de fin debe ser posterior a la de inicio." },
                ]}
              />
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
              Opciones avanzadas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="contest-category">Categoría</FieldLabel>
                <FieldContent>
                  <Select
                    value={form.category || "none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        category: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="contest-category" className="w-full">
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin categoría</SelectItem>
                      {CONTEST_CATEGORIES.map((category) => (
                        <SelectItem key={category.name} value={category.name}>
                          {category.name} ({category.age})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="contest-display-mode">
                  Forma de mostrar las preguntas
                </FieldLabel>
                <FieldContent>
                  <Select
                    value={form.questionDisplayMode}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        questionDisplayMode:
                          value === "all" ? "all" : "one_by_one",
                      }))
                    }
                  >
                    <SelectTrigger id="contest-display-mode" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_by_one">
                        Una por una (con navegación)
                      </SelectItem>
                      <SelectItem value="all">
                        Todas juntas en una lista
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Una por una muestra una pregunta a la vez; el estudiante
                    navega entre ellas.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="contest-allow-pairs"
                  checked={form.allowPairs}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, allowPairs: checked === true }))
                  }
                />
                <FieldLabel htmlFor="contest-allow-pairs" className="font-normal">
                  Permitir parejas
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="contest-show-total-score"
                  checked={form.showTotalScore}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, showTotalScore: checked === true }))
                  }
                />
                <FieldLabel htmlFor="contest-show-total-score" className="font-normal">
                  Mostrar puntaje total al terminar
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="contest-show-feedback"
                  checked={form.showFeedback}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, showFeedback: checked === true }))
                  }
                />
                <FieldLabel htmlFor="contest-show-feedback" className="font-normal">
                  Mostrar feedback al terminar
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="contest-show-solutions"
                  checked={form.showSolutions}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, showSolutions: checked === true }))
                  }
                />
                <FieldLabel htmlFor="contest-show-solutions" className="font-normal">
                  Mostrar soluciones al terminar
                </FieldLabel>
              </Field>
            </FieldGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
                const selected = form.tasks.some((taskConfig) => taskConfig.taskId === task.id);

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

      {submitAttempted && validationErrors.length > 0 && (
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
                {form.tasks.length} tarea(s) seleccionada(s)
              </div>
              <div className="text-sm text-muted-foreground">
                Guarda la competencia para dejar persistido el orden actual.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                <SaveIcon data-icon="inline-start" />
                {saving
                  ? "Guardando..."
                  : resolvedContestId
                    ? "Guardar competencia"
                    : "Crear competencia"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || publishing}
                onClick={handlePublish}
              >
                {publishing ? "Publicando..." : "Publicar competencia"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

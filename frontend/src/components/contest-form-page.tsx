"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  Clock8Icon,
  LoaderCircleIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

import {
  createContest,
  getContest,
  publishContest,
  updateContest,
} from "@/lib/contests-api";
import {
  BEBRAS_SCORING,
  CONTEST_CATEGORIES,
  DIFFICULTY_KEYS,
  defaultContestScoring,
  isStandardScoring,
  taskDifficultyForCategory,
  type ContestTaskConfigInput,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  type ContestState,
  type ContestDraftInput,
  type ContestScoring,
} from "@/lib/contest-schema";
import { listTasks } from "@/lib/tasks-api";
import type { StoredTask } from "@/lib/task-schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { FieldHint, LabelWithHint } from "@/components/field-hint";
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
  return { taskId };
}

function defaultContestTitle(category: string) {
  const year = new Date().getFullYear();
  return category
    ? `Desafío Bebras ${year} - ${category}`
    : `Desafío Bebras ${year}`;
}

function isGeneratedTitle(title: string, category: string) {
  return !title.trim() || title === defaultContestTitle(category);
}

function createInitialState(): FormState {
  return {
    title: defaultContestTitle(""),
    category: "",
    durationMinutes: 45,
    registrationStartsAt: "",
    registrationEndsAt: "",
    startsAt: "",
    endsAt: "",
    scoring: defaultContestScoring(),
    questionDisplayMode: "one_by_one",
    allowPairs: false,
    showFeedback: false,
    showSolutions: false,
    showTotalScore: false,
    tasks: [],
  };
}

function createStateFromContest(
  contest: Awaited<ReturnType<typeof getContest>>,
): FormState {
  return {
    title: contest.title,
    category: contest.category,
    durationMinutes: contest.durationMinutes,
    registrationStartsAt: contest.registrationStartsAt
      ? toDatetimeLocalValue(contest.registrationStartsAt)
      : "",
    registrationEndsAt: contest.registrationEndsAt
      ? toDatetimeLocalValue(contest.registrationEndsAt)
      : "",
    startsAt: contest.startsAt ? toDatetimeLocalValue(contest.startsAt) : "",
    endsAt: contest.endsAt ? toDatetimeLocalValue(contest.endsAt) : "",
    scoring: contest.scoring ?? defaultContestScoring(),
    questionDisplayMode: contest.questionDisplayMode,
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    tasks: contest.tasks
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((task) => ({ taskId: task.taskId })),
  };
}

function toContestPayload(form: FormState): ContestDraftInput {
  return {
    ...form,
    title: form.title.trim(),
    registrationStartsAt: form.registrationStartsAt
      ? fromDatetimeLocalValue(form.registrationStartsAt)
      : "",
    registrationEndsAt: form.registrationEndsAt
      ? fromDatetimeLocalValue(form.registrationEndsAt)
      : "",
    startsAt: form.startsAt ? fromDatetimeLocalValue(form.startsAt) : "",
    endsAt: form.endsAt ? fromDatetimeLocalValue(form.endsAt) : "",
  };
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
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const currentTime = toTimeValue(value);
  const [draftValue, setDraftValue] = useState(currentTime);

  useEffect(() => {
    setDraftValue(currentTime);
  }, [currentTime]);

  return (
    <div className="relative w-full sm:w-40">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 text-muted-foreground peer-disabled:opacity-50">
        <Clock8Icon className="size-4" />
        <span className="sr-only">{label} hora</span>
      </div>
      <Input
        aria-invalid={invalid}
        aria-label={`${label} hora`}
        disabled={disabled}
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

function formatDayLabel(date: Date) {
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

/** "Del 4 al 11 de septiembre de 2026": no repite el mes ni el año si coinciden. */
function formatRangeLabel(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `Del ${format(start, "d", { locale: es })} al ${formatDayLabel(end)}`;
  }

  if (sameYear) {
    return `Del ${format(start, "d 'de' MMMM", { locale: es })} al ${formatDayLabel(end)}`;
  }

  return `Del ${formatDayLabel(start)} al ${formatDayLabel(end)}`;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Cuánto dura la ventana, en palabras. Devuelve null si todavía no es válida. */
function formatWindowLength(startsAt: string, endsAt: string) {
  const start = parseDateTimeLocal(startsAt);
  const end = parseDateTimeLocal(endsAt);

  if (!start || !end) {
    return null;
  }

  const totalMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);

  if (totalMinutes <= 0) {
    return null;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "día" : "días"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Ventana con día o rango de días, sus horas y el tiempo que durará. El
 * estimado se recalcula en cada cambio porque sale del propio estado del
 * formulario.
 */
function WindowField({
  id,
  label,
  hint,
  startsAt,
  endsAt,
  minDate = null,
  maxDate = null,
  invalid = false,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  startsAt: string;
  endsAt: string;
  minDate?: Date | null;
  maxDate?: Date | null;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (nextStartsAt: string, nextEndsAt: string) => void;
}) {
  const startDate = parseDateTimeLocal(startsAt);
  const endDate = parseDateTimeLocal(endsAt);
  const [singleDay, setSingleDay] = useState(
    () => !startDate || !endDate || isSameCalendarDay(startDate, endDate),
  );
  const windowLength = formatWindowLength(startsAt, endsAt);
  const blockedDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];
  const selectedRange: DateRange | undefined = startDate
    ? { from: startDate, to: endDate ?? undefined }
    : undefined;
  const dayLabel = startDate ? formatDayLabel(startDate) : "Elige el día";
  const rangeLabel =
    startDate && endDate
      ? formatRangeLabel(startDate, endDate)
      : "Elige el rango de días";

  const applySameDay = (nextDate: Date | undefined) => {
    if (!nextDate) {
      return;
    }

    onChange(
      updateDatePart(startsAt, nextDate, 8),
      updateDatePart(endsAt, nextDate, 18),
    );
  };

  return (
    <Field data-invalid={invalid || undefined}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <LabelWithHint htmlFor={id} required hint={hint}>
          {label}
        </LabelWithHint>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant={singleDay ? "default" : "outline"}
            aria-pressed={singleDay}
            disabled={disabled}
            onClick={() => {
              setSingleDay(true);
              applySameDay(startDate ?? undefined);
            }}
          >
            Un día
          </Button>
          <Button
            type="button"
            size="xs"
            variant={singleDay ? "outline" : "default"}
            aria-pressed={!singleDay}
            disabled={disabled}
            onClick={() => setSingleDay(false)}
          >
            Varios días
          </Button>
        </div>
      </div>
      <FieldContent>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={id}
                type="button"
                disabled={disabled}
                variant="outline"
                aria-invalid={invalid}
                className={cn(
                  "h-9 w-full min-w-0 justify-start overflow-hidden border-input bg-background px-3 py-1 text-left text-base font-normal transition-colors [box-shadow:var(--shadow-hard)] hover:bg-muted/60 hover:text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/50 focus-visible:[box-shadow:var(--focus-soft),var(--shadow-hard)] md:text-sm",
                  (!startDate || (!singleDay && !endDate)) &&
                    "text-muted-foreground",
                )}
              >
                <CalendarIcon data-icon="inline-start" />
                <span className="truncate">
                  {singleDay ? dayLabel : rangeLabel}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              data-calendar-popover
              className="w-auto rounded-sm p-0"
              align="start"
            >
              {singleDay ? (
                <Calendar
                  initialFocus
                  mode="single"
                  selected={startDate ?? undefined}
                  defaultMonth={startDate ?? minDate ?? undefined}
                  disabled={blockedDays}
                  onSelect={applySameDay}
                />
              ) : (
                <Calendar
                  initialFocus
                  mode="range"
                  selected={selectedRange}
                  defaultMonth={startDate ?? minDate ?? undefined}
                  disabled={blockedDays}
                  onSelect={(nextRange) => {
                    const nextValues = updateDateRangeParts(
                      startsAt,
                      endsAt,
                      nextRange,
                    );
                    onChange(nextValues.startsAt, nextValues.endsAt);
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <FieldLabel>Hora de inicio</FieldLabel>
              <TimeInput
                invalid={invalid}
                disabled={disabled}
                label={`${label}, hora de inicio`}
                value={startsAt}
                onChange={(nextValue) => onChange(nextValue, endsAt)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Hora de fin</FieldLabel>
              <TimeInput
                invalid={invalid}
                disabled={disabled}
                label={`${label}, hora de fin`}
                value={endsAt}
                onChange={(nextValue) => onChange(startsAt, nextValue)}
              />
            </div>
          </div>
        </div>
        <FieldDescription>
          {windowLength
            ? `Durará ${windowLength}.`
            : "Elige los días y las horas para ver cuánto durará."}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

/** Qué ve el equipo en cuanto entrega el desafío. */
const RESULT_TOGGLES = [
  {
    key: "showTotalScore",
    label: "Su puntaje total",
    hint: "El número final, sin el detalle de cada tarea.",
  },
  {
    key: "showFeedback",
    label: "El feedback de cada tarea",
    hint: "Si acertó o falló, tarea por tarea.",
  },
  {
    key: "showSolutions",
    label: "Las soluciones",
    hint: "La explicación de cada tarea, para aprender de ella.",
  },
] as const;

function FormSection({
  title,
  description,
  hint,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-heading text-base font-semibold">{title}</h2>
            {hint && <FieldHint>{hint}</FieldHint>}
          </div>
          {description && (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Puntaje editable de una dificultad. Solo emite enteros válidos. */
function ScoreInput({
  id,
  label,
  difficulty,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  difficulty: string;
  value: number;
  disabled?: boolean;
  onChange: (nextValue: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel
        htmlFor={id}
        className="text-xs font-normal text-muted-foreground"
      >
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        className="h-8"
        aria-label={`Puntaje de respuesta ${label.toLowerCase()} en ${difficulty.toLowerCase()}`}
        disabled={disabled}
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);

          const parsed = Number(nextValue);

          if (nextValue.trim() !== "" && Number.isInteger(parsed)) {
            onChange(parsed);
          }
        }}
      />
    </div>
  );
}

function SubHeading({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-sm font-medium">{children}</h3>
      <Badge variant="outline">{count}</Badge>
    </div>
  );
}

/**
 * Aplica un cambio de las listas de tareas dentro de una transición de vista,
 * para que el navegador interpole el salto de cada fila. Marca el documento
 * mientras dura: el CSS apaga con eso la animación de la página, así solo
 * viajan las filas y no se desplaza todo.
 */
function withTaskTransition(apply: () => void) {
  const startViewTransition = (
    document as Document & {
      startViewTransition?: (callback: () => void) => {
        finished: Promise<void>;
      };
    }
  ).startViewTransition;

  if (
    !startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }

  const root = document.documentElement;
  root.dataset.taskTransition = "";

  const transition = startViewTransition.call(document, () => flushSync(apply));

  void transition.finished.finally(() => {
    delete root.dataset.taskTransition;
  });
}

/** Dificultad de la tarea en la categoría del desafío, que es la que puntúa. */
function DifficultyBadge({
  task,
  category,
}: {
  task: StoredTask;
  category: string;
}) {
  const difficulty = taskDifficultyForCategory(task.difficulties, category);

  return (
    <Badge variant={difficulty ? "outline" : "destructive"}>
      {difficulty ? BEBRAS_SCORING[difficulty].label : "Sin dificultad"}
    </Badge>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sm border border-dashed px-4 py-6 text-sm text-muted-foreground">
      {children}
    </p>
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
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [contestState, setContestState] = useState<ContestState>("borrador");
  const locked = ![
    "borrador",
    "programada",
    "inscripcion",
    "preparacion",
  ].includes(contestState);
  const isCreation = !resolvedContestId;

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
          setContestState(loadedContest.state);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        if (resolvedContestId) {
          setNotFound(true);
        } else {
          toast.error(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los datos.",
          );
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

  // Una tarea sin dificultad para el rango de edad de la categoría no tendría
  // puntaje, así que no se ofrece: el desafío solo lista las de su categoría.
  const categoryTasks = useMemo(
    () =>
      form.category
        ? tasks.filter(
            (task) =>
              taskDifficultyForCategory(task.difficulties, form.category) !==
              null,
          )
        : [],
    [form.category, tasks],
  );

  const availableTasks = useMemo(
    () =>
      categoryTasks.filter(
        (task) =>
          !form.tasks.some((taskConfig) => taskConfig.taskId === task.id),
      ),
    [categoryTasks, form.tasks],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!form.title.trim()) {
      errors.push("El nombre del desafío es obligatorio.");
    }

    if (!form.category) {
      errors.push("Debes elegir la categoría del desafío.");
    }

    // Al crear solo se piden los datos generales; el calendario llega con la edición.
    if (isCreation) {
      return errors;
    }

    if (!Number.isFinite(form.durationMinutes) || form.durationMinutes <= 0) {
      errors.push("La duración debe ser mayor que cero.");
    }

    // El calendario puede quedar a medias mientras es borrador: solo lo que ya
    // está escrito tiene que ser coherente. Publicar sí lo exige completo.
    if (
      form.startsAt &&
      form.endsAt &&
      new Date(form.endsAt) <= new Date(form.startsAt)
    ) {
      errors.push("La fecha de fin debe ser posterior a la de inicio.");
    }

    if (
      form.registrationStartsAt &&
      form.registrationEndsAt &&
      new Date(form.registrationEndsAt) <= new Date(form.registrationStartsAt)
    ) {
      errors.push("El cierre de inscripción debe ser posterior a su inicio.");
    } else if (
      form.registrationEndsAt &&
      form.startsAt &&
      new Date(form.registrationEndsAt) >= new Date(form.startsAt)
    ) {
      errors.push(
        "La inscripción debe cerrar antes de la rendición para dejar tiempo de preparación.",
      );
    }

    for (const key of DIFFICULTY_KEYS) {
      const { correct, wrong } = form.scoring[key];

      if (!Number.isInteger(correct) || correct <= 0) {
        errors.push(
          `El puntaje de una respuesta correcta en ${BEBRAS_SCORING[key].label.toLowerCase()} debe ser un entero mayor que cero.`,
        );
        break;
      }

      if (!Number.isInteger(wrong) || wrong > 0) {
        errors.push(
          `El puntaje de una respuesta incorrecta en ${BEBRAS_SCORING[key].label.toLowerCase()} debe ser un entero menor o igual que cero.`,
        );
        break;
      }
    }

    for (const selected of selectedTasks) {
      if (!taskDifficultyForCategory(selected.difficulties, form.category)) {
        errors.push(
          `La tarea "${selected.title}" no tiene dificultad definida para la categoría ${form.category || "elegida"}.`,
        );
        break;
      }
    }

    return errors;
  }, [form, isCreation, selectedTasks]);

  const publishValidationErrors = useMemo(() => {
    const errors = [...validationErrors];

    if (!form.startsAt || !form.endsAt) {
      errors.push("Define la ventana de rendición antes de publicar.");
    }

    if (!form.registrationStartsAt || !form.registrationEndsAt) {
      errors.push("Define la ventana de inscripción antes de publicar.");
    }

    if (form.tasks.length === 0) {
      errors.push("Agrega al menos una tarea antes de publicar.");
    }

    return errors;
  }, [
    form.registrationEndsAt,
    form.registrationStartsAt,
    form.startsAt,
    form.endsAt,
    form.tasks.length,
    validationErrors,
  ]);

  const scoreSummary = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    let maxScore = 0;
    let penalties = 0;
    let unresolved = 0;

    for (const task of selectedTasks) {
      const difficulty = taskDifficultyForCategory(
        task.difficulties,
        form.category,
      );

      if (!difficulty) {
        unresolved += 1;
        continue;
      }

      counts[difficulty] += 1;
      maxScore += form.scoring[difficulty].correct;
      penalties += Math.abs(form.scoring[difficulty].wrong);
    }

    return {
      counts,
      unresolved,
      initialScore: penalties,
      maxScore: penalties + maxScore,
    };
  }, [selectedTasks, form.category, form.scoring]);

  const hasTitleError = submitAttempted && !form.title.trim();
  const hasCategoryError = submitAttempted && !form.category;
  const hasDurationError =
    submitAttempted &&
    !isCreation &&
    (!Number.isFinite(form.durationMinutes) || form.durationMinutes <= 0);
  const hasDateError =
    submitAttempted &&
    !isCreation &&
    ((publishAttempted && (!form.startsAt || !form.endsAt)) ||
      Boolean(
        form.startsAt &&
        form.endsAt &&
        new Date(form.endsAt) <= new Date(form.startsAt),
      ));
  const hasRegistrationError = Boolean(
    submitAttempted &&
    !isCreation &&
    ((publishAttempted &&
      (!form.registrationStartsAt || !form.registrationEndsAt)) ||
      (form.registrationStartsAt &&
        form.registrationEndsAt &&
        new Date(form.registrationEndsAt) <=
          new Date(form.registrationStartsAt)) ||
      (form.registrationEndsAt &&
        form.startsAt &&
        new Date(form.registrationEndsAt) >= new Date(form.startsAt))),
  );

  const handlePublish = async () => {
    if (locked) {
      return;
    }

    if (!resolvedContestId) {
      toast.error("Primero guarda el desafío antes de publicarla.");
      return;
    }

    setSubmitAttempted(true);
    setPublishAttempted(true);

    if (publishValidationErrors.length > 0) {
      toast.error(publishValidationErrors[0]);
      return;
    }

    setPublishing(true);

    try {
      const savedContest = await updateContest(
        resolvedContestId,
        toContestPayload(form),
      );
      const publishedContest = await publishContest(savedContest.id);

      setForm(createStateFromContest(publishedContest));
      setContestState(publishedContest.state);
      toast.success("El desafío quedó publicado.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo publicar el desafío.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const updateScoring = (
    key: keyof ContestScoring,
    field: "correct" | "wrong",
    nextValue: number,
  ) => {
    if (locked) {
      return;
    }

    setForm((current) => ({
      ...current,
      scoring: {
        ...current.scoring,
        [key]: { ...current.scoring[key], [field]: nextValue },
      },
    }));
  };

  const toggleTask = (taskId: string) => {
    if (locked) {
      return;
    }

    withTaskTransition(() =>
      setForm((current) => ({
        ...current,
        tasks: current.tasks.some((task) => task.taskId === taskId)
          ? current.tasks.filter((task) => task.taskId !== taskId)
          : [...current.tasks, createDefaultTaskConfig(taskId)],
      })),
    );
  };

  const moveTask = (taskId: string, direction: "up" | "down") => {
    if (locked) {
      return;
    }

    const applyMove = () =>
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

    withTaskTransition(applyMove);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (locked) {
      return;
    }

    setSubmitAttempted(true);
    setPublishAttempted(false);

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setSaving(true);

    try {
      const payload = toContestPayload(form);

      const savedContest = resolvedContestId
        ? await updateContest(resolvedContestId, payload)
        : await createContest(payload);

      if (!resolvedContestId) {
        window.location.href = `/competencias/editar?id=${savedContest.id}`;
        return;
      }

      setForm(createStateFromContest(savedContest));
      setContestState(savedContest.state);
      toast.success("El desafío se guardó correctamente.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el desafío.",
      );
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
        <AlertTitle>Desafío no encontrado</AlertTitle>
        <AlertDescription>
          No se pudo cargar el desafío que intentas editar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="flex min-w-0 flex-col gap-10" onSubmit={handleSubmit}>
      <FormSection
        title="Datos generales"
        description={
          isCreation
            ? "Con estos datos se crea el borrador. El calendario, la duración y las tareas se definen al editarlo."
            : "Nombre y categoría con los que se identifica el desafío."
        }
      >
        <FieldGroup
          className={cn(
            "grid gap-4",
            !isCreation && "md:grid-cols-2 xl:grid-cols-3",
          )}
        >
          <Field data-invalid={hasTitleError || undefined}>
            <FieldLabel htmlFor="contest-title">
              Nombre <span className="text-destructive">*</span>
            </FieldLabel>
            <FieldContent>
              <Input
                id="contest-title"
                aria-invalid={hasTitleError}
                disabled={locked}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder={defaultContestTitle("")}
              />
            </FieldContent>
          </Field>
          <Field data-invalid={hasCategoryError || undefined}>
            <LabelWithHint
              htmlFor="contest-category"
              required
              hint="Define qué cursos pueden inscribirse y de qué rango de edad sale la dificultad de cada tarea para calcular el puntaje."
            >
              Categoría
            </LabelWithHint>
            <FieldContent>
              <Select
                disabled={locked}
                value={form.category || "none"}
                onValueChange={(value) =>
                  setForm((current) => {
                    const nextCategory = value === "none" ? "" : value;

                    return {
                      ...current,
                      category: nextCategory,
                      title: isGeneratedTitle(current.title, current.category)
                        ? defaultContestTitle(nextCategory)
                        : current.title,
                    };
                  })
                }
              >
                <SelectTrigger
                  id="contest-category"
                  aria-invalid={hasCategoryError}
                  className="w-full"
                >
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled={Boolean(form.category)}>
                    Sin categoría
                  </SelectItem>
                  {CONTEST_CATEGORIES.map((category) => (
                    <SelectItem key={category.name} value={category.name}>
                      {category.name} ({category.age})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FormSection>

      {!isCreation && (
        <>
          <FormSection
            title="Inscripción"
            hint="Mientras la ventana esté abierta los maestros crean grupos e inscriben participantes. Al cerrarse empieza la preparación, que dura hasta que comienza la rendición."
            description="Cuándo pueden inscribirse los grupos y participantes."
          >
            <FieldGroup className="gap-4">
              <WindowField
                id="contest-registration-window"
                label="Ventana de inscripción"
                hint="Elige un solo día o un rango. La inscripción tiene que cerrar antes de que comience la rendición."
                startsAt={form.registrationStartsAt}
                endsAt={form.registrationEndsAt}
                maxDate={parseDateTimeLocal(form.startsAt)}
                invalid={hasRegistrationError}
                disabled={locked}
                onChange={(nextStartsAt, nextEndsAt) =>
                  setForm((current) => ({
                    ...current,
                    registrationStartsAt: nextStartsAt,
                    registrationEndsAt: nextEndsAt,
                  }))
                }
              />
              {hasRegistrationError && (
                <FieldError
                  errors={[
                    {
                      message:
                        "La inscripción debe tener inicio y fin, y cerrar antes de la rendición.",
                    },
                  ]}
                />
              )}
            </FieldGroup>
          </FormSection>

          <FormSection
            title="Rendición"
            hint="El desafío se abre al alumnado al comenzar esta ventana y se cierra automáticamente al terminarla."
            description="Cuándo se rinde, cuánto tiempo tiene cada equipo y cómo lo rinde."
          >
            <FieldGroup className="gap-4">
              <WindowField
                id="contest-run-window"
                label="Ventana de rendición"
                hint="Elige un solo día o un rango. Dentro de esta ventana cada equipo dispone de su propia duración."
                startsAt={form.startsAt}
                endsAt={form.endsAt}
                minDate={parseDateTimeLocal(form.registrationEndsAt)}
                invalid={hasDateError}
                disabled={locked}
                onChange={(nextStartsAt, nextEndsAt) =>
                  setForm((current) => ({
                    ...current,
                    startsAt: nextStartsAt,
                    endsAt: nextEndsAt,
                  }))
                }
              />
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field data-invalid={hasDurationError || undefined}>
                  <LabelWithHint
                    htmlFor="contest-duration"
                    required
                    hint="Tiempo de cada equipo dentro de la ventana de rendición. El reloj arranca cuando presiona Empezar, no cuando abre el desafío. El estándar Bebras son 45 minutos."
                  >
                    Duración por equipo (minutos)
                  </LabelWithHint>
                  <FieldContent>
                    <Input
                      id="contest-duration"
                      aria-invalid={hasDurationError}
                      disabled={locked}
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
                  </FieldContent>
                </Field>
                <Field>
                  <LabelWithHint
                    htmlFor="contest-display-mode"
                    hint="Una por una muestra una pregunta a la vez y el estudiante navega entre ellas. Todas juntas las deja en una sola lista, para desplazarse."
                  >
                    Forma de mostrar las preguntas
                  </LabelWithHint>
                  <FieldContent>
                    <Select
                      disabled={locked}
                      value={form.questionDisplayMode}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          questionDisplayMode:
                            value === "all" ? "all" : "one_by_one",
                        }))
                      }
                    >
                      <SelectTrigger
                        id="contest-display-mode"
                        className="w-full"
                      >
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
                  </FieldContent>
                </Field>
              </FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="contest-allowPairs"
                  checked={form.allowPairs}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      allowPairs: checked === true,
                    }))
                  }
                />
                <LabelWithHint
                  htmlFor="contest-allowPairs"
                  hint="Dos estudiantes pueden rendir juntos en un mismo equipo, con un solo intento y un solo puntaje."
                >
                  Permitir parejas
                </LabelWithHint>
              </Field>
              {hasDateError && (
                <FieldError
                  errors={[
                    {
                      message:
                        "La fecha de fin debe ser posterior a la de inicio.",
                    },
                  ]}
                />
              )}
            </FieldGroup>
          </FormSection>

          <FormSection
            title="Tareas"
            description="Elige las tareas del desafío y déjalas en el orden en que se rendirán."
          >
            <div className="grid min-w-0 gap-8 *:min-w-0 xl:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-3">
                <SubHeading count={availableTasks.length}>
                  Disponibles
                </SubHeading>
                {tasks.length === 0 ? (
                  <EmptyHint>
                    No hay tareas registradas. Crea tareas primero para poder
                    armar un desafío.
                  </EmptyHint>
                ) : !form.category ? (
                  <EmptyHint>
                    Elige la categoría del desafío para ver las tareas que le
                    corresponden.
                  </EmptyHint>
                ) : categoryTasks.length === 0 ? (
                  <EmptyHint>
                    Ninguna tarea registrada tiene dificultad para{" "}
                    {form.category}.
                  </EmptyHint>
                ) : availableTasks.length === 0 ? (
                  <EmptyHint>
                    Ya elegiste todas las tareas de {form.category}.
                  </EmptyHint>
                ) : (
                  <ul className="divide-y rounded-sm border">
                    {availableTasks.map((task) => (
                      <li
                        key={task.id}
                        data-task-row
                        style={{
                          viewTransitionName: `contest-task-${task.id}`,
                        }}
                        className="flex min-w-0 flex-col gap-3 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="break-words font-medium">
                              {task.title}
                            </span>
                            <DifficultyBadge
                              task={task}
                              category={form.category}
                            />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {task.categories.join(", ") || "Sin área"}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={locked}
                          className="self-end sm:self-auto"
                          title={`Agregar ${task.title}`}
                          aria-label={`Agregar ${task.title}`}
                          onClick={() => toggleTask(task.id)}
                        >
                          <PlusIcon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-muted-foreground">
                  Solo aparecen las tareas de {form.category || "la categoría"}.
                  Si no encuentras una pregunta, quizá esté en otra categoría:{" "}
                  <a
                    href="/tareas"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    ver todas las tareas
                  </a>
                  .
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <SubHeading count={selectedTasks.length}>
                  En el desafío
                </SubHeading>
                {selectedTasks.length === 0 ? (
                  <EmptyHint>
                    Puedes guardar el desafío vacío y elegir sus tareas más
                    adelante. Para publicarlo necesitarás al menos una.
                  </EmptyHint>
                ) : (
                  <ul className="divide-y rounded-sm border">
                    {selectedTasks.map((task, index) => (
                      <li
                        key={task.id}
                        data-task-row
                        style={{
                          viewTransitionName: `contest-task-${task.id}`,
                        }}
                        className="flex min-w-0 flex-col gap-3 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <Badge variant="secondary" className="mt-0.5">
                            {index + 1}
                          </Badge>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="break-words font-medium">
                                {task.title}
                              </span>
                              <DifficultyBadge
                                task={task}
                                category={form.category}
                              />
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {task.categories.join(", ") || "Sin área"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            aria-label="Subir tarea"
                            disabled={locked || index === 0}
                            onClick={() => moveTask(task.id, "up")}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            size="icon-sm"
                            type="button"
                            variant="outline"
                            aria-label="Bajar tarea"
                            disabled={
                              locked || index === selectedTasks.length - 1
                            }
                            onClick={() => moveTask(task.id, "down")}
                          >
                            <ArrowDownIcon />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            disabled={locked}
                            title={`Quitar ${task.title}`}
                            aria-label={`Quitar ${task.title}`}
                            onClick={() => toggleTask(task.id)}
                          >
                            <XIcon />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Puntuación"
            hint="La dificultad de cada tarea sale de la que le pusiste al rango de edad de esta categoría, en el formulario de la tarea. Los puntajes arrancan en los de Bebras y puedes cambiarlos."
            description="Cuánto suma o resta cada tarea según su dificultad."
            action={
              !locked &&
              !isStandardScoring(form.scoring) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      scoring: defaultContestScoring(),
                    }))
                  }
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  Restablecer
                </Button>
              )
            }
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {DIFFICULTY_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-sm border px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {BEBRAS_SCORING[key].label}
                      </span>
                      <Badge variant="secondary">
                        {scoreSummary.counts[key]} tarea(s)
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ScoreInput
                        id={`score-correct-${key}`}
                        label="Correcta"
                        difficulty={BEBRAS_SCORING[key].label}
                        value={form.scoring[key].correct}
                        disabled={locked}
                        onChange={(nextValue) =>
                          updateScoring(key, "correct", nextValue)
                        }
                      />
                      <ScoreInput
                        id={`score-wrong-${key}`}
                        label="Incorrecta"
                        difficulty={BEBRAS_SCORING[key].label}
                        value={form.scoring[key].wrong}
                        disabled={locked}
                        onChange={(nextValue) =>
                          updateScoring(key, "wrong", nextValue)
                        }
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Sin responder 0
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-6 rounded-sm bg-secondary/30 px-4 py-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Puntaje inicial</div>
                  <div className="text-lg font-semibold">
                    {scoreSummary.initialScore}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Puntaje máximo</div>
                  <div className="text-lg font-semibold">
                    {scoreSummary.maxScore}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Puntaje mínimo</div>
                  <div className="text-lg font-semibold">0</div>
                </div>
              </div>

              {scoreSummary.unresolved > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {scoreSummary.unresolved} tarea(s) sin dificultad para esta
                    categoría
                  </AlertTitle>
                  <AlertDescription>
                    Cada tarea necesita una dificultad asignada al rango de edad
                    de {form.category || "la categoría elegida"}. Edítalas o
                    quítalas del desafío.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </FormSection>

          <FormSection
            title="Al terminar"
            hint="Se aplica en cuanto el equipo entrega. Los resultados oficiales del desafío se publican aparte, cuando lo consolidas."
            description="Qué ve el equipo en la pantalla final."
          >
            <FieldGroup className="gap-4">
              {RESULT_TOGGLES.map((toggle) => (
                <Field key={toggle.key} orientation="horizontal">
                  <Checkbox
                    id={`contest-${toggle.key}`}
                    checked={form[toggle.key]}
                    disabled={locked}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        [toggle.key]: checked === true,
                      }))
                    }
                  />
                  <LabelWithHint
                    htmlFor={`contest-${toggle.key}`}
                    hint={toggle.hint}
                  >
                    {toggle.label}
                  </LabelWithHint>
                </Field>
              ))}
            </FieldGroup>
          </FormSection>
        </>
      )}

      {submitAttempted &&
        (publishAttempted
          ? publishValidationErrors.length > 0
          : validationErrors.length > 0) && (
          <Alert variant="destructive">
            <AlertTitle>Faltan datos</AlertTitle>
            <AlertDescription>
              {
                (publishAttempted
                  ? publishValidationErrors
                  : validationErrors)[0]
              }
            </AlertDescription>
          </Alert>
        )}

      {locked && (
        <Alert>
          <AlertTitle>Este desafío ya no se puede modificar</AlertTitle>
          <AlertDescription>
            {contestState === "abierta"
              ? "Está en curso. Cambiar las tareas o los puntajes ahora afectaría a los estudiantes que están rindiendo."
              : "Ya terminó. Sus tareas y puntajes quedan como registro de lo que se rindió."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
        {!isCreation && (
          <div className="text-sm text-muted-foreground">
            {form.tasks.length} tarea(s) seleccionada(s). Guarda para dejar
            persistido el orden actual.
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap md:ml-auto">
          <Button
            type="submit"
            disabled={saving || locked}
            className="w-full sm:w-auto"
          >
            <SaveIcon data-icon="inline-start" />
            {saving
              ? "Guardando..."
              : isCreation
                ? "Crear desafío"
                : "Guardar desafío"}
          </Button>
          {!isCreation && form.tasks.length > 0 && (
            <Button
              asChild
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <a href={`/competencias/probar?id=${resolvedContestId}`}>
                <PlayIcon data-icon="inline-start" />
                Probar preguntas
              </a>
            </Button>
          )}
          {!isCreation && (
            <Button
              type="button"
              variant="secondary"
              disabled={saving || publishing || locked}
              className="w-full sm:w-auto"
              onClick={handlePublish}
            >
              {publishing ? "Publicando..." : "Publicar desafío"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

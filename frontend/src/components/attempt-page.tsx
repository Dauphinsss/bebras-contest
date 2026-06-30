"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  ClockIcon,
  LoaderCircleIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { DragDropPlayer } from "@/components/drag-drop-player";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getAttempt,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type AttemptState,
  type PlayTask,
} from "@/lib/play-api";
import type { StoredTaskDragDropItem } from "@/lib/task-schema";
import { cn } from "@/lib/utils";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AttemptPage() {
  const [personalCode] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("code") ?? "")
          .trim()
          .toUpperCase()
      : "",
  );
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittedRef = useRef(false);

  const load = async () => {
    if (!personalCode) {
      setLoading(false);
      return;
    }
    try {
      const data = await getAttempt(personalCode);
      setAttempt(data);
      setAnswers((data.answers as Record<string, any>) ?? {});
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo cargar.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const endsAtMs = attempt?.endsAt ? new Date(attempt.endsAt).getTime() : 0;
  const remaining = endsAtMs - now;

  useEffect(() => {
    if (
      attempt?.status === "in_progress" &&
      endsAtMs > 0 &&
      remaining <= 0 &&
      !submittedRef.current
    ) {
      submittedRef.current = true;
      void submitAttempt(personalCode)
        .then(() => load())
        .catch(() => undefined);
    }
  }, [remaining, attempt?.status]);

  const scheduleSave = (taskId: string, payload: unknown) => {
    if (saveTimers.current[taskId]) {
      clearTimeout(saveTimers.current[taskId]);
    }
    saveTimers.current[taskId] = setTimeout(() => {
      void saveAnswer(personalCode, taskId, payload).catch(() => undefined);
    }, 500);
  };

  const setAnswer = (taskId: string, payload: any) => {
    setAnswers((current) => ({ ...current, [taskId]: payload }));
    scheduleSave(taskId, payload);
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await startAttempt(personalCode);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo empezar.",
      );
    } finally {
      setStarting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      submittedRef.current = true;
      await submitAttempt(personalCode);
      await load();
      toast.success("Entregaste la competencia.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo entregar.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!personalCode || !attempt) {
    return (
      <Alert>
        <AlertTitle>No encontramos tu registro</AlertTitle>
        <AlertDescription>
          Vuelve a entrar con el código de tu maestro.
        </AlertDescription>
      </Alert>
    );
  }

  if (attempt.status === "pending") {
    return (
      <Card className="mx-auto w-full max-w-lg">
        <CardContent className="flex flex-col gap-4 pt-6 text-center">
          <h1 className="text-2xl font-semibold">{attempt.contestTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Tendrás {attempt.durationMinutes} minutos desde que empieces. El
            tiempo no se detiene.
          </p>
          {attempt.state !== "abierta" ? (
            <Alert>
              <AlertTitle>La competencia aún no está abierta</AlertTitle>
              <AlertDescription>
                Espera a que tu maestro la abra para empezar.
              </AlertDescription>
            </Alert>
          ) : (
            <Button onClick={handleStart} disabled={starting}>
              {starting ? "Empezando..." : "Empezar la competencia"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (attempt.status === "finished") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <CheckCircle2Icon className="size-8 text-primary" />
            <h1 className="text-2xl font-semibold">¡Competencia terminada!</h1>
            <p className="text-sm text-muted-foreground">
              {attempt.contestTitle}
            </p>
            {attempt.result ? (
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Badge variant="secondary">
                  Puntaje: {attempt.result.totalScore}
                </Badge>
                <Badge variant="outline">
                  Correctas: {attempt.result.correctCount}
                </Badge>
                {attempt.result.rankPosition && (
                  <Badge variant="outline">
                    Posición: #{attempt.result.rankPosition}
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tu maestro te compartirá los resultados.
              </p>
            )}
          </CardContent>
        </Card>

        {attempt.showSolutions &&
          attempt.tasks.map((task) => (
            <Card key={task.taskId}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <h2 className="text-lg font-semibold">
                  {task.position}. {task.title}
                </h2>
                {task.explanation && (
                  <p className="text-sm text-muted-foreground">
                    {task.explanation}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="sticky top-2 z-10 flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {attempt.contestTitle}
          </p>
          <p className="text-xs text-muted-foreground">
            {attempt.tasks.length} tarea(s)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-lg font-semibold",
              remaining < 60000 && "text-destructive",
            )}
          >
            <ClockIcon className="size-4" />
            {formatRemaining(remaining)}
          </span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={submitting}>
                <SendIcon data-icon="inline-start" />
                Entregar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Entregar la competencia?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ya no podrás cambiar tus respuestas. Esta acción no se puede
                  deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Seguir respondiendo</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleSubmit()}>
                  Entregar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {attempt.tasks.map((task) => (
        <TaskCard
          key={task.taskId}
          task={task}
          value={answers[task.taskId]}
          onChange={(payload) => setAnswer(task.taskId, payload)}
        />
      ))}
    </div>
  );
}

function TaskCard({
  task,
  value,
  onChange,
}: {
  task: PlayTask;
  value: any;
  onChange: (payload: any) => void;
}) {
  const selected: string[] = Array.isArray(value?.selected) ? value.selected : [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Tarea {task.position}
          </span>
          <h2 className="text-xl font-semibold">{task.title}</h2>
          <TaskContentRenderer blocks={task.bodyBlocks} className="gap-4" />
        </div>

        {task.challengeBlocks.length > 0 && (
          <TaskContentRenderer blocks={task.challengeBlocks} className="gap-4" />
        )}

        {task.answerType === "multiple_choice" && (
          <div className="flex flex-col gap-3">
            {task.answers.map((answer) => {
              const isSelected = selected.includes(answer.id);
              return (
                <Card
                  key={answer.id}
                  variant={isSelected ? "soft-gradient" : "default"}
                  className={cn(
                    "cursor-pointer gap-0 py-0 transition",
                    isSelected && "border-primary",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-center text-left"
                    onClick={() => {
                      if (task.multipleChoiceMode === "all") {
                        onChange({
                          selected: isSelected
                            ? selected.filter((id) => id !== answer.id)
                            : [...selected, answer.id],
                        });
                      } else {
                        onChange({ selected: [answer.id] });
                      }
                    }}
                  >
                    <CardContent className="w-full py-4">
                      <TaskContentRenderer
                        blocks={answer.blocks}
                        className="gap-2 text-base"
                      />
                    </CardContent>
                  </button>
                </Card>
              );
            })}
            {task.multipleChoiceMode === "all" && (
              <p className="text-xs text-muted-foreground">
                Puedes elegir más de una opción.
              </p>
            )}
          </div>
        )}

        {task.answerType === "short_text" && (
          <Input
            placeholder="Escribe tu respuesta"
            value={value?.text ?? ""}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        )}

        {task.answerType === "range" && (
          <Input
            type="number"
            placeholder="Escribe un número"
            value={value?.value ?? ""}
            onChange={(event) => onChange({ value: event.target.value })}
          />
        )}

        {task.answerType === "drag_drop" && task.dragDropBackground && (
          <DragDropPlayer
            backgroundUrl={task.dragDropBackground.url}
            items={
              task.dragDropItems.map((item) => ({
                ...item,
                targetX: 0,
                targetY: 0,
                tolerance: 0,
              })) as StoredTaskDragDropItem[]
            }
            placements={(value?.placements ?? {}) as Record<
              string,
              { x: number; y: number }
            >}
            onPlaceItem={(itemId, placement) =>
              onChange({
                placements: { ...(value?.placements ?? {}), [itemId]: placement },
              })
            }
            onResetItem={(itemId) => {
              const next = { ...(value?.placements ?? {}) };
              delete next[itemId];
              onChange({ placements: next });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

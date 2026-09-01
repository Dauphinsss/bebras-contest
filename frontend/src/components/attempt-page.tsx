"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LoaderCircleIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { PlayTaskFields } from "@/components/play-task-fields";
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
import {
  answerHasResponse,
  forgetPlaySession,
  getAttempt,
  readPlaySession,
  saveAnswer,
  sendPlayHeartbeat,
  startAttempt,
  submitAttempt,
  type AttemptState,
  type PlayTask,
} from "@/lib/play-api";
import { cn } from "@/lib/utils";

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const SAVE_RETRY_DELAYS = [250, 750] as const;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveAnswerWithRetry(taskId: string, payload: unknown) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS.length; attempt += 1) {
    try {
      await saveAnswer(taskId, payload);
      return;
    } catch (error) {
      lastError = error;
      const retryDelay = SAVE_RETRY_DELAYS[attempt];
      if (retryDelay === undefined) {
        break;
      }
      await wait(retryDelay);
    }
  }

  throw lastError;
}

export function AttemptPage() {
  const [sessionToken] = useState(() => readPlaySession());
  const [sessionLost, setSessionLost] = useState(false);
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveQueues = useRef<Record<string, Promise<void>>>({});
  const answersRef = useRef<Record<string, unknown>>({});
  const submittedRef = useRef(false);
  const automaticFinishAttemptedRef = useRef(false);

  const load = useCallback(async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    try {
      const data = await getAttempt();
      setAttempt(data);
      answersRef.current = data.answers ?? {};
      setAnswers(answersRef.current);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo cargar.";

      if (message.includes("sesión")) {
        forgetPlaySession();
        setSessionLost(true);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const suspended = attempt?.state === "suspendida";
  const suspendedAtMs = attempt?.suspendedAt
    ? new Date(attempt.suspendedAt).getTime()
    : 0;
  const endsAtMs = attempt?.endsAt ? new Date(attempt.endsAt).getTime() : 0;
  const remaining =
    endsAtMs - (suspended && suspendedAtMs ? suspendedAtMs : now);

  const queueSave = (taskId: string, payload: unknown) => {
    const previousSave = saveQueues.current[taskId] ?? Promise.resolve();
    const nextSave = previousSave
      .catch(() => undefined)
      .then(() => saveAnswerWithRetry(taskId, payload));

    saveQueues.current[taskId] = nextSave;
    return nextSave;
  };

  const scheduleSave = (taskId: string, payload: unknown) => {
    if (saveTimers.current[taskId]) {
      clearTimeout(saveTimers.current[taskId]);
    }
    const delay = remaining <= 10000 ? 0 : 500;
    saveTimers.current[taskId] = setTimeout(() => {
      delete saveTimers.current[taskId];
      void queueSave(taskId, payload).catch(() => undefined);
    }, delay);
  };

  const setAnswer = (taskId: string, payload: unknown) => {
    answersRef.current = { ...answersRef.current, [taskId]: payload };
    setAnswers(answersRef.current);
    scheduleSave(taskId, payload);
  };

  const flushSaves = async () => {
    Object.values(saveTimers.current).forEach((timer) => clearTimeout(timer));
    saveTimers.current = {};
    await Promise.all(
      Object.entries(answersRef.current).map(([taskId, payload]) =>
        queueSave(taskId, payload),
      ),
    );
  };

  const finishAutomatically = useEffectEvent(async () => {
    setSubmitting(true);
    try {
      try {
        await flushSaves();
      } catch {
        // The server enforces the deadline, so finalization must still continue.
      }
      await submitAttempt();
      await load();
    } catch {
      submittedRef.current = false;
      toast.error(
        "No pudimos entregar el desafío. Revisa la conexión e inténtalo nuevamente.",
      );
    } finally {
      setSubmitting(false);
    }
  });

  useEffect(() => {
    if (
      attempt?.status === "in_progress" &&
      !suspended &&
      endsAtMs > 0 &&
      remaining <= 0 &&
      !submittedRef.current &&
      !automaticFinishAttemptedRef.current
    ) {
      automaticFinishAttemptedRef.current = true;
      submittedRef.current = true;
      void finishAutomatically();
    }
  }, [remaining, attempt?.status, endsAtMs, suspended]);

  useEffect(() => {
    if (!suspended) {
      return;
    }

    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [suspended, load]);

  useEffect(() => {
    if (!sessionToken || sessionLost) {
      return;
    }

    const id = setInterval(() => {
      void sendPlayHeartbeat().catch(() => undefined);
    }, 10000);
    return () => clearInterval(id);
  }, [sessionToken, sessionLost]);

  useEffect(
    () => () => {
      Object.values(saveTimers.current).forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  const handleStart = async () => {
    setStarting(true);
    try {
      await startAttempt();
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
    if (submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);
    try {
      await flushSaves();
      await submitAttempt();
      await load();
      toast.success("Entregaste el desafío.");
    } catch {
      submittedRef.current = false;
      toast.error(
        "No pudimos entregar el desafío. Revisa la conexión e inténtalo nuevamente.",
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

  if (sessionLost) {
    return (
      <Alert>
        <AlertTitle>Tu sesión se cerró</AlertTitle>
        <AlertDescription>
          Se abrió tu prueba en otro dispositivo o pasó demasiado tiempo sin
          conexión. Vuelve a entrar con tu nombre para seguir donde estabas.
        </AlertDescription>
      </Alert>
    );
  }

  if (!sessionToken || !attempt) {
    return (
      <Alert>
        <AlertTitle>No encontramos tu sesión</AlertTitle>
        <AlertDescription>
          Entra con el código de tu maestro y tu nombre para empezar.
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
              <AlertTitle>
                {suspended
                  ? "El desafío está suspendido"
                  : "El desafío aún no está abierto"}
              </AlertTitle>
              <AlertDescription>
                {suspended
                  ? "Tu maestro la pausó. Deja esta página abierta: se habilita sola cuando la reanuden."
                  : "Espera a que tu maestro la abra para empezar."}
              </AlertDescription>
            </Alert>
          ) : (
            <Button onClick={handleStart} disabled={starting}>
              {starting ? "Empezando..." : "Empezar el desafío"}
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
            <h1 className="text-2xl font-semibold">¡Desafío terminado!</h1>
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
                {attempt.resultsPublished
                  ? "Tu maestro te compartirá los resultados."
                  : "Los resultados se publicarán unos días después del desafío."}
              </p>
            )}
          </CardContent>
        </Card>

        {(attempt.showFeedback || attempt.showSolutions) &&
          attempt.tasks.map((task) => (
            <Card key={task.taskId}>
              <CardContent className="flex flex-col gap-2 pt-6">
                <div className="flex items-center gap-2">
                  {task.correct ? (
                    <CheckCircle2Icon className="size-5 shrink-0 text-primary" />
                  ) : (
                    <XCircleIcon className="size-5 shrink-0 text-destructive" />
                  )}
                  <h2 className="text-lg font-semibold">
                    {task.position}. {task.title}
                  </h2>
                </div>
                {attempt.showSolutions && task.explanation && (
                  <p className="pl-7 text-sm text-muted-foreground">
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
          <SubmitAttemptDialog
            submitting={submitting}
            onSubmit={() => void handleSubmit()}
          >
            <Button type="button" disabled={submitting || suspended}>
              {submitting ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              {submitting ? "Entregando..." : "Entregar"}
            </Button>
          </SubmitAttemptDialog>
        </div>
      </div>

      {suspended && (
        <Alert>
          <AlertTitle>El desafío está suspendido</AlertTitle>
          <AlertDescription>
            Tu maestro la pausó y tu tiempo quedó detenido. No cierres esta
            página: se reanuda sola y recuperas los {formatRemaining(remaining)}{" "}
            que te quedaban.
          </AlertDescription>
        </Alert>
      )}

      {attempt.questionDisplayMode === "all" ? (
        attempt.tasks.map((task) => (
          <TaskCard
            key={task.taskId}
            task={task}
            value={answers[task.taskId]}
            disabled={submitting || suspended}
            onChange={(payload) => setAnswer(task.taskId, payload)}
          />
        ))
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {attempt.tasks.map((task, index) => {
              const answered = answerHasResponse(
                task.answerType,
                answers[task.taskId],
              );
              const isCurrent = index === currentIndex;
              return (
                <button
                  key={task.taskId}
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md border text-sm font-medium transition",
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : answered
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "bg-background text-muted-foreground hover:border-foreground",
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          {attempt.tasks[currentIndex] && (
            <TaskCard
              key={attempt.tasks[currentIndex].taskId}
              task={attempt.tasks[currentIndex]}
              value={answers[attempt.tasks[currentIndex].taskId]}
              disabled={submitting || suspended}
              onChange={(payload) =>
                setAnswer(attempt.tasks[currentIndex].taskId, payload)
              }
            />
          )}

          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              <ChevronLeftIcon data-icon="inline-start" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Tarea {currentIndex + 1} de {attempt.tasks.length}
            </span>
            {currentIndex >= attempt.tasks.length - 1 ? (
              <SubmitAttemptDialog
                submitting={submitting}
                onSubmit={() => void handleSubmit()}
              >
                <Button type="button" disabled={submitting || suspended}>
                  {submitting ? (
                    <LoaderCircleIcon
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <SendIcon data-icon="inline-start" />
                  )}
                  {submitting ? "Entregando..." : "Terminar"}
                </Button>
              </SubmitAttemptDialog>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setCurrentIndex((index) =>
                    Math.min(attempt.tasks.length - 1, index + 1),
                  )
                }
              >
                Siguiente
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitAttemptDialog({
  submitting,
  onSubmit,
  children,
}: {
  submitting: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Entregar el desafío?</AlertDialogTitle>
          <AlertDialogDescription>
            Ya no podrás cambiar tus respuestas. Esta acción no se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Seguir respondiendo</AlertDialogCancel>
          <AlertDialogAction disabled={submitting} onClick={onSubmit}>
            {submitting ? "Entregando..." : "Entregar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TaskCard({
  task,
  value,
  onChange,
  disabled = false,
}: {
  task: PlayTask;
  value: unknown;
  onChange: (payload: unknown) => void;
  disabled?: boolean;
}) {
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
          <TaskContentRenderer
            blocks={task.challengeBlocks}
            className="gap-4"
          />
        )}

        <PlayTaskFields
          task={task}
          value={value}
          disabled={disabled}
          onChange={disabled ? () => undefined : onChange}
        />
      </CardContent>
    </Card>
  );
}

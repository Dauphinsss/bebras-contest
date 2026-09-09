"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { TaskContentRenderer } from "@/components/task-content-renderer";
import { TaskPlayContent } from "@/components/task-play-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getTask,
  listTasks,
  previewTask,
  previewTaskDraft,
  checkTask,
  checkTaskDraft,
  type TaskCheckResult,
} from "@/lib/tasks-api";
import { readTaskDraftForTest } from "@/lib/task-draft-test";
import { answerHasResponse, type PlayTask } from "@/lib/play-api";
import { BEBRAS_CATEGORIES } from "@/lib/contest-schema";
import type { StoredTask } from "@/lib/task-schema";

export function TaskTester() {
  const [selectedTask, setSelectedTask] = useState<StoredTask | null>(null);
  const [playTask, setPlayTask] = useState<PlayTask | null>(null);
  const [answer, setAnswer] = useState<unknown>({});
  const [result, setResult] = useState<TaskCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backHref, setBackHref] = useState<string | null>(null);
  // Cuando se prueba lo que hay en el editor, la tarea no está en la base y
  // hay que mandarla entera en cada llamada.
  const [draft, setDraft] = useState<unknown>(null);
  const revision = useRef(0);
  const checkController = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("id");
    const back = params.get("volver");
    const stored = params.get("borrador") ? readTaskDraftForTest() : null;
    const editedDraft = stored?.task ?? null;
    const controller = new AbortController();
    let active = true;

    if (back?.startsWith("/")) {
      // Volver con el borrador puesto: el editor lo recupera de sessionStorage.
      setBackHref(
        editedDraft
          ? `${back}${back.includes("?") ? "&" : "?"}borrador=1`
          : back,
      );
    }

    void (async () => {
      try {
        if (editedDraft) {
          const preview = await previewTaskDraft(
            editedDraft,
            controller.signal,
          );
          if (!active) return;
          setDraft(editedDraft);
          setSelectedTask(editedDraft as StoredTask);
          setPlayTask(preview);
          return;
        }

        const task = taskId ? await getTask(taskId) : (await listTasks())[0];
        if (!task || !active) return;
        const preview = await previewTask(task.id, controller.signal);
        if (!active) return;
        setSelectedTask(task);
        setPlayTask(preview);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error && editedDraft
            ? error.message
            : "No se pudo cargar la tarea.";
        setLoadError(message);
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      checkController.current?.abort();
      revision.current += 1;
    };
  }, []);

  const handleAnswerChange = (payload: unknown) => {
    revision.current += 1;
    checkController.current?.abort();
    setChecking(false);
    setResult(null);
    setAnswer(payload);
  };

  const handleReset = () => handleAnswerChange({});

  const handleCheckAnswer = async () => {
    if (!playTask || checking) return;
    if (!answerHasResponse(playTask.answerType, answer)) {
      toast.error("Completa una respuesta antes de probar la tarea.");
      return;
    }
    const checkedRevision = ++revision.current;
    const controller = new AbortController();
    checkController.current?.abort();
    checkController.current = controller;
    setResult(null);
    setChecking(true);
    try {
      const checked = draft
        ? await checkTaskDraft(draft, answer, controller.signal)
        : await checkTask(playTask.taskId, answer, controller.signal);
      // A result belongs only to the exact answer that initiated this request.
      if (checkedRevision !== revision.current) return;
      setResult(checked);
      if (
        !["image_hotspot", "state_grid", "text_cloze"].includes(
          playTask.answerType,
        )
      ) {
        if (checked.correct) toast.success("Respuesta correcta");
        else toast.error("Respuesta incorrecta");
      }
    } catch (error) {
      if (checkedRevision === revision.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo comprobar la respuesta.",
        );
      }
    } finally {
      if (checkedRevision === revision.current) setChecking(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {!selectedTask && (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>
            {loading ? "Cargando tarea…" : "No se pudo abrir la tarea"}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              {loadError ??
                "Abre el probador desde una tarea específica para verla en esta vista."}
            </span>
            {!loading && backHref && (
              <Button asChild type="button" variant="outline">
                <a href={backHref}>
                  <PencilIcon data-icon="inline-start" />
                  Volver a la edición
                </a>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {selectedTask && (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 sm:gap-7">
          <div className="flex flex-wrap items-center gap-2 border-b pb-3 text-sm text-muted-foreground">
            <span>Probando:</span>
            <h1 className="font-medium text-foreground">
              {selectedTask.title}
            </h1>
            {draft !== null && <Badge>Cambios sin guardar</Badge>}
            {selectedTask.categories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
            {BEBRAS_CATEGORIES.filter(
              (category) =>
                (selectedTask.difficulties[category.ageRange] ?? "").trim() !==
                "",
            ).map((category) => (
              <Badge key={category.name} variant="outline">
                {category.name}
              </Badge>
            ))}
          </div>

          {playTask && (
            <TaskPlayContent
              task={playTask}
              value={answer}
              onChange={handleAnswerChange}
              showHeadings
            />
          )}

          {result && (
            <Alert
              variant={result.correct ? "default" : "destructive"}
              className={
                ["image_hotspot", "state_grid", "text_cloze"].includes(
                  playTask?.answerType ?? "",
                )
                  ? "order-1 gap-3"
                  : "gap-3"
              }
            >
              <AlertCircleIcon />
              <AlertTitle>
                {result.correct ? "Correcto" : "Incorrecto"}
              </AlertTitle>
              <AlertDescription>
                <TaskContentRenderer blocks={result.explanationBlocks} />
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
            {backHref ? (
              <Button asChild type="button" variant="ghost">
                <a href={backHref}>
                  <PencilIcon data-icon="inline-start" />
                  Volver a la edición
                </a>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-nowrap">
              <Button type="button" variant="outline" onClick={handleReset}>
                <RotateCcwIcon data-icon="inline-start" />
                Reiniciar
              </Button>
              <Button
                type="button"
                onClick={handleCheckAnswer}
                disabled={!playTask || checking}
              >
                {checking ? "Comprobando…" : "Probar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

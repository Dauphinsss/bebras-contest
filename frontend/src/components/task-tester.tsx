"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listTasks } from "@/lib/tasks-api";
import {
  buildAgeSummary,
  getQuestionSummary,
  type StoredTask,
} from "@/lib/task-schema";
import { cn } from "@/lib/utils";

function createSeedFromText(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash || 1;
}

function nextSeed(seed: number) {
  return (seed * 1664525 + 1013904223) >>> 0;
}

export function TaskTester() {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [checkedValue, setCheckedValue] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [rangeValue, setRangeValue] = useState("");

  useEffect(() => {
    const taskIdFromUrl = new URLSearchParams(window.location.search).get("id");
    let active = true;

    void listTasks()
      .then((loadedTasks) => {
        if (!active) {
          return;
        }

        setTasks(loadedTasks);
        setSelectedTaskId(
          loadedTasks.find((task) => task.id === taskIdFromUrl)?.id ??
            loadedTasks[0]?.id ??
            "",
        );
      })
      .catch(() => {
        toast.error("No se pudieron cargar las tareas desde el backend.");
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const displayedAnswers = useMemo(() => {
    if (!selectedTask) {
      return [];
    }

    const answers = [...selectedTask.answers];

    if (selectedTask.multipleChoiceOrderMode !== "random") {
      return answers;
    }

    let seed = createSeedFromText(
      `${selectedTask.id}:${selectedTask.updatedAt}:${selectedTask.correctAnswerId}`,
    );

    for (let index = answers.length - 1; index > 0; index -= 1) {
      seed = nextSeed(seed);
      const randomIndex = seed % (index + 1);
      [answers[index], answers[randomIndex]] = [answers[randomIndex], answers[index]];
    }

    return answers;
  }, [selectedTask]);

  const isCorrect = useMemo(() => {
    if (!selectedTask || !checkedValue) {
      return false;
    }

    const answerType = selectedTask.answerType ?? "multiple_choice";

    if (answerType === "multiple_choice") {
      return checkedValue === selectedTask.correctAnswerId;
    }

    if (answerType === "short_text") {
      return (
        checkedValue.trim().toLowerCase() ===
        (selectedTask.shortAnswer ?? "").trim().toLowerCase()
      );
    }

    const numericValue = Number(checkedValue);
    if (Number.isNaN(numericValue)) {
      return false;
    }

    return (selectedTask.rangeAnswers ?? []).some(
      (rangeAnswer) =>
        numericValue >= rangeAnswer.min && numericValue <= rangeAnswer.max,
    );
  }, [checkedValue, selectedTask]);

  const handleCheckAnswer = () => {
    if (!selectedTask) {
      return;
    }

    const answerType = selectedTask.answerType ?? "multiple_choice";

    if (answerType === "multiple_choice") {
      if (!selectedAnswerId) {
        toast.error("Selecciona una respuesta antes de probar la tarea.");
        return;
      }

      setCheckedValue(selectedAnswerId);
      if (selectedAnswerId === selectedTask.correctAnswerId) {
        toast.success("Respuesta correcta");
      } else {
        toast.error("Respuesta incorrecta");
      }
      return;
    }

    if (answerType === "short_text") {
      if (!shortAnswer.trim()) {
        toast.error("Escribe una respuesta antes de probar la tarea.");
        return;
      }

      setCheckedValue(shortAnswer);
      if (
        shortAnswer.trim().toLowerCase() ===
        (selectedTask.shortAnswer ?? "").trim().toLowerCase()
      ) {
        toast.success("Respuesta correcta");
      } else {
        toast.error("Respuesta incorrecta");
      }
      return;
    }

    if (!rangeValue.trim() || Number.isNaN(Number(rangeValue))) {
      toast.error("Escribe un valor numérico válido.");
      return;
    }

    setCheckedValue(rangeValue);
    if (
      (selectedTask.rangeAnswers ?? []).some(
        (rangeAnswer) =>
          Number(rangeValue) >= rangeAnswer.min &&
          Number(rangeValue) <= rangeAnswer.max,
      )
    ) {
      toast.success("Respuesta correcta");
    } else {
      toast.error("Respuesta incorrecta");
    }
  };

  const handleReset = () => {
    setSelectedAnswerId("");
    setCheckedValue("");
    setShortAnswer("");
    setRangeValue("");
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {!selectedTask && (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>No hay una tarea seleccionada</AlertTitle>
          <AlertDescription>
            Abre el probador desde una tarea específica para verla en esta vista.
          </AlertDescription>
        </Alert>
      )}

      {selectedTask && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-5">
          <div className="flex flex-wrap gap-2">
            {selectedTask.categories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
            <Badge variant="outline">{buildAgeSummary(selectedTask.difficulties)}</Badge>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {selectedTask.title}
            </h1>
            <TaskContentRenderer blocks={selectedTask.bodyBlocks} />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold sm:text-2xl">Pregunta o desafío</h2>
            <TaskContentRenderer blocks={selectedTask.challengeBlocks} />
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold sm:text-2xl">Respuestas</h2>

            {(selectedTask.answerType ?? "multiple_choice") === "multiple_choice" && (
              <div className="flex flex-col gap-3 sm:gap-4">
                {displayedAnswers.map((answer) => {
                  const selected = selectedAnswerId === answer.id;
                  const checked = checkedValue === answer.id;
                  const correct =
                    checked && answer.id === selectedTask.correctAnswerId;
                  const incorrect =
                    checked && answer.id !== selectedTask.correctAnswerId;

                  return (
                    <button
                      key={answer.id}
                      className={cn(
                        "rounded-xl border bg-background px-3 py-3 text-left transition sm:px-5 sm:py-4",
                        selected ? "border-primary bg-accent/40" : "border-border",
                        correct && "border-primary",
                        incorrect && "border-destructive/50",
                      )}
                      type="button"
                      onClick={() => setSelectedAnswerId(answer.id)}
                    >
                      <div className="min-w-0">
                        <TaskContentRenderer blocks={answer.blocks} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {(selectedTask.answerType ?? "multiple_choice") === "short_text" && (
              <div className="flex max-w-md flex-col gap-3">
                <Input
                  placeholder="Escribe tu respuesta"
                  value={shortAnswer}
                  onChange={(event) => setShortAnswer(event.target.value)}
                />
              </div>
            )}

            {(selectedTask.answerType ?? "multiple_choice") === "range" && (
              <div className="flex max-w-md flex-col gap-4">
                <Input
                  placeholder="Escribe un valor numérico"
                  type="number"
                  value={rangeValue}
                  onChange={(event) => setRangeValue(event.target.value)}
                />
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  {(selectedTask.rangeAnswers ?? []).map((rangeAnswer) => (
                    <p key={rangeAnswer.id}>
                      {rangeAnswer.label}: {rangeAnswer.min} a {rangeAnswer.max}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          {checkedValue && (
            <Alert
              variant={isCorrect ? "default" : "destructive"}
              className="gap-3"
            >
              <AlertCircleIcon />
              <AlertTitle>{isCorrect ? "Correcto" : "Incorrecto"}</AlertTitle>
              <AlertDescription>{selectedTask.explanation}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {getQuestionSummary(selectedTask.challengeBlocks)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={handleReset}>
                <RotateCcwIcon data-icon="inline-start" />
                Reiniciar
              </Button>
              <Button type="button" onClick={handleCheckAnswer}>
                Probar respuesta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

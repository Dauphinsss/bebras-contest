"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { DragDropPlayer } from "@/components/drag-drop-player";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listTasks } from "@/lib/tasks-api";
import {
  buildAgeSummary,
  getQuestionSummary,
  parseMultipleChoiceCorrectness,
  type OptionKey,
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
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<OptionKey[]>([]);
  const [checkedValue, setCheckedValue] = useState("");
  const [shortAnswer, setShortAnswer] = useState("");
  const [rangeValue, setRangeValue] = useState("");
  const [dragDropPlacements, setDragDropPlacements] = useState<
    Record<string, { x: number; y: number }>
  >({});

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
        toast.error("No se pudieron cargar las tareas.");
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
      const { mode, correctOptionIds } = parseMultipleChoiceCorrectness(
        selectedTask.correctAnswerId,
      );
      const checkedIds = checkedValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) as OptionKey[];

      if (mode === "single") {
        return checkedIds[0] === correctOptionIds[0];
      }

      if (mode === "any") {
        return checkedIds.some((id) => correctOptionIds.includes(id));
      }

      if (checkedIds.length !== correctOptionIds.length) {
        return false;
      }

      return checkedIds.every((id) => correctOptionIds.includes(id));
    }

    if (answerType === "short_text") {
      return (
        checkedValue.trim().toLowerCase() ===
        (selectedTask.shortAnswer ?? "").trim().toLowerCase()
      );
    }

    if (answerType === "drag_drop") {
      return (selectedTask.dragDropItems ?? []).every((item) => {
        const placement = dragDropPlacements[item.id];

        if (!placement) {
          return false;
        }

        return (
          Math.abs(placement.x - item.targetX) <= item.tolerance &&
          Math.abs(placement.y - item.targetY) <= item.tolerance
        );
      });
    }

    const numericValue = Number(checkedValue);
    if (Number.isNaN(numericValue)) {
      return false;
    }

    return (selectedTask.rangeAnswers ?? []).some(
      (rangeAnswer) =>
        numericValue >= rangeAnswer.min && numericValue <= rangeAnswer.max,
    );
  }, [checkedValue, dragDropPlacements, selectedTask]);

  const handleCheckAnswer = () => {
    if (!selectedTask) {
      return;
    }

    const answerType = selectedTask.answerType ?? "multiple_choice";

    if (answerType === "multiple_choice") {
      if (selectedAnswerIds.length === 0) {
        toast.error("Selecciona una respuesta antes de probar la tarea.");
        return;
      }

      const { mode, correctOptionIds } = parseMultipleChoiceCorrectness(
        selectedTask.correctAnswerId,
      );
      const nextCheckedValue = [...selectedAnswerIds].sort().join(",");
      setCheckedValue(nextCheckedValue);

      const hasAnyCorrect = selectedAnswerIds.some((id) => correctOptionIds.includes(id));
      const hasAllCorrect =
        selectedAnswerIds.length === correctOptionIds.length &&
        selectedAnswerIds.every((id) => correctOptionIds.includes(id));
      const correctInSingleMode = selectedAnswerIds[0] === correctOptionIds[0];

      const success =
        mode === "single"
          ? correctInSingleMode
          : mode === "any"
            ? hasAnyCorrect
            : hasAllCorrect;

      if (success) {
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

    if (answerType === "drag_drop") {
      if ((selectedTask.dragDropItems ?? []).some((item) => !dragDropPlacements[item.id])) {
        toast.error("Debes colocar todos los objetos antes de verificar.");
        return;
      }

      setCheckedValue("drag_drop");
      if (
        (selectedTask.dragDropItems ?? []).every((item) => {
          const placement = dragDropPlacements[item.id];
          return (
            placement &&
            Math.abs(placement.x - item.targetX) <= item.tolerance &&
            Math.abs(placement.y - item.targetY) <= item.tolerance
          );
        })
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
    setSelectedAnswerIds([]);
    setCheckedValue("");
    setShortAnswer("");
    setRangeValue("");
    setDragDropPlacements({});
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
        <Card className="mx-auto w-full max-w-4xl">
          <CardContent className="flex flex-col gap-6 pt-6 sm:gap-7">
            <div className="flex flex-wrap gap-2">
              {selectedTask.categories.map((category) => (
                <Badge key={category} variant="secondary">
                  {category}
                </Badge>
              ))}
              <Badge variant="outline">
                {buildAgeSummary(selectedTask.difficulties)}
              </Badge>
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {selectedTask.title}
              </h1>
              <TaskContentRenderer
                blocks={selectedTask.bodyBlocks}
                className="gap-5"
              />
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold sm:text-2xl">Pregunta o desafío</h2>
              <TaskContentRenderer
                blocks={selectedTask.challengeBlocks}
                className="gap-5"
              />
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold sm:text-2xl">Respuestas</h2>

              {(selectedTask.answerType ?? "multiple_choice") === "multiple_choice" && (
                <div className="flex flex-col gap-3 sm:gap-4">
                  {displayedAnswers.map((answer) => {
                    const { mode, correctOptionIds } = parseMultipleChoiceCorrectness(
                      selectedTask.correctAnswerId,
                    );
                    const selected = selectedAnswerIds.includes(answer.id);
                    const checkedIds = checkedValue
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean) as OptionKey[];
                    const checked = checkedIds.includes(answer.id);
                    const isCorrectOption = correctOptionIds.includes(answer.id);
                    const correct = checked && isCorrectOption;
                    const incorrect = checked && !isCorrectOption;

                    return (
                      <Card
                        key={answer.id}
                        className={cn(
                          "cursor-pointer transition",
                          selected ? "border-primary bg-primary/5" : "border-border",
                          correct && "border-primary bg-primary/5",
                          incorrect && "border-destructive/50 bg-destructive/5",
                        )}
                      >
                        <button
                          className="block w-full text-left"
                          type="button"
                          onClick={() =>
                            setSelectedAnswerIds((current) => {
                              if (mode === "single") {
                                return [answer.id];
                              }

                              return current.includes(answer.id)
                                ? current.filter((item) => item !== answer.id)
                                : [...current, answer.id];
                            })
                          }
                        >
                          <CardContent className="pt-6">
                            <div className="min-w-0">
                              <TaskContentRenderer
                                blocks={answer.blocks}
                                className="gap-3"
                              />
                            </div>
                          </CardContent>
                        </button>
                      </Card>
                    );
                  })}
                </div>
              )}

              {(selectedTask.answerType ?? "multiple_choice") === "short_text" && (
                <div className="flex max-w-lg flex-col gap-3">
                  <Input
                    placeholder="Escribe tu respuesta"
                    value={shortAnswer}
                    onChange={(event) => setShortAnswer(event.target.value)}
                  />
                </div>
              )}

              {(selectedTask.answerType ?? "multiple_choice") === "range" && (
                <div className="flex max-w-lg flex-col gap-4">
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

              {(selectedTask.answerType ?? "multiple_choice") === "drag_drop" &&
                selectedTask.dragDropBackground && (
                  <DragDropPlayer
                    backgroundUrl={selectedTask.dragDropBackground.url}
                    items={selectedTask.dragDropItems}
                    placements={dragDropPlacements}
                    onPlaceItem={(itemId, placement) =>
                      setDragDropPlacements((current) => ({
                        ...current,
                        [itemId]: placement,
                      }))
                    }
                    onResetItem={(itemId) =>
                      setDragDropPlacements((current) => {
                        const next = { ...current };
                        delete next[itemId];
                        return next;
                      })
                    }
                  />
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

            <div className="flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {getQuestionSummary(selectedTask.challengeBlocks)}
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-nowrap">
                <Button type="button" variant="outline" onClick={handleReset}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Reiniciar
                </Button>
                <Button type="button" onClick={handleCheckAnswer}>
                  Probar respuesta
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

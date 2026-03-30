"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listTasks } from "@/lib/tasks-api";
import {
  buildAgeSummary,
  getQuestionSummary,
  type StoredTask,
} from "@/lib/task-schema";

export function TaskTester() {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedAnswerId, setSelectedAnswerId] = useState("");
  const [checkedAnswerId, setCheckedAnswerId] = useState("");

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

  const isCorrect =
    selectedTask !== null &&
    checkedAnswerId.length > 0 &&
    checkedAnswerId === selectedTask.correctAnswerId;

  const handleCheckAnswer = () => {
    if (!selectedTask) {
      return;
    }

    if (!selectedAnswerId) {
      toast.error("Selecciona una respuesta antes de probar la tarea.");
      return;
    }

    setCheckedAnswerId(selectedAnswerId);

    if (selectedAnswerId === selectedTask.correctAnswerId) {
      toast.success("Respuesta correcta");
      return;
    }

    toast.error("Respuesta incorrecta");
  };

  const handleReset = () => {
    setSelectedAnswerId("");
    setCheckedAnswerId("");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Probador</CardTitle>
          <CardDescription>
            Selecciona una tarea cargada y pruébala con el render final.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="max-w-sm">
            <Select
              value={selectedTaskId}
              onValueChange={(value) => {
                setSelectedTaskId(value);
                setSelectedAnswerId("");
                setCheckedAnswerId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una tarea" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedTask && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{selectedTask.category}</Badge>
              <Badge variant="outline">
                {buildAgeSummary(selectedTask.difficulties)}
              </Badge>
            </div>
            <CardTitle className="pt-2 text-3xl font-semibold">
              {selectedTask.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-10 pt-8">
            <section className="flex flex-col gap-4">
              <TaskContentRenderer blocks={selectedTask.bodyBlocks} />
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold">Pregunta o desafío</h2>
              <TaskContentRenderer blocks={selectedTask.challengeBlocks} />
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-2xl font-semibold">Respuestas</h2>
              <div className="flex flex-col gap-4">
                {selectedTask.answers.map((answer) => {
                  const selected = selectedAnswerId === answer.id;
                  const checked = checkedAnswerId === answer.id;
                  const correct = checked && answer.id === selectedTask.correctAnswerId;
                  const incorrect =
                    checked && answer.id !== selectedTask.correctAnswerId;

                  return (
                    <button
                      key={answer.id}
                      className={[
                        "rounded-2xl border px-5 py-4 text-left transition",
                        selected ? "border-primary bg-accent/50" : "border-border/70",
                        correct ? "border-primary" : "",
                        incorrect ? "border-destructive/50" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      onClick={() => setSelectedAnswerId(answer.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="pt-1">
                          <span className="block size-4 rounded-full border border-muted-foreground">
                            {selected && (
                              <span className="m-[3px] block size-2 rounded-full bg-primary" />
                            )}
                          </span>
                        </div>
                        <div className="flex-1">
                          <TaskContentRenderer blocks={answer.blocks} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {checkedAnswerId && (
              <section className="flex flex-col gap-3 rounded-2xl bg-muted/50 px-5 py-4">
                <h2 className="text-lg font-semibold">
                  {isCorrect ? "Correcto" : "Incorrecto"}
                </h2>
                <p className="leading-7">{selectedTask.explanation}</p>
              </section>
            )}
          </CardContent>

          <CardFooter className="justify-between border-t pt-6">
            <p className="text-sm text-muted-foreground">
              {getQuestionSummary(selectedTask.challengeBlocks)}
            </p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleReset}>
                <RotateCcwIcon data-icon="inline-start" />
                Reiniciar
              </Button>
              <Button type="button" onClick={handleCheckAnswer}>
                Probar respuesta
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

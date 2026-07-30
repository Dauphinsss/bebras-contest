"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  LoaderCircleIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { TaskContentRenderer } from "@/components/task-content-renderer";
import { PlayTaskFields } from "@/components/play-task-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  checkPracticeAnswer,
  getPracticeTask,
  type PracticeCheck,
} from "@/lib/practice-api";
import { answerHasResponse, type PlayTask } from "@/lib/play-api";
import {
  practiceCategoryHref,
  practiceOrigin,
} from "@/lib/practice-navigation";

export function PracticeSolver() {
  const [taskId] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("id") ?? "").trim()
      : "",
  );
  const [backHref] = useState(() => {
    if (typeof window === "undefined") {
      return "/practica";
    }

    const params = new URLSearchParams(window.location.search);
    const category = (params.get("nombre") ?? "").trim();
    const origin = practiceOrigin(params.get("from"));
    return category ? practiceCategoryHref(category, origin) : origin;
  });
  const [task, setTask] = useState<PlayTask | null>(null);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState<unknown>(undefined);
  const [result, setResult] = useState<PracticeCheck | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!taskId) {
      return;
    }
    let active = true;
    getPracticeTask(taskId)
      .then((data) => {
        if (active) {
          setTask(data);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  const check = () => {
    if (!task || !answerHasResponse(task.answerType, answer)) {
      return;
    }

    setChecking(true);
    checkPracticeAnswer(taskId, answer)
      .then((data) => setResult(data))
      .catch((error) => {
        setResult(null);
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo comprobar la respuesta.",
        );
      })
      .finally(() => setChecking(false));
  };

  const retry = () => {
    setResult(null);
    setAnswer(undefined);
  };

  if (!taskId || failed) {
    return (
      <Alert>
        <AlertTitle>No se encontró el desafío</AlertTitle>
        <AlertDescription>
          Es posible que ya no esté disponible.
        </AlertDescription>
      </Alert>
    );
  }

  if (task === null) {
    return (
      <div className="flex justify-center py-10">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">{task.title}</h1>
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
            value={answer}
            onChange={setAnswer}
            disabled={result !== null}
          />
        </CardContent>
      </Card>

      {result && (
        <Alert variant={result.correct ? "default" : "destructive"}>
          {result.correct ? (
            <CheckCircle2Icon className="size-4" />
          ) : (
            <XCircleIcon className="size-4" />
          )}
          <AlertTitle>
            {result.correct ? "¡Correcto!" : "Respuesta incorrecta"}
          </AlertTitle>
          {result.explanation && (
            <AlertDescription>{result.explanation}</AlertDescription>
          )}
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.location.href = backHref;
          }}
        >
          Volver
        </Button>
        {result ? (
          <Button type="button" onClick={retry}>
            <RotateCcwIcon data-icon="inline-start" />
            Intentar de nuevo
          </Button>
        ) : (
          <Button
            type="button"
            disabled={checking || !answerHasResponse(task.answerType, answer)}
            onClick={check}
          >
            {checking ? "Verificando..." : "Comprobar"}
          </Button>
        )}
      </div>
    </div>
  );
}

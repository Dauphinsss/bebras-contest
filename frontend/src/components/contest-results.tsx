"use client";

import { useEffect, useState } from "react";
import {
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  getContestResults,
  publishContestResults,
  type ContestResultRow,
  type ContestResults,
  unpublishContestResults,
} from "@/lib/contests-api";
import { CONTEST_STATE_LABELS, gradeLabel } from "@/lib/contest-schema";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  pending: "Sin empezar",
  in_progress: "En curso",
  finished: "Terminado",
};

type VisibilityAction = "publish" | "unpublish";

const VISIBILITY_COPY: Record<
  VisibilityAction,
  { title: string; description: string; confirm: string; success: string }
> = {
  publish: {
    title: "¿Publicar los resultados?",
    description:
      "Los participantes podrán consultar la información habilitada. Revisa los puntajes y el ranking antes de continuar.",
    confirm: "Publicar resultados",
    success: "Resultados publicados. Los participantes ya pueden verlos.",
  },
  unpublish: {
    title: "¿Ocultar los resultados?",
    description:
      "Los participantes dejarán de ver sus resultados hasta que vuelvan a publicarse. Los puntajes guardados no se eliminarán.",
    confirm: "Ocultar resultados",
    success: "Resultados ocultados.",
  },
};

function teamName(row: ContestResultRow) {
  const one = `${row.memberOneFirstName} ${row.memberOneLastName}`.trim();
  if (row.participationMode === "pareja" && row.memberTwoFirstName) {
    return `${one} · ${row.memberTwoFirstName} ${row.memberTwoLastName ?? ""}`.trim();
  }
  return one;
}

function formatElapsed(seconds: number | null) {
  if (seconds === null) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportCsv(results: ContestResults) {
  const header = [
    "Posicion",
    "Nombres",
    "Apellidos",
    "Nombres 2",
    "Apellidos 2",
    "Curso",
    "Grupo",
    "Modalidad",
    "Estado",
    "Tiempo (s)",
    "Puntaje",
    "Correctas",
    "Respondidas",
  ];
  const lines = results.rows.map((row) =>
    [
      row.rankPosition,
      row.memberOneFirstName,
      row.memberOneLastName,
      row.memberTwoFirstName ?? "",
      row.memberTwoLastName ?? "",
      gradeLabel(row.grade),
      row.groupName,
      row.participationMode,
      STATUS_LABEL[row.status] ?? row.status,
      row.elapsedSeconds,
      row.totalScore,
      row.correctCount,
      row.answeredCount,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resultados-${results.contestTitle.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContestResults() {
  const [contestId] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null,
  );
  const [results, setResults] = useState<ContestResults | null>(null);
  const [loading, setLoading] = useState(Boolean(contestId));
  const [confirming, setConfirming] = useState<VisibilityAction | null>(null);
  const [changingVisibility, setChangingVisibility] = useState(false);

  useEffect(() => {
    if (!contestId) {
      return;
    }
    let active = true;
    void getContestResults(contestId)
      .then((data) => {
        if (active) {
          setResults(data);
        }
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los resultados.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [contestId]);

  const changeVisibility = async () => {
    if (!contestId || !confirming) {
      return;
    }

    const action = confirming;
    setConfirming(null);
    setChangingVisibility(true);

    try {
      const updated =
        action === "publish"
          ? await publishContestResults(contestId)
          : await unpublishContestResults(contestId);
      setResults((current) =>
        current ? { ...current, state: updated.state } : current,
      );
      toast.success(VISIBILITY_COPY[action].success);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la visibilidad de los resultados.",
      );
    } finally {
      setChangingVisibility(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!results) {
    return (
      <Alert>
        <AlertTitle>Competencia no encontrada</AlertTitle>
        <AlertDescription>
          Abre los resultados desde una competencia.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-start gap-2">
              <CardTitle>{results.contestTitle}</CardTitle>
              <CardDescription>
                {results.rows.length} participante(s) · {results.taskCount} tarea(s)
              </CardDescription>
              <Badge variant="secondary">
                {CONTEST_STATE_LABELS[results.state]}
              </Badge>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              {results.state === "consolidada" && (
                <Button
                  type="button"
                  disabled={changingVisibility}
                  className="w-full sm:w-auto"
                  onClick={() => setConfirming("publish")}
                >
                  <EyeIcon data-icon="inline-start" />
                  Publicar resultados
                </Button>
              )}
              {results.state === "publicada" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={changingVisibility}
                  className="w-full sm:w-auto"
                  onClick={() => setConfirming("unpublish")}
                >
                  <EyeOffIcon data-icon="inline-start" />
                  Ocultar resultados
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={results.rows.length === 0}
                className="w-full sm:w-auto"
                onClick={() => exportCsv(results)}
              >
                <DownloadIcon data-icon="inline-start" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {results.rows.length === 0 ? (
            <Alert>
              <AlertTitle>Aún no hay participantes</AlertTitle>
              <AlertDescription>
                Cuando los estudiantes entren y rindan, aparecerán aquí.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Participante</th>
                    <th className="px-3 py-2 font-semibold">Curso</th>
                    <th className="px-3 py-2 font-semibold">Grupo</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Tiempo
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Puntaje
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Correctas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row) => (
                    <tr key={row.teamId} className="border-b">
                      <td className="px-3 py-2 font-medium">
                        {row.rankPosition ?? "—"}
                      </td>
                      <td className="px-3 py-2">{teamName(row)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {gradeLabel(row.grade)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {row.groupName}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            row.status === "finished" ? "secondary" : "outline"
                          }
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatElapsed(row.elapsedSeconds)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {row.totalScore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.correctCount ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming ? VISIBILITY_COPY[confirming].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming ? VISIBILITY_COPY[confirming].description : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={changeVisibility}>
              {confirming ? VISIBILITY_COPY[confirming].confirm : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

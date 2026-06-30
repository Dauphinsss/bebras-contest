"use client";

import { useEffect, useState } from "react";
import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import {
  getContestResults,
  type ContestResultRow,
  type ContestResults,
} from "@/lib/contests-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

function teamName(row: ContestResultRow) {
  const one = `${row.memberOneFirstName} ${row.memberOneLastName}`.trim();
  if (row.participationMode === "pareja" && row.memberTwoFirstName) {
    return `${one} · ${row.memberTwoFirstName} ${row.memberTwoLastName ?? ""}`.trim();
  }
  return one;
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
    "Grupo",
    "Modalidad",
    "Estado",
    "Puntaje",
    "Correctas",
    "Respondidas",
  ];
  const lines = results.rows.map((row) =>
    [
      row.rankPosition,
      row.memberOneFirstName,
      row.memberOneLastName,
      row.groupName,
      row.participationMode,
      STATUS_LABEL[row.status] ?? row.status,
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
  link.download = `resultados-${results.contestTitle}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContestResults() {
  const [results, setResults] = useState<ContestResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("id")
        : null;
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    void getContestResults(id)
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
  }, []);

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
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{results.contestTitle}</CardTitle>
            <CardDescription>
              {results.rows.length} participante(s) · {results.taskCount} tarea(s)
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={results.rows.length === 0}
            onClick={() => exportCsv(results)}
          >
            <DownloadIcon data-icon="inline-start" />
            Exportar CSV
          </Button>
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
                  <th className="px-3 py-2 font-semibold">Grupo</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 text-right font-semibold">Puntaje</th>
                  <th className="px-3 py-2 text-right font-semibold">Correctas</th>
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
  );
}

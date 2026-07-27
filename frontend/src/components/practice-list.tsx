"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";

import { listPracticeTasks, type PracticeTaskList } from "@/lib/practice-api";

export function PracticeList() {
  const [category] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("nombre") ?? "").trim()
      : "",
  );
  const [data, setData] = useState<PracticeTaskList | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!category) {
      setFailed(true);
      return;
    }
    let active = true;
    listPracticeTasks(category)
      .then((result) => {
        if (active) {
          setData(result);
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
  }, [category]);

  if (failed) {
    return (
      <p className="rounded-md border bg-secondary/20 px-4 py-6 text-center text-sm text-muted-foreground">
        No se encontró esta categoría.
      </p>
    );
  }

  if (data === null) {
    return (
      <div className="flex justify-center py-6">
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">{data.category}</h2>
        <p className="text-sm text-muted-foreground">{data.age}</p>
      </div>

      {data.tasks.length === 0 ? (
        <p className="rounded-md border bg-secondary/20 px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay desafíos en esta categoría.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.tasks.map((task, index) => (
            <a
              key={task.id}
              href={`/practica/tarea?id=${task.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-4 transition hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-medium">
                  {index + 1}
                </span>
                <span className="font-medium">{task.title}</span>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

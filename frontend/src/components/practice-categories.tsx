"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  listPracticeCategories,
  type PracticeCategory,
} from "@/lib/practice-api";
import { ApiError } from "@/lib/api-client";
import {
  practiceCategoryHref,
  practiceOrigin,
} from "@/lib/practice-navigation";

export function PracticeCategories() {
  const [categories, setCategories] = useState<PracticeCategory[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Durante la inscripción la práctica queda cerrada: es un estado previsto, no
  // un error, y reintentar no cambiaría nada.
  const [closed, setClosed] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [origin] = useState(() =>
    typeof window === "undefined"
      ? "/practica"
      : practiceOrigin(window.location.pathname),
  );

  useEffect(() => {
    let active = true;
    listPracticeCategories()
      .then((data) => {
        if (active) {
          setCategories(data);
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const restricted =
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403);
        setClosed(restricted);
        setFailed(!restricted);
      });
    return () => {
      active = false;
    };
  }, [requestVersion]);

  if (closed) {
    return (
      <p className="rounded-md border bg-secondary/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Los desafíos de práctica no están disponibles por ahora. Mientras tanto
        está abierta la inscripción de maestros.
      </p>
    );
  }

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border bg-secondary/20 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          No pudimos cargar los desafíos de práctica.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setCategories(null);
            setFailed(false);
            setClosed(false);
            setRequestVersion((version) => version + 1);
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (categories === null) {
    return (
      <div className="flex justify-center py-6">
        <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="rounded-md border bg-secondary/20 px-4 py-6 text-center text-sm text-muted-foreground">
        Aún no hay desafíos de práctica disponibles. Vuelve pronto.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {categories.map((category) => (
        <a
          key={category.name}
          href={practiceCategoryHref(category.name, origin)}
          className="flex items-center justify-between gap-4 rounded-lg border px-4 py-4 transition hover:border-primary/50"
        >
          <div>
            <div className="font-medium">{category.name}</div>
            <div className="text-sm text-muted-foreground">{category.age}</div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {category.count} {category.count === 1 ? "desafío" : "desafíos"}
            <ChevronRightIcon className="size-4" />
          </div>
        </a>
      ))}
    </div>
  );
}

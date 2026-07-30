"use client";

import { useEffect, useState } from "react";
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  listPracticeCategories,
  type PracticeCategory,
} from "@/lib/practice-api";

export function PracticeCategories() {
  const [categories, setCategories] = useState<PracticeCategory[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    let active = true;
    listPracticeCategories()
      .then((data) => {
        if (active) {
          setCategories(data);
          setFailed(false);
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
  }, [requestVersion]);

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
          href={`/practica/categoria?nombre=${encodeURIComponent(category.name)}`}
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

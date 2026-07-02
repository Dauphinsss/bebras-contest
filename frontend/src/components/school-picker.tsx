"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, LoaderCircleIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchSchools, type SchoolResult } from "@/lib/schools-api";
import { cn } from "@/lib/utils";

export type SchoolValue = {
  codUe: string | null;
  name: string;
};

export function SchoolPicker({
  value,
  onChange,
}: {
  value: SchoolValue;
  onChange: (next: SchoolValue) => void;
}) {
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState(value.codUe ? value.name : "");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (manual || value.codUe) {
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => {
      setLoading(true);
      void searchSchools(query)
        .then((found) => {
          setResults(found);
          setOpen(true);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [query, manual, value.codUe]);

  if (manual) {
    return (
      <div className="flex flex-col gap-2">
        <Input
          id="school-manual"
          value={value.name}
          onChange={(event) => onChange({ codUe: null, name: event.target.value })}
          placeholder="Nombre de tu colegio o de tu educación en casa"
        />
        <button
          type="button"
          onClick={() => {
            setManual(false);
            onChange({ codUe: null, name: "" });
            setQuery("");
          }}
          className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Buscar mi colegio en la lista
        </button>
      </div>
    );
  }

  if (value.codUe) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-md border bg-secondary/30 px-3 py-2 text-sm">
          <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
          <span className="font-medium">{value.name}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange({ codUe: null, name: "" });
            setQuery("");
            setResults([]);
          }}
          className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Cambiar colegio
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />
        <Input
          id="school-search"
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Escribe el nombre de tu colegio"
          autoComplete="off"
        />
        {loading && (
          <LoaderCircleIcon className="absolute inset-y-0 right-3 my-auto size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="flex flex-col overflow-hidden rounded-md border bg-background">
          {results.length === 0 && !loading ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No se encontraron colegios con ese nombre.
            </p>
          ) : (
            results.map((school) => (
              <button
                key={school.codUe}
                type="button"
                onClick={() => {
                  onChange({ codUe: school.codUe, name: school.name });
                  setOpen(false);
                }}
                className={cn(
                  "flex flex-col gap-0.5 border-b px-3 py-2 text-left transition last:border-b-0 hover:bg-muted",
                )}
              >
                <span className="text-sm font-medium">{school.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[school.sec, school.dep].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setManual(true);
          onChange({ codUe: null, name: "" });
        }}
        className="self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        No encuentro mi colegio o enseño en casa
      </button>
    </div>
  );
}

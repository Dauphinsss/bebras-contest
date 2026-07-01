"use client";

import { useEffect, useState } from "react";
import { CalendarClockIcon, CircleCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

type PublicContest = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  state: "programada" | "abierta" | "cerrada";
  isOpen: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("es-BO", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("es-BO", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${dateFormatter.format(date)} a las ${timeFormatter.format(date)}`;
}

function countdown(target: string) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) {
    return null;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) {
    return `Faltan ${days} ${days === 1 ? "día" : "días"}`;
  }
  if (hours > 0) {
    return `Faltan ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return `Faltan ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

export function LiveContests() {
  const [contests, setContests] = useState<PublicContest[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`${API_BASE_URL}/api/public-contests`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("no disponible");
        }
        return response.json() as Promise<PublicContest[]>;
      })
      .then((data) => {
        if (active) {
          setContests(data);
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
  }, []);

  if (failed || contests === null) {
    return null;
  }

  const open = contests.filter((contest) => contest.state === "abierta");
  const upcoming = contests.filter((contest) => contest.state === "programada");
  const next = upcoming[0] ?? null;

  if (open.length === 0 && !next) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {open.map((contest) => (
        <div
          key={contest.id}
          className="rounded-lg border border-primary/40 bg-primary/5 px-5 py-5"
        >
          <div className="flex items-center gap-2 text-primary">
            <CircleCheckIcon className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Disponible ahora
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold">{contest.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {contest.category ? `${contest.category} · ` : ""}Tienes{" "}
            {contest.durationMinutes} minutos para rendir una vez que empieces.
          </p>
          <Button asChild className="mt-4">
            <a href="/entrar">Entrar a la competencia</a>
          </Button>
        </div>
      ))}

      {open.length === 0 && next && (
        <div className="rounded-lg border px-5 py-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClockIcon className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Próxima competencia
            </span>
            {countdown(next.startsAt) && (
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {countdown(next.startsAt)}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-semibold">{next.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {next.category ? `${next.category} · ` : ""}Comienza el{" "}
            {formatDateTime(next.startsAt)}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

type GroupInfo = {
  groupName: string;
  contestTitle: string;
  contestCategory: string;
  allowPairs: boolean;
  durationMinutes: number;
  state: string;
};

type JoinResult = {
  personalCode: string;
  groupName: string;
  contestTitle: string;
};

type RecoveredTeam = {
  personalCode: string;
  participationMode: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  groupName: string;
  contestTitle: string;
};

type Step = "code" | "register" | "confirm" | "recovered" | "done";

function fmt(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s|-)(\p{L})/gu, (_match, sep, letter) => sep + letter.toUpperCase());
}

function nameKey(first: string, last: string) {
  const norm = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  return `${norm(first)} ${norm(last)}`;
}

export function JoinForm() {
  const [step, setStep] = useState<Step>("code");
  const [accessCode, setAccessCode] = useState("");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [mode, setMode] = useState<"individual" | "pareja">("individual");
  const [oneFirst, setOneFirst] = useState("");
  const [oneLast, setOneLast] = useState("");
  const [twoFirst, setTwoFirst] = useState("");
  const [twoLast, setTwoLast] = useState("");
  const [result, setResult] = useState<JoinResult | null>(null);
  const [recovered, setRecovered] = useState<RecoveredTeam | null>(null);
  const [loading, setLoading] = useState(false);

  const performLookup = async (rawCode: string, silent = false) => {
    const code = rawCode.trim().toUpperCase();

    if (!code) {
      if (!silent) {
        toast.error("Escribe el código que te dio tu maestro.");
      }
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/play/group/${code}`);
      const data = (await response.json().catch(() => ({}))) as
        | GroupInfo
        | { message?: string };

      if (!response.ok) {
        if (!silent) {
          toast.error(
            ("message" in data && data.message) || "No se pudo validar el código.",
          );
        }
        return;
      }

      setGroup(data as GroupInfo);
      setMode("individual");

      // Recuperación: si en este navegador ya hay un registro para este código,
      // lo validamos y mostramos el estado en vez de volver a registrar.
      const storedCode = window.localStorage.getItem(`bebras_play_${code}`);
      if (storedCode) {
        try {
          const teamResponse = await fetch(
            `${API_BASE_URL}/api/play/team/${storedCode}`,
          );
          if (teamResponse.ok) {
            setRecovered((await teamResponse.json()) as RecoveredTeam);
            setStep("recovered");
            return;
          }
          window.localStorage.removeItem(`bebras_play_${code}`);
        } catch {
          // Si falla la validación, seguimos al registro normal.
        }
      }

      setStep("register");
    } catch {
      if (!silent) {
        toast.error("No se pudo conectar con el servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  const registerAnother = () => {
    window.localStorage.removeItem(
      `bebras_play_${accessCode.trim().toUpperCase()}`,
    );
    setRecovered(null);
    setMode("individual");
    setOneFirst("");
    setOneLast("");
    setTwoFirst("");
    setTwoLast("");
    setStep("register");
  };

  // Si llega ?code=XXXX en el enlace, prellena y valida automáticamente.
  useEffect(() => {
    const urlCode = new URLSearchParams(window.location.search)
      .get("code")
      ?.trim()
      .toUpperCase();

    if (urlCode) {
      setAccessCode(urlCode);
      void performLookup(urlCode, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performLookup(accessCode);
  };

  const goToConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!oneFirst.trim() || !oneLast.trim()) {
      toast.error("Tus nombres y apellidos son obligatorios.");
      return;
    }

    if (mode === "pareja" && (!twoFirst.trim() || !twoLast.trim())) {
      toast.error("Faltan los nombres y apellidos del segundo integrante.");
      return;
    }

    if (
      mode === "pareja" &&
      nameKey(oneFirst, oneLast) === nameKey(twoFirst, twoLast)
    ) {
      toast.error("Los dos integrantes no pueden ser la misma persona.");
      return;
    }

    setStep("confirm");
  };

  const join = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/play/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: accessCode.trim().toUpperCase(),
          participationMode: mode,
          memberOneFirstName: fmt(oneFirst),
          memberOneLastName: fmt(oneLast),
          memberTwoFirstName: fmt(twoFirst),
          memberTwoLastName: fmt(twoLast),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | JoinResult
        | { message?: string };

      if (!response.ok) {
        toast.error(("message" in data && data.message) || "No se pudo registrar.");
        setStep("register");
        return;
      }

      const joinResult = data as JoinResult;
      try {
        window.localStorage.setItem(
          `bebras_play_${accessCode.trim().toUpperCase()}`,
          joinResult.personalCode,
        );
      } catch {
        // localStorage opcional.
      }
      setResult(joinResult);
      setStep("done");
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "done" && result) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-primary" />
            <CardTitle>¡Listo, te registraste!</CardTitle>
          </div>
          <CardDescription>
            Quedaste inscrito en {result.contestTitle} ({result.groupName}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border bg-secondary/30 px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">
              Tu código de equipo (guárdalo para volver)
            </div>
            <div className="font-mono text-xl font-semibold tracking-widest">
              {result.personalCode}
            </div>
          </div>
          <Button asChild className="w-full">
            <a href={`/rendir?code=${result.personalCode}`}>
              Ir a la competencia
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Si aún no inicia, podrás empezar cuando tu maestro la abra.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (step === "recovered" && recovered) {
    const partner =
      recovered.participationMode === "pareja" && recovered.memberTwoFirstName
        ? ` y ${recovered.memberTwoFirstName} ${recovered.memberTwoLastName ?? ""}`.trim()
        : "";

    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-primary" />
            <CardTitle>Ya estás registrado</CardTitle>
          </div>
          <CardDescription>
            En {recovered.contestTitle} ({recovered.groupName}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border bg-background px-4 py-3 text-sm">
            <div className="font-medium">
              {recovered.memberOneFirstName} {recovered.memberOneLastName}
              {partner}
            </div>
            <div className="text-muted-foreground">
              {recovered.participationMode === "pareja" ? "Pareja" : "Individual"}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/30 px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">
              Tu código de equipo
            </div>
            <div className="font-mono text-xl font-semibold tracking-widest">
              {recovered.personalCode}
            </div>
          </div>
          <Button asChild className="w-full">
            <a href={`/rendir?code=${recovered.personalCode}`}>
              Continuar a la competencia
            </a>
          </Button>
          <button
            type="button"
            onClick={registerAnother}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            ¿No eres tú? Registrar otro equipo
          </button>
        </CardContent>
      </Card>
    );
  }

  if (step === "confirm" && group) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Confirma tus datos</CardTitle>
          <CardDescription>
            Revisa que esté todo correcto antes de entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 rounded-md border bg-background px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Competencia</dt>
              <dd className="text-right font-medium">{group.contestTitle}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Modalidad</dt>
              <dd className="font-medium">
                {mode === "pareja" ? "Pareja" : "Individual"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Integrante 1</dt>
              <dd className="text-right font-medium">
                {fmt(oneFirst)} {fmt(oneLast)}
              </dd>
            </div>
            {mode === "pareja" && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Integrante 2</dt>
                <dd className="text-right font-medium">
                  {fmt(twoFirst)} {fmt(twoLast)}
                </dd>
              </div>
            )}
          </dl>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => setStep("register")}
            >
              Editar
            </Button>
            <Button type="button" disabled={loading} onClick={() => void join()}>
              {loading ? "Entrando..." : "Confirmar y entrar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "register" && group) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{group.contestTitle}</CardTitle>
          <CardDescription>
            {group.groupName}
            {group.contestCategory ? ` · ${group.contestCategory}` : ""} ·{" "}
            {group.durationMinutes} minutos por equipo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={goToConfirm}>
            {group.state === "programada" && (
              <Alert>
                <AlertTitle>La competencia aún no inicia</AlertTitle>
                <AlertDescription>
                  Puedes registrarte ahora; podrás rendir cuando tu maestro la
                  abra.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="one-first">Nombres</FieldLabel>
                <FieldContent>
                  <Input
                    id="one-first"
                    value={oneFirst}
                    onChange={(event) => setOneFirst(event.target.value)}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="one-last">Apellidos</FieldLabel>
                <FieldContent>
                  <Input
                    id="one-last"
                    value={oneLast}
                    onChange={(event) => setOneLast(event.target.value)}
                  />
                </FieldContent>
              </Field>
            </div>

            {group.allowPairs && (
              <Field>
                <FieldLabel>Modalidad</FieldLabel>
                <FieldContent>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={mode === "individual" ? "default" : "outline"}
                      onClick={() => setMode("individual")}
                    >
                      Individual
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "pareja" ? "default" : "outline"}
                      onClick={() => setMode("pareja")}
                    >
                      Pareja
                    </Button>
                  </div>
                </FieldContent>
              </Field>
            )}

            {mode === "pareja" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="two-first">
                    Nombres del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="two-first"
                      value={twoFirst}
                      onChange={(event) => setTwoFirst(event.target.value)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="two-last">
                    Apellidos del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="two-last"
                      value={twoLast}
                      onChange={(event) => setTwoLast(event.target.value)}
                    />
                  </FieldContent>
                </Field>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("code")}
              >
                Volver
              </Button>
              <Button type="submit">Continuar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Entrar a la competencia</CardTitle>
        <CardDescription>
          Escribe el código que te dio tu maestro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={lookupCode}>
          <Field>
            <FieldLabel htmlFor="access-code">Código de grupo</FieldLabel>
            <FieldContent>
              <Input
                id="access-code"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
                placeholder="Ej. K7M2P9"
                className="font-mono tracking-widest uppercase"
                autoComplete="off"
              />
            </FieldContent>
          </Field>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              "Continuar"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

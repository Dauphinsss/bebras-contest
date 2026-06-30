"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

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

export function JoinForm() {
  const [step, setStep] = useState<"code" | "register" | "done">("code");
  const [accessCode, setAccessCode] = useState("");
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [memberOneName, setMemberOneName] = useState("");
  const [memberTwoName, setMemberTwoName] = useState("");
  const [mode, setMode] = useState<"individual" | "pareja">("individual");
  const [result, setResult] = useState<JoinResult | null>(null);
  const [loading, setLoading] = useState(false);

  const lookupCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = accessCode.trim().toUpperCase();

    if (!code) {
      toast.error("Escribe el código que te dio tu maestro.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/play/group/${code}`);
      const data = (await response.json().catch(() => ({}))) as
        | GroupInfo
        | { message?: string };

      if (!response.ok) {
        toast.error(
          ("message" in data && data.message) || "No se pudo validar el código.",
        );
        return;
      }

      setGroup(data as GroupInfo);
      setMode("individual");
      setStep("register");
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!memberOneName.trim()) {
      toast.error("Tu nombre es obligatorio.");
      return;
    }

    if (mode === "pareja" && !memberTwoName.trim()) {
      toast.error("Falta el nombre del segundo integrante.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/play/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessCode: accessCode.trim().toUpperCase(),
          participationMode: mode,
          memberOneName: memberOneName.trim(),
          memberTwoName: memberTwoName.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | JoinResult
        | { message?: string };

      if (!response.ok) {
        toast.error(
          ("message" in data && data.message) || "No se pudo registrar.",
        );
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
          <p className="text-sm text-muted-foreground">
            La competencia se abrirá cuando tu maestro lo indique. (El rendir
            estará disponible pronto.)
          </p>
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
          <form className="flex flex-col gap-4" onSubmit={join}>
            <Field>
              <FieldLabel htmlFor="member-one">Tu nombre</FieldLabel>
              <FieldContent>
                <Input
                  id="member-one"
                  value={memberOneName}
                  onChange={(event) => setMemberOneName(event.target.value)}
                  placeholder="Nombre y apellido"
                />
              </FieldContent>
            </Field>

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
              <Field>
                <FieldLabel htmlFor="member-two">
                  Nombre del segundo integrante
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="member-two"
                    value={memberTwoName}
                    onChange={(event) => setMemberTwoName(event.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </FieldContent>
              </Field>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("code")}
              >
                Volver
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
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

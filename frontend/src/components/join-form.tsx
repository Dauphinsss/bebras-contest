"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE_URL } from "@/lib/api-client";
import {
  forgetPlaySession,
  getAttempt,
  openPlaySession,
  readPlaySession,
  storePlaySession,
} from "@/lib/play-api";

type GroupGrade = {
  value: string;
  label: string;
  category: string;
};

type GroupInfo = {
  groupName: string;
  contestTitle: string;
  contestCategory: string;
  allowPairs: boolean;
  durationMinutes: number;
  grades: GroupGrade[];
  state: string;
};

type JoinResult = {
  personalCode: string;
  groupName: string;
  contestTitle: string;
};

type Step = "code" | "identify" | "register" | "confirm" | "done";

type JoinErrors = {
  code?: string;
  grade?: string;
  oneFirst?: string;
  oneLast?: string;
  twoFirst?: string;
  twoLast?: string;
  form?: string;
};

function fmt(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(
      /(^|\s|-)(\p{L})/gu,
      (_match, sep, letter) => sep + letter.toUpperCase(),
    );
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
  const [grade, setGrade] = useState("");
  const [oneFirst, setOneFirst] = useState("");
  const [oneLast, setOneLast] = useState("");
  const [twoFirst, setTwoFirst] = useState("");
  const [twoLast, setTwoLast] = useState("");
  const [result, setResult] = useState<JoinResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<JoinErrors>({});
  const accessCodeRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLButtonElement>(null);
  const oneFirstRef = useRef<HTMLInputElement>(null);
  const oneLastRef = useRef<HTMLInputElement>(null);
  const twoFirstRef = useRef<HTMLInputElement>(null);
  const twoLastRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const clearErrors = (...fields: (keyof JoinErrors)[]) => {
    setErrors((current) => {
      const next = { ...current, form: undefined };
      fields.forEach((field) => {
        next[field] = undefined;
      });
      return next;
    });
  };

  const performLookup = async (rawCode: string, silent = false) => {
    const code = rawCode.trim().toUpperCase();

    if (!code) {
      if (!silent) {
        setErrors({ code: "Escribe el código que te dio tu maestro." });
        accessCodeRef.current?.focus();
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
          setErrors({
            code:
              ("message" in data && data.message) ||
              "No se pudo validar el código.",
          });
          accessCodeRef.current?.focus();
        }
        return;
      }

      setErrors({});
      setGroup(data as GroupInfo);
      setMode("individual");
      setGrade("");

      if (readPlaySession()) {
        try {
          await getAttempt();
          window.location.href = "/rendir";
          return;
        } catch {
          forgetPlaySession();
        }
      }

      setStep("identify");
    } catch {
      if (!silent) {
        toast.error("No se pudo conectar con el servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  const registerAnother = () => {
    forgetPlaySession();
    setMode("individual");
    setGrade("");
    setOneFirst("");
    setOneLast("");
    setTwoFirst("");
    setTwoLast("");
    setErrors({});
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
  }, []);

  useEffect(() => {
    if (errors.form) {
      formErrorRef.current?.focus();
    }
  }, [errors.form, step]);

  const lookupCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performLookup(accessCode);
  };

  const goToConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: JoinErrors = {
      grade: grade ? undefined : "Elige tu curso.",
      oneFirst: oneFirst.trim() ? undefined : "Ingresa tus nombres.",
      oneLast: oneLast.trim() ? undefined : "Ingresa tus apellidos.",
      twoFirst:
        mode === "pareja" && !twoFirst.trim()
          ? "Ingresa los nombres del segundo integrante."
          : undefined,
      twoLast:
        mode === "pareja" && !twoLast.trim()
          ? "Ingresa los apellidos del segundo integrante."
          : undefined,
    };

    if (
      !nextErrors.twoFirst &&
      !nextErrors.twoLast &&
      mode === "pareja" &&
      nameKey(oneFirst, oneLast) === nameKey(twoFirst, twoLast)
    ) {
      nextErrors.twoFirst = "Debe ser una persona diferente.";
    }

    const firstInvalid = (
      ["grade", "oneFirst", "oneLast", "twoFirst", "twoLast"] as const
    ).find((field) => nextErrors[field]);

    if (firstInvalid) {
      setErrors(nextErrors);
      const refs = {
        grade: gradeRef,
        oneFirst: oneFirstRef,
        oneLast: oneLastRef,
        twoFirst: twoFirstRef,
        twoLast: twoLastRef,
      };
      refs[firstInvalid].current?.focus();
      return;
    }

    setErrors({});
    setStep("confirm");
  };

  const enterWithName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: JoinErrors = {
      oneFirst: oneFirst.trim() ? undefined : "Ingresa tus nombres.",
      oneLast: oneLast.trim() ? undefined : "Ingresa tus apellidos.",
    };

    if (nextErrors.oneFirst || nextErrors.oneLast) {
      setErrors(nextErrors);
      if (nextErrors.oneFirst) {
        oneFirstRef.current?.focus();
      } else {
        oneLastRef.current?.focus();
      }
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const session = await openPlaySession(
        accessCode.trim().toUpperCase(),
        fmt(oneFirst),
        fmt(oneLast),
      );
      storePlaySession(session.sessionToken);
      window.location.href = "/rendir";
    } catch (error) {
      if (error instanceof TypeError) {
        toast.error("No se pudo conectar con el servidor.");
      } else {
        setErrors({
          form: error instanceof Error ? error.message : "No se pudo entrar.",
        });
      }
    } finally {
      setLoading(false);
    }
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
          grade,
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
        setErrors({
          form: ("message" in data && data.message) || "No se pudo registrar.",
        });
        setStep("register");
        return;
      }

      const joinResult = data as JoinResult;

      try {
        const session = await openPlaySession(
          accessCode.trim().toUpperCase(),
          fmt(oneFirst),
          fmt(oneLast),
        );
        storePlaySession(session.sessionToken);
      } catch {
        forgetPlaySession();
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
          <p className="text-sm text-muted-foreground">
            Si vuelves a entrar, usa el código de tu maestro y tu nombre. No
            necesitas guardar ningún código.
          </p>
          <Button asChild className="w-full">
            <a href="/rendir">Ir al desafío</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Si aún no inicia, podrás empezar cuando tu maestro la abra.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (step === "identify" && group) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>¿Quién eres?</CardTitle>
          <CardDescription>
            {group.contestTitle} ({group.groupName}). Escribe tu nombre tal como
            te registraste.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={enterWithName}>
            {errors.form && (
              <Alert ref={formErrorRef} variant="destructive" tabIndex={-1}>
                <AlertDescription>{errors.form}</AlertDescription>
              </Alert>
            )}
            <Field data-invalid={Boolean(errors.oneFirst) || undefined}>
              <FieldLabel htmlFor="student-first-name">Nombres</FieldLabel>
              <FieldContent>
                <Input
                  ref={oneFirstRef}
                  id="student-first-name"
                  autoComplete="given-name"
                  value={oneFirst}
                  onChange={(event) => {
                    setOneFirst(event.target.value);
                    if (errors.oneFirst || errors.form) {
                      clearErrors("oneFirst");
                    }
                  }}
                  aria-invalid={Boolean(errors.oneFirst)}
                  aria-describedby={
                    errors.oneFirst ? "student-first-name-error" : undefined
                  }
                />
                <FieldError id="student-first-name-error">
                  {errors.oneFirst}
                </FieldError>
              </FieldContent>
            </Field>
            <Field data-invalid={Boolean(errors.oneLast) || undefined}>
              <FieldLabel htmlFor="student-last-name">Apellidos</FieldLabel>
              <FieldContent>
                <Input
                  ref={oneLastRef}
                  id="student-last-name"
                  autoComplete="family-name"
                  value={oneLast}
                  onChange={(event) => {
                    setOneLast(event.target.value);
                    if (errors.oneLast || errors.form) {
                      clearErrors("oneLast");
                    }
                  }}
                  aria-invalid={Boolean(errors.oneLast)}
                  aria-describedby={
                    errors.oneLast ? "student-last-name-error" : undefined
                  }
                />
                <FieldError id="student-last-name-error">
                  {errors.oneLast}
                </FieldError>
              </FieldContent>
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : null}
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <button
            type="button"
            onClick={registerAnother}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Todavía no me registré
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
              <dt className="text-muted-foreground">Desafío</dt>
              <dd className="text-right font-medium">{group.contestTitle}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Curso</dt>
              <dd className="text-right font-medium">
                {group.grades.find((item) => item.value === grade)?.label ??
                  "—"}
              </dd>
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
            <Button
              type="button"
              disabled={loading}
              onClick={() => void join()}
            >
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
            {errors.form && (
              <Alert ref={formErrorRef} variant="destructive" tabIndex={-1}>
                <AlertDescription>{errors.form}</AlertDescription>
              </Alert>
            )}
            {group.state === "programada" && (
              <Alert>
                <AlertTitle>El desafío aún no inicia</AlertTitle>
                <AlertDescription>
                  Puedes registrarte ahora; podrás rendir cuando tu maestro la
                  abra.
                </AlertDescription>
              </Alert>
            )}
            <Field data-invalid={Boolean(errors.grade) || undefined}>
              <FieldLabel htmlFor="grade">¿En qué curso estás?</FieldLabel>
              <FieldContent>
                <Select
                  value={grade}
                  onValueChange={(value) => {
                    setGrade(value);
                    if (errors.grade || errors.form) {
                      clearErrors("grade");
                    }
                  }}
                >
                  <SelectTrigger
                    ref={gradeRef}
                    id="grade"
                    className="w-full"
                    aria-invalid={Boolean(errors.grade)}
                    aria-describedby={errors.grade ? "grade-error" : undefined}
                  >
                    <SelectValue placeholder="Elige tu curso" />
                  </SelectTrigger>
                  <SelectContent>
                    {group.grades.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="grade-error">{errors.grade}</FieldError>
              </FieldContent>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.oneFirst) || undefined}>
                <FieldLabel htmlFor="one-first">Nombres</FieldLabel>
                <FieldContent>
                  <Input
                    ref={oneFirstRef}
                    id="one-first"
                    value={oneFirst}
                    onChange={(event) => {
                      setOneFirst(event.target.value);
                      if (errors.oneFirst || errors.form) {
                        clearErrors("oneFirst");
                      }
                    }}
                    aria-invalid={Boolean(errors.oneFirst)}
                    aria-describedby={
                      errors.oneFirst ? "one-first-error" : undefined
                    }
                  />
                  <FieldError id="one-first-error">
                    {errors.oneFirst}
                  </FieldError>
                </FieldContent>
              </Field>
              <Field data-invalid={Boolean(errors.oneLast) || undefined}>
                <FieldLabel htmlFor="one-last">Apellidos</FieldLabel>
                <FieldContent>
                  <Input
                    ref={oneLastRef}
                    id="one-last"
                    value={oneLast}
                    onChange={(event) => {
                      setOneLast(event.target.value);
                      if (errors.oneLast || errors.form) {
                        clearErrors("oneLast");
                      }
                    }}
                    aria-invalid={Boolean(errors.oneLast)}
                    aria-describedby={
                      errors.oneLast ? "one-last-error" : undefined
                    }
                  />
                  <FieldError id="one-last-error">{errors.oneLast}</FieldError>
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
                      onClick={() => {
                        setMode("individual");
                        clearErrors("twoFirst", "twoLast");
                      }}
                    >
                      Individual
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "pareja" ? "default" : "outline"}
                      onClick={() => {
                        setMode("pareja");
                        if (errors.form) {
                          clearErrors();
                        }
                      }}
                    >
                      Pareja
                    </Button>
                  </div>
                </FieldContent>
              </Field>
            )}

            {mode === "pareja" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.twoFirst) || undefined}>
                  <FieldLabel htmlFor="two-first">
                    Nombres del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      ref={twoFirstRef}
                      id="two-first"
                      value={twoFirst}
                      onChange={(event) => {
                        setTwoFirst(event.target.value);
                        if (errors.twoFirst || errors.form) {
                          clearErrors("twoFirst");
                        }
                      }}
                      aria-invalid={Boolean(errors.twoFirst)}
                      aria-describedby={
                        errors.twoFirst ? "two-first-error" : undefined
                      }
                    />
                    <FieldError id="two-first-error">
                      {errors.twoFirst}
                    </FieldError>
                  </FieldContent>
                </Field>
                <Field data-invalid={Boolean(errors.twoLast) || undefined}>
                  <FieldLabel htmlFor="two-last">
                    Apellidos del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      ref={twoLastRef}
                      id="two-last"
                      value={twoLast}
                      onChange={(event) => {
                        setTwoLast(event.target.value);
                        if (errors.twoLast || errors.form) {
                          clearErrors("twoLast");
                        }
                      }}
                      aria-invalid={Boolean(errors.twoLast)}
                      aria-describedby={
                        errors.twoLast ? "two-last-error" : undefined
                      }
                    />
                    <FieldError id="two-last-error">
                      {errors.twoLast}
                    </FieldError>
                  </FieldContent>
                </Field>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setErrors({});
                  setStep("code");
                }}
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
        <CardTitle>Entrar al desafío</CardTitle>
        <CardDescription>
          Escribe el código que te dio tu maestro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={lookupCode}>
          <Field data-invalid={Boolean(errors.code) || undefined}>
            <FieldLabel htmlFor="access-code">Código de grupo</FieldLabel>
            <FieldContent>
              <Input
                ref={accessCodeRef}
                id="access-code"
                value={accessCode}
                onChange={(event) => {
                  setAccessCode(event.target.value.toUpperCase());
                  if (errors.code) {
                    clearErrors("code");
                  }
                }}
                placeholder="Ej. K7M2P9"
                className="font-mono tracking-widest uppercase"
                autoComplete="off"
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? "access-code-error" : undefined}
              />
              <FieldError id="access-code-error">{errors.code}</FieldError>
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

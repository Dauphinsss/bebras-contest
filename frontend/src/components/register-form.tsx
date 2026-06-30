"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2Icon, EyeIcon, EyeOffIcon } from "lucide-react";
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

export function RegisterForm() {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const goToConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      toast.error("Completa todos los campos.");
      return;
    }

    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }

    setStep("confirm");
  };

  const submit = async () => {
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        toast.error(data.message ?? "No se pudo crear la cuenta.");
        return;
      }

      setStep("done");
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-primary" />
            <CardTitle>Cuenta creada</CardTitle>
          </div>
          <CardDescription>
            Tu cuenta de maestro quedó <strong>pendiente de aprobación</strong>.
            Podrás iniciar sesión cuando el administrador la apruebe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/login">Ir a iniciar sesión</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Confirma tus datos</CardTitle>
          <CardDescription>
            Revisa que esté todo correcto antes de crear tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col gap-2 rounded-md border bg-background px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Nombres</dt>
              <dd className="text-right font-medium">{firstName.trim()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Apellidos</dt>
              <dd className="text-right font-medium">{lastName.trim()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Correo</dt>
              <dd className="text-right font-medium">{email.trim()}</dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => setStep("form")}
            >
              Editar
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "Creando cuenta..." : "Confirmar y crear cuenta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Registro de maestro</CardTitle>
        <CardDescription>
          Crea tu cuenta. El administrador deberá aprobarla antes de que puedas
          entrar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={goToConfirm}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="reg-first">Nombres</FieldLabel>
              <FieldContent>
                <Input
                  id="reg-first"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="reg-last">Apellidos</FieldLabel>
              <FieldContent>
                <Input
                  id="reg-last"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </FieldContent>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="reg-email">Correo</FieldLabel>
            <FieldContent>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="reg-password">Contraseña</FieldLabel>
            <FieldContent>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  className="pr-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </button>
              </div>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="reg-confirm">Confirmar contraseña</FieldLabel>
            <FieldContent>
              <Input
                id="reg-confirm"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </FieldContent>
          </Field>
          <Button type="submit" className="w-full">
            Continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

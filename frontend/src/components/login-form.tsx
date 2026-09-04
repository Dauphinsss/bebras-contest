"use client";

import { useRef, useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";

import { setToken, setUser, type AuthUser } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { API_BASE_URL } from "@/lib/api-client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const emailInvalid =
      Boolean(email.trim()) && Boolean(emailRef.current?.validity.typeMismatch);
    const nextErrors = {
      email: !email.trim()
        ? "Ingresa tu correo."
        : emailInvalid
          ? "Ingresa un correo válido."
          : undefined,
      password: password ? undefined : "Ingresa tu contraseña.",
    };

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      if (nextErrors.email) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        token?: string;
        user?: AuthUser;
        message?: string;
      };

      if (!response.ok || !data.token || !data.user) {
        setErrors({
          form: data.message ?? "No se pudo iniciar sesión.",
        });
        emailRef.current?.focus();
        return;
      }

      setToken(data.token);
      setUser(data.user);
      toast.success("Sesión iniciada.");
      window.location.href =
        data.user.status && data.user.status !== "approved"
          ? "/perfil"
          : data.user.role === "admin"
            ? "/competencias"
            : "/grupos";
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Acceso para maestros y organizadores.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
        >
          {errors.form && (
            <Alert variant="destructive">
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={Boolean(errors.email) || undefined}>
            <FieldLabel htmlFor="login-email">Correo</FieldLabel>
            <FieldContent>
              <Input
                ref={emailRef}
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email || errors.form) {
                    setErrors((current) => ({
                      ...current,
                      email: undefined,
                      form: undefined,
                    }));
                  }
                }}
                placeholder="tu@correo.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? "login-email-error" : undefined
                }
              />
              <FieldError id="login-email-error">{errors.email}</FieldError>
            </FieldContent>
          </Field>
          <Field data-invalid={Boolean(errors.password) || undefined}>
            <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
            <FieldContent>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  className="pr-10"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errors.password || errors.form) {
                      setErrors((current) => ({
                        ...current,
                        password: undefined,
                        form: undefined,
                      }));
                    }
                  }}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "login-password-error" : undefined
                  }
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
              <FieldError id="login-password-error">
                {errors.password}
              </FieldError>
            </FieldContent>
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 border-t pt-5 text-center">
          <p className="text-sm text-muted-foreground">
            ¿Todavía no tienes una cuenta de maestro?
          </p>
          <Button asChild variant="outline" className="mt-3 w-full">
            <a href="/registro">Registrarme como maestro</a>
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          ¿Eres estudiante? No necesitas cuenta: entra con el{" "}
          <a
            href="/entrar"
            className="underline underline-offset-2 hover:text-foreground"
          >
            código de tu maestro
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}

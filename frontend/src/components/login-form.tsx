"use client";

import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";

import { setToken, setUser, type AuthUser } from "@/lib/auth";
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

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Ingresa tu correo y contraseña.");
      return;
    }

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
        toast.error(data.message ?? "No se pudo iniciar sesión.");
        return;
      }

      setToken(data.token);
      setUser(data.user);
      toast.success("Sesión iniciada.");
      window.location.href =
        data.user.role === "admin" ? "/competencias" : "/";
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
        <CardDescription>Accede al panel de administración.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="login-email">Correo</FieldLabel>
            <FieldContent>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
            <FieldContent>
              <div className="relative">
                <Input
                  id="login-password"
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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

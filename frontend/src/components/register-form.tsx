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
import { SchoolPicker, type SchoolValue } from "@/components/school-picker";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api-client";

export function RegisterForm() {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [school, setSchool] = useState<SchoolValue>({
    codUe: null,
    name: "",
    institutionType: "school",
  });
  const [phone, setPhone] = useState("");
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const DOC_MAX_BYTES = 5 * 1024 * 1024;
  const isSchool = school.institutionType === "school";
  const hasSchoolChoice = Boolean(school.name.trim());

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

    if (!school.name.trim()) {
      toast.error("Indica tu colegio o selecciona educación en casa.");
      return;
    }

    if (!phone.trim()) {
      toast.error("El teléfono de contacto es obligatorio.");
      return;
    }

    if (isSchool) {
      if (!letterFile) {
        toast.error("Adjunta la carta de autorización del director.");
        return;
      }
      if (letterFile.size > DOC_MAX_BYTES) {
        toast.error("La carta no debe superar los 5 MB.");
        return;
      }
    } else {
      if (!idFrontFile || !idBackFile) {
        toast.error("Adjunta el anverso y el reverso de tu carnet.");
        return;
      }
      if (idFrontFile.size > DOC_MAX_BYTES || idBackFile.size > DOC_MAX_BYTES) {
        toast.error("Cada imagen del carnet no debe superar los 5 MB.");
        return;
      }
    }

    setStep("confirm");
  };

  const submit = async () => {
    setSubmitting(true);

    try {
      const form = new FormData();
      form.append("firstName", firstName.trim());
      form.append("lastName", lastName.trim());
      form.append("email", email.trim());
      form.append("password", password);
      form.append("schoolName", school.name.trim());
      form.append("institutionType", school.institutionType);
      form.append("phone", phone.trim());
      if (school.codUe) {
        form.append("schoolCodUe", school.codUe);
      }
      if (isSchool) {
        if (letterFile) {
          form.append("letter", letterFile);
        }
      } else {
        if (idFrontFile) {
          form.append("idFront", idFrontFile);
        }
        if (idBackFile) {
          form.append("idBack", idBackFile);
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        body: form,
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
      <Card className="mx-auto w-full max-w-2xl">
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
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd className="text-right font-medium">{phone.trim()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Colegio</dt>
              <dd className="text-right font-medium">{school.name.trim()}</dd>
            </div>
            {isSchool ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Carta</dt>
                <dd className="text-right font-medium">
                  {letterFile?.name ?? "—"}
                </dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Carnet anverso</dt>
                  <dd className="text-right font-medium">
                    {idFrontFile?.name ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Carnet reverso</dt>
                  <dd className="text-right font-medium">
                    {idBackFile?.name ?? "—"}
                  </dd>
                </div>
              </>
            )}
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
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Creando cuenta..." : "Confirmar y crear cuenta"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
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
          <div className="grid gap-4 sm:grid-cols-2">
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
              <FieldLabel htmlFor="reg-phone">Teléfono</FieldLabel>
              <FieldContent>
                <Input
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Ej. 71234567"
                />
              </FieldContent>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <FieldLabel htmlFor="reg-confirm">
                Confirmar contraseña
              </FieldLabel>
              <FieldContent>
                <div className="relative">
                  <Input
                    id="reg-confirm"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
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
          </div>
          <Field>
            <FieldLabel htmlFor="school-search">Colegio</FieldLabel>
            <FieldContent>
              <SchoolPicker value={school} onChange={setSchool} />
            </FieldContent>
          </Field>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              hasSchoolChoice && isSchool
                ? "grid-rows-[1fr]"
                : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <Field className="pt-1">
                <FieldLabel htmlFor="reg-letter">
                  Carta de autorización del director
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="reg-letter"
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={(event) =>
                      setLetterFile(event.target.files?.[0] ?? null)
                    }
                  />
                  {letterFile && (
                    <p className="text-xs text-muted-foreground">
                      Archivo: {letterFile.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PDF o imagen (JPG, PNG), máximo 5 MB.
                  </p>
                </FieldContent>
              </Field>
            </div>
          </div>

          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              hasSchoolChoice && !isSchool
                ? "grid-rows-[1fr]"
                : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-1 flex flex-col gap-3 rounded-md border bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Como enseñas en casa, adjunta el anverso y el reverso de tu
                  carnet de identidad para verificar tu registro.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="reg-id-front">
                      Carnet — anverso
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="reg-id-front"
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        onChange={(event) =>
                          setIdFrontFile(event.target.files?.[0] ?? null)
                        }
                      />
                      {idFrontFile && (
                        <p className="truncate text-xs text-muted-foreground">
                          {idFrontFile.name}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="reg-id-back">
                      Carnet — reverso
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        id="reg-id-back"
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        onChange={(event) =>
                          setIdBackFile(event.target.files?.[0] ?? null)
                        }
                      />
                      {idBackFile && (
                        <p className="truncate text-xs text-muted-foreground">
                          {idBackFile.name}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Imagen (JPG, PNG) o PDF, máximo 5 MB cada uno.
                </p>
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full">
            Continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

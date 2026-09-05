"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2Icon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { SchoolPicker, type SchoolValue } from "@/components/school-picker";
import { cn } from "@/lib/utils";
import { formatPersonName } from "@/lib/person-name";
import { API_BASE_URL } from "@/lib/api-client";
import { setToken, setUser, type AuthUser } from "@/lib/auth";

type RegisterErrors = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  school?: string;
  letter?: string;
  idFront?: string;
  idBack?: string;
  form?: string;
};

type DocumentField = "letter" | "idFront" | "idBack";

const DOC_MAX_BYTES = 5 * 1024 * 1024;
const DOC_ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function documentError(file: File) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!DOC_ALLOWED_EXTENSIONS.includes(extension)) {
    return "Elige un archivo PDF, JPG, JPEG o PNG.";
  }
  if (file.size > DOC_MAX_BYTES) {
    return "El archivo no debe superar los 5 MB.";
  }
  return undefined;
}

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
  const [uploadNow, setUploadNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const schoolRef = useRef<HTMLInputElement>(null);
  const letterRef = useRef<HTMLInputElement>(null);
  const idFrontRef = useRef<HTMLInputElement>(null);
  const idBackRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const pendingResponseFocusRef = useRef<"email" | DocumentField | null>(null);

  const isSchool = school.institutionType === "school";
  const hasSchoolChoice = Boolean(school.name.trim());

  const clearErrors = (...fields: (keyof RegisterErrors)[]) => {
    setErrors((current) => {
      const next = { ...current, form: undefined };
      fields.forEach((field) => {
        next[field] = undefined;
      });
      return next;
    });
  };

  const updateDocument = (
    field: DocumentField,
    file: File | null,
    setFile: (value: File | null) => void,
  ) => {
    setFile(file);
    const missingMessages: Record<DocumentField, string> = {
      letter: "Adjunta la carta o elige subirla después.",
      idFront: "Adjunta el anverso o elige subirlo después.",
      idBack: "Adjunta el reverso o elige subirlo después.",
    };
    const error = file ? documentError(file) : missingMessages[field];
    setErrors((current) => ({ ...current, [field]: error, form: undefined }));
    if (error) {
      toast.error(error);
    }
  };

  useEffect(() => {
    if (errors.form) {
      formErrorRef.current?.focus();
    }
  }, [errors.form, step]);

  useEffect(() => {
    if (submitting || step !== "form" || !pendingResponseFocusRef.current) {
      return;
    }

    const refs = {
      email: emailRef,
      letter: letterRef,
      idFront: idFrontRef,
      idBack: idBackRef,
    };
    refs[pendingResponseFocusRef.current].current?.focus();
    pendingResponseFocusRef.current = null;
  }, [step, submitting]);

  const goToConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const emailInvalid =
      Boolean(email.trim()) && Boolean(emailRef.current?.validity.typeMismatch);
    const nextErrors: RegisterErrors = {
      firstName: firstName.trim() ? undefined : "Ingresa tus nombres.",
      lastName: lastName.trim() ? undefined : "Ingresa tus apellidos.",
      email: !email.trim()
        ? "Ingresa tu correo."
        : emailInvalid
          ? "Ingresa un correo válido."
          : undefined,
      phone: phone.trim() ? undefined : "Ingresa tu teléfono de contacto.",
      password: !password
        ? "Ingresa una contraseña."
        : password.length < 6
          ? "La contraseña debe tener al menos 6 caracteres."
          : undefined,
      confirmPassword: !confirmPassword
        ? "Confirma tu contraseña."
        : password !== confirmPassword
          ? "Las contraseñas no coinciden."
          : undefined,
      school: hasSchoolChoice
        ? undefined
        : "Indica tu colegio o selecciona educación en casa.",
      letter:
        uploadNow && hasSchoolChoice && isSchool
          ? letterFile
            ? documentError(letterFile)
            : "Adjunta la carta o elige subirla después."
          : undefined,
      idFront:
        uploadNow && hasSchoolChoice && !isSchool
          ? idFrontFile
            ? documentError(idFrontFile)
            : "Adjunta el anverso o elige subirlo después."
          : undefined,
      idBack:
        uploadNow && hasSchoolChoice && !isSchool
          ? idBackFile
            ? documentError(idBackFile)
            : "Adjunta el reverso o elige subirlo después."
          : undefined,
    };
    const fieldOrder = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "password",
      "confirmPassword",
      "school",
      ...(isSchool ? (["letter"] as const) : (["idFront", "idBack"] as const)),
    ] as const;
    const firstInvalid = fieldOrder.find((field) => nextErrors[field]);

    if (firstInvalid) {
      setErrors(nextErrors);
      const refs = {
        firstName: firstNameRef,
        lastName: lastNameRef,
        email: emailRef,
        phone: phoneRef,
        password: passwordRef,
        confirmPassword: confirmPasswordRef,
        school: schoolRef,
        letter: letterRef,
        idFront: idFrontRef,
        idBack: idBackRef,
      };
      refs[firstInvalid].current?.focus();
      return;
    }

    setErrors({});
    setStep("confirm");
  };

  const submit = async () => {
    setErrors({});
    setSubmitting(true);

    try {
      const form = new FormData();
      form.append("firstName", formatPersonName(firstName));
      form.append("lastName", formatPersonName(lastName));
      form.append("email", email.trim());
      form.append("password", password);
      form.append("schoolName", school.name.trim());
      form.append("institutionType", school.institutionType);
      form.append("phone", phone.trim());
      if (school.codUe) {
        form.append("schoolCodUe", school.codUe);
      }
      if (uploadNow) {
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
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        body: form,
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        token?: string;
        user?: AuthUser;
        field?: "email" | DocumentField;
      };

      if (!response.ok) {
        const message = data.message ?? "No se pudo crear la cuenta.";
        toast.error(message);
        if (data.field) {
          setErrors({ [data.field]: message });
          pendingResponseFocusRef.current = data.field;
          setStep("form");
        } else {
          setErrors({ form: message });
        }
        return;
      }

      if (data.token && data.user) {
        setToken(data.token);
        setUser(data.user);
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
            Ya entraste con tu cuenta. Queda{" "}
            <strong>pendiente de aprobación</strong>
            {uploadNow
              ? ": el administrador revisará tus documentos."
              : " hasta que subas tus documentos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href="/perfil">
              {uploadNow ? "Ir a mi perfil" : "Subir mis documentos"}
            </a>
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
          {errors.form && (
            <Alert ref={formErrorRef} variant="destructive" tabIndex={-1}>
              <AlertDescription>{errors.form}</AlertDescription>
            </Alert>
          )}
          <dl className="flex flex-col gap-2 rounded-md border bg-background px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Nombres</dt>
              <dd className="text-right font-medium">
                {formatPersonName(firstName)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Apellidos</dt>
              <dd className="text-right font-medium">
                {formatPersonName(lastName)}
              </dd>
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
              onClick={() => {
                setErrors({});
                setStep("form");
              }}
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
          Crea tu cuenta y entra enseguida. El administrador la aprueba para que
          puedas crear grupos e inscribir estudiantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={goToConfirm} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.firstName) || undefined}>
              <FieldLabel htmlFor="reg-first">Nombres</FieldLabel>
              <FieldContent>
                <Input
                  ref={firstNameRef}
                  id="reg-first"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (errors.firstName) {
                      clearErrors("firstName");
                    }
                  }}
                  aria-invalid={Boolean(errors.firstName)}
                  aria-describedby={
                    errors.firstName ? "reg-first-error" : undefined
                  }
                />
                <FieldError id="reg-first-error">{errors.firstName}</FieldError>
              </FieldContent>
            </Field>
            <Field data-invalid={Boolean(errors.lastName) || undefined}>
              <FieldLabel htmlFor="reg-last">Apellidos</FieldLabel>
              <FieldContent>
                <Input
                  ref={lastNameRef}
                  id="reg-last"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (errors.lastName) {
                      clearErrors("lastName");
                    }
                  }}
                  aria-invalid={Boolean(errors.lastName)}
                  aria-describedby={
                    errors.lastName ? "reg-last-error" : undefined
                  }
                />
                <FieldError id="reg-last-error">{errors.lastName}</FieldError>
              </FieldContent>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.email) || undefined}>
              <FieldLabel htmlFor="reg-email">Correo</FieldLabel>
              <FieldContent>
                <Input
                  ref={emailRef}
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (errors.email) {
                      clearErrors("email");
                    }
                  }}
                  placeholder="tu@correo.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "reg-email-error" : undefined
                  }
                />
                <FieldError id="reg-email-error">{errors.email}</FieldError>
              </FieldContent>
            </Field>
            <Field data-invalid={Boolean(errors.phone) || undefined}>
              <FieldLabel htmlFor="reg-phone">Teléfono</FieldLabel>
              <FieldContent>
                <Input
                  ref={phoneRef}
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    if (errors.phone) {
                      clearErrors("phone");
                    }
                  }}
                  placeholder="Ej. 71234567"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={
                    errors.phone ? "reg-phone-error" : undefined
                  }
                />
                <FieldError id="reg-phone-error">{errors.phone}</FieldError>
              </FieldContent>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.password) || undefined}>
              <FieldLabel htmlFor="reg-password">Contraseña</FieldLabel>
              <FieldContent>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (
                        errors.confirmPassword ===
                        "Las contraseñas no coinciden."
                      ) {
                        clearErrors("password", "confirmPassword");
                      } else if (errors.password) {
                        clearErrors("password");
                      }
                    }}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password ? "reg-password-error" : undefined
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
                <FieldError id="reg-password-error">
                  {errors.password}
                </FieldError>
              </FieldContent>
            </Field>
            <Field data-invalid={Boolean(errors.confirmPassword) || undefined}>
              <FieldLabel htmlFor="reg-confirm">
                Confirmar contraseña
              </FieldLabel>
              <FieldContent>
                <div className="relative">
                  <Input
                    ref={confirmPasswordRef}
                    id="reg-confirm"
                    type={showPassword ? "text" : "password"}
                    className="pr-10"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (errors.confirmPassword) {
                        clearErrors("confirmPassword");
                      }
                    }}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? "reg-confirm-error" : undefined
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
                <FieldError id="reg-confirm-error">
                  {errors.confirmPassword}
                </FieldError>
              </FieldContent>
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.school) || undefined}>
            <FieldLabel htmlFor="school-search">¿Dónde enseñas?</FieldLabel>
            <FieldContent>
              <SchoolPicker
                value={school}
                onChange={(value) => {
                  setSchool(value);
                  if (value.name.trim() && errors.school) {
                    clearErrors("school", "letter", "idFront", "idBack");
                  } else if (errors.letter || errors.idFront || errors.idBack) {
                    clearErrors("letter", "idFront", "idBack");
                  }
                }}
                inputRef={schoolRef}
                invalid={Boolean(errors.school)}
                describedBy={errors.school ? "reg-school-error" : undefined}
              />
              <FieldError id="reg-school-error">{errors.school}</FieldError>
            </FieldContent>
          </Field>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              hasSchoolChoice ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <Field orientation="horizontal" className="py-2 pr-1">
                <Checkbox
                  id="reg-upload-later"
                  checked={!uploadNow}
                  onCheckedChange={(checked) => {
                    setUploadNow(checked !== true);
                    clearErrors("letter", "idFront", "idBack");
                  }}
                />
                <FieldLabel htmlFor="reg-upload-later" className="font-normal">
                  Subir mis documentos más tarde
                </FieldLabel>
              </Field>
            </div>
          </div>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              hasSchoolChoice && uploadNow && isSchool
                ? "grid-rows-[1fr]"
                : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <Field
                className="pt-2"
                data-invalid={Boolean(errors.letter) || undefined}
              >
                <FieldLabel htmlFor="reg-letter">
                  Carta de autorización del director
                </FieldLabel>
                <FieldContent>
                  <Input
                    ref={letterRef}
                    id="reg-letter"
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={(event) => {
                      updateDocument(
                        "letter",
                        event.target.files?.[0] ?? null,
                        setLetterFile,
                      );
                    }}
                    aria-invalid={Boolean(errors.letter)}
                    aria-describedby={
                      errors.letter ? "reg-letter-error" : undefined
                    }
                  />
                  <FieldError id="reg-letter-error">{errors.letter}</FieldError>
                  {letterFile && (
                    <p className="text-xs text-muted-foreground">
                      Archivo: {letterFile.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PDF o imagen (JPG, PNG), máximo 5 MB.{" "}
                    <a
                      href="/carta-modelo"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      Llenar la carta aquí
                    </a>
                  </p>
                </FieldContent>
              </Field>
            </div>
          </div>

          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              hasSchoolChoice && uploadNow && !isSchool
                ? "grid-rows-[1fr]"
                : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="mt-3 flex flex-col gap-3 rounded-md border bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Como enseñas en casa, adjunta el anverso y el reverso de tu
                  carnet de identidad para verificar tu registro.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={Boolean(errors.idFront) || undefined}>
                    <FieldLabel htmlFor="reg-id-front">
                      Carnet — anverso
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        ref={idFrontRef}
                        id="reg-id-front"
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        onChange={(event) => {
                          updateDocument(
                            "idFront",
                            event.target.files?.[0] ?? null,
                            setIdFrontFile,
                          );
                        }}
                        aria-invalid={Boolean(errors.idFront)}
                        aria-describedby={
                          errors.idFront ? "reg-id-front-error" : undefined
                        }
                      />
                      <FieldError id="reg-id-front-error">
                        {errors.idFront}
                      </FieldError>
                      {idFrontFile && (
                        <p className="truncate text-xs text-muted-foreground">
                          {idFrontFile.name}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                  <Field data-invalid={Boolean(errors.idBack) || undefined}>
                    <FieldLabel htmlFor="reg-id-back">
                      Carnet — reverso
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        ref={idBackRef}
                        id="reg-id-back"
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        onChange={(event) => {
                          updateDocument(
                            "idBack",
                            event.target.files?.[0] ?? null,
                            setIdBackFile,
                          );
                        }}
                        aria-invalid={Boolean(errors.idBack)}
                        aria-describedby={
                          errors.idBack ? "reg-id-back-error" : undefined
                        }
                      />
                      <FieldError id="reg-id-back-error">
                        {errors.idBack}
                      </FieldError>
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

"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { API_BASE_URL } from "@/lib/api-client";
import { authHeaders, getUser, setUser } from "@/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SchoolPicker, type SchoolValue } from "@/components/school-picker";

const DOC_MAX_BYTES = 5 * 1024 * 1024;

type ProfileDocuments = {
  institutionType: "school" | "homeschool";
  letter: boolean;
  idFront: boolean;
  idBack: boolean;
  missing: string[];
  complete: boolean;
};

type TeacherSchool = {
  id: string;
  schoolCodUe: string | null;
  schoolName: string;
  status: string;
  hasLetter: boolean;
  createdAt: string;
};

type Profile = {
  id: number;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  institutionType: string | null;
  schoolName: string | null;
  schoolCodUe: string | null;
  phone: string | null;
  createdAt: string;
  documents: ProfileDocuments;
  schools: TeacherSchool[];
};

const ACCOUNT_STATUS: Record<string, { label: string; hint: string }> = {
  pending: { label: "Pendiente", hint: "Un administrador revisará tus datos." },
  approved: {
    label: "Aprobado",
    hint: "Ya puedes crear grupos e inscribir estudiantes.",
  },
  suspended: {
    label: "Suspendido",
    hint: "Un administrador suspendió tu cuenta; escríbele para seguir.",
  },
  rejected: {
    label: "Rechazado",
    hint: "Un administrador rechazó tu registro; escríbele si fue un error.",
  },
};

const SCHOOL_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
};

function DocumentUpload({
  id,
  label,
  busy,
  onPick,
}: {
  id: string;
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        id={id}
        type="file"
        className="hidden"
        accept=".pdf,image/jpeg,image/png"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (!file) {
            return;
          }

          if (file.size > DOC_MAX_BYTES) {
            toast.error("El documento debe pesar 5 MB o menos.");
            return;
          }

          onPick(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
    </>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingSchool, setAddingSchool] = useState(false);
  const [newSchool, setNewSchool] = useState<SchoolValue>({
    codUe: null,
    name: "",
    institutionType: "school",
  });
  const [newSchoolLetter, setNewSchoolLetter] = useState<File | null>(null);

  const load = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        toast.error("No se pudo cargar tu perfil.");
        return;
      }

      const data = (await response.json()) as Profile;
      setProfile(data);

      const stored = getUser();
      if (stored && stored.status !== data.status) {
        setUser({ ...stored, status: data.status });
      }
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async (path: string, form: FormData, done: string) => {
    setBusy(true);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        toast.error(data.message ?? "No se pudo guardar el documento.");
        return false;
      }

      toast.success(done);
      await load();
      return true;
    } catch {
      toast.error("No se pudo conectar con el servidor.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadOwnDocument = (field: string, file: File) => {
    const form = new FormData();
    form.append(field, file);
    void send(
      "/api/auth/me/documents",
      form,
      "Documento guardado. El administrador lo revisará.",
    );
  };

  const uploadSchoolLetter = (school: TeacherSchool, file: File) => {
    const form = new FormData();
    form.append("letter", file);
    void send(
      `/api/auth/me/schools/${school.id}/letter`,
      form,
      `Carta de ${school.schoolName} guardada.`,
    );
  };

  const addSchool = () => {
    if (!newSchool.name.trim()) {
      toast.error("Elige el colegio que quieres administrar.");
      return;
    }

    if (newSchoolLetter && newSchoolLetter.size > DOC_MAX_BYTES) {
      toast.error("La carta debe pesar 5 MB o menos.");
      return;
    }

    const form = new FormData();
    form.append("schoolName", newSchool.name.trim());
    if (newSchool.codUe) {
      form.append("schoolCodUe", newSchool.codUe);
    }
    if (newSchoolLetter) {
      form.append("letter", newSchoolLetter);
    }

    void send(
      "/api/auth/me/schools",
      form,
      "Colegio enviado. El administrador lo revisará.",
    ).then((ok) => {
      if (!ok) {
        return;
      }

      setAddingSchool(false);
      setNewSchool({ codUe: null, name: "", institutionType: "school" });
      setNewSchoolLetter(null);
    });
  };

  const cancelSchool = async (school: TeacherSchool) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/me/schools/${school.id}`,
        { method: "DELETE", headers: authHeaders() },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        toast.error(data.message ?? "No se pudo quitar el colegio.");
        return;
      }

      toast.success("Solicitud retirada.");
      await load();
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Alert>
        <AlertTitle>No pudimos cargar tu perfil</AlertTitle>
        <AlertDescription>
          Vuelve a entrar e inténtalo de nuevo.
        </AlertDescription>
      </Alert>
    );
  }

  const account = ACCOUNT_STATUS[profile.status] ?? ACCOUNT_STATUS.pending;
  const isSchool = profile.documents.institutionType === "school";
  const extraSchools = profile.schools ?? [];
  const missingLetters = [
    ...(isSchool && !profile.documents.letter
      ? [profile.schoolName ?? "tu colegio"]
      : []),
    ...extraSchools
      .filter((school) => !school.hasLetter)
      .map((school) => school.schoolName),
  ];

  const row = "flex flex-wrap items-center justify-between gap-2 py-2.5";

  const initials = (profile.name ?? profile.email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:gap-5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.name ?? profile.email}
            </h1>
            <Badge
              variant={profile.status === "approved" ? "secondary" : "outline"}
            >
              {account.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {profile.role === "admin" ? "Administrador" : "Maestro"} ·{" "}
            {profile.email}
            {profile.phone ? ` · ${profile.phone}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{account.hint}</p>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {isSchool ? "Mis colegios" : "Mi verificación"}
        </h2>
        <div className="flex flex-col divide-y border-t border-border">
          {isSchool ? (
            <div className={row}>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">
                  {profile.schoolName ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Colegio principal ·{" "}
                  {profile.documents.letter
                    ? "carta enviada"
                    : "falta la carta del director"}
                </span>
              </div>
              {profile.documents.letter ? null : (
                <div className="flex items-center gap-3">
                  <a
                    href={`/carta-modelo?colegio=${encodeURIComponent(
                      profile.schoolName ?? "",
                    )}`}
                    className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
                  >
                    Llenar carta
                  </a>
                  <DocumentUpload
                    id="own-letter"
                    label="Subir carta"
                    busy={busy}
                    onPick={(file) => uploadOwnDocument("letter", file)}
                  />
                </div>
              )}
            </div>
          ) : (
            (["idFront", "idBack"] as const).map((side) => (
              <div className={row} key={side}>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    Carnet — {side === "idFront" ? "anverso" : "reverso"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Educación en casa ·{" "}
                    {profile.documents[side] ? "enviado" : "falta"}
                  </span>
                </div>
                {profile.documents[side] ? null : (
                  <DocumentUpload
                    id={`own-${side}`}
                    label="Subir"
                    busy={busy}
                    onPick={(file) => uploadOwnDocument(side, file)}
                  />
                )}
              </div>
            ))
          )}

          {extraSchools.map((school) => (
            <div className={row} key={school.id}>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{school.schoolName}</span>
                <span className="text-xs text-muted-foreground">
                  {SCHOOL_STATUS_LABEL[school.status] ?? school.status} ·{" "}
                  {school.hasLetter
                    ? "carta enviada"
                    : "falta la carta del director"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {school.hasLetter ? null : (
                  <>
                    <a
                      href={`/carta-modelo?colegio=${encodeURIComponent(
                        school.schoolName,
                      )}`}
                      className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
                    >
                      Llenar carta
                    </a>
                    <DocumentUpload
                      id={`school-${school.id}`}
                      label="Subir carta"
                      busy={busy}
                      onPick={(file) => uploadSchoolLetter(school, file)}
                    />
                  </>
                )}
                {school.status === "approved" ? null : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title={`Quitar ${school.schoolName}`}
                    aria-label={`Quitar ${school.schoolName}`}
                    onClick={() => void cancelSchool(school)}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {missingLetters.length > 0 && (
            <p className="pt-4 text-xs text-muted-foreground">
              Falta la carta de: {missingLetters.join(", ")}.{" "}
              <a
                href="/carta-modelo"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Llenar la carta aquí
              </a>
            </p>
          )}
        </div>

        {addingSchool ? (
          <div className="flex flex-col gap-3 pt-4">
            <Field>
              <FieldLabel htmlFor="new-school">Otro colegio</FieldLabel>
              <FieldContent>
                <SchoolPicker value={newSchool} onChange={setNewSchool} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-school-letter">
                Carta de su director (puedes subirla después)
              </FieldLabel>
              <FieldContent>
                <Input
                  id="new-school-letter"
                  type="file"
                  accept=".pdf,image/jpeg,image/png"
                  onChange={(event) =>
                    setNewSchoolLetter(event.target.files?.[0] ?? null)
                  }
                />
              </FieldContent>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={addSchool}
              >
                {busy ? "Enviando..." : "Pedir este colegio"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAddingSchool(false);
                  setNewSchoolLetter(null);
                  setNewSchool({
                    codUe: null,
                    name: "",
                    institutionType: "school",
                  });
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAddingSchool(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Administrar otro colegio
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

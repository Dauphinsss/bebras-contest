"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CopyIcon,
  LinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createGroup,
  listGroups,
  removeGroup,
  type StoredGroup,
} from "@/lib/groups-api";
import { listContests, type StoredContest } from "@/lib/contests-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

export function GroupsHome() {
  const [groups, setGroups] = useState<StoredGroup[]>([]);
  const [contests, setContests] = useState<StoredContest[]>([]);
  const [contestId, setContestId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([listGroups(), listContests()])
      .then(([loadedGroups, loadedContests]) => {
        if (!active) {
          return;
        }
        setGroups(loadedGroups);
        setContests(loadedContests);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : "No se pudieron cargar los datos.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const publishedContests = useMemo(
    () => contests.filter((contest) => contest.state !== "borrador"),
    [contests],
  );

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!contestId) {
      toast.error("Elige una competencia publicada.");
      return;
    }

    if (!name.trim()) {
      toast.error("El nombre del grupo es obligatorio.");
      return;
    }

    setCreating(true);

    try {
      const group = await createGroup({ contestId, name: name.trim() });
      setGroups((current) => [group, ...current]);
      setName("");
      toast.success(`Grupo creado. Código: ${group.accessCode}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el grupo.");
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado.");
    } catch {
      toast.error("No se pudo copiar el código.");
    }
  };

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/entrar?code=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado. Compártelo con tus estudiantes.");
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  };

  const handleDelete = (group: StoredGroup) => {
    void removeGroup(group.id)
      .then(() => {
        setGroups((current) => current.filter((item) => item.id !== group.id));
        toast.success("Grupo eliminado.");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "No se pudo eliminar el grupo.");
      });
  };

  if (loading) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Crear grupo</CardTitle>
          <CardDescription>
            Genera un código de acceso para que tus estudiantes entren a una
            competencia publicada.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {publishedContests.length === 0 ? (
            <Alert>
              <AlertTitle>No hay competencias publicadas</AlertTitle>
              <AlertDescription>
                Publica una competencia primero para poder crear grupos.
              </AlertDescription>
            </Alert>
          ) : (
            <form
              className="flex flex-col gap-4 md:flex-row md:items-end"
              onSubmit={handleCreate}
            >
              <Field className="md:flex-1">
                <FieldLabel htmlFor="group-contest">Competencia</FieldLabel>
                <FieldContent>
                  <Select value={contestId} onValueChange={setContestId}>
                    <SelectTrigger id="group-contest" className="w-full">
                      <SelectValue placeholder="Elige una competencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {publishedContests.map((contest) => (
                        <SelectItem key={contest.id} value={contest.id}>
                          {contest.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field className="md:flex-1">
                <FieldLabel htmlFor="group-name">Nombre del grupo</FieldLabel>
                <FieldContent>
                  <Input
                    id="group-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. 6° A — Colegio San José"
                  />
                </FieldContent>
              </Field>
              <Button type="submit" disabled={creating}>
                <PlusIcon data-icon="inline-start" />
                {creating ? "Creando..." : "Crear grupo"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Grupos</CardTitle>
          <CardDescription>
            Reparte el código a tus estudiantes para que entren a la competencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          {groups.length === 0 ? (
            <Alert>
              <AlertTitle>No hay grupos creados</AlertTitle>
              <AlertDescription>
                Crea el primer grupo para una competencia publicada.
              </AlertDescription>
            </Alert>
          ) : (
            groups.map((group) => (
              <Card key={group.id} variant="soft-gradient" className="gap-3 py-4">
                <CardHeader className="gap-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{group.contestTitle}</Badge>
                        {group.contestCategory && (
                          <Badge variant="outline">{group.contestCategory}</Badge>
                        )}
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <UsersIcon className="size-4" />
                          {group.teamCount} equipo(s)
                        </span>
                      </div>
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                        <span className="font-mono text-lg font-semibold tracking-widest">
                          {group.accessCode}
                        </span>
                        <Button
                          size="icon-sm"
                          type="button"
                          variant="outline"
                          aria-label="Copiar código"
                          onClick={() => copyCode(group.accessCode)}
                        >
                          <CopyIcon />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => copyLink(group.accessCode)}
                      >
                        <LinkIcon data-icon="inline-start" />
                        Copiar enlace
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => handleDelete(group)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

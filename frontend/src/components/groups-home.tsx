"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ChevronDownIcon,
  CopyIcon,
  LinkIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import {
  createGroup,
  listGroups,
  listPublishedContests,
  removeGroup,
  removeTeam,
  updateTeam,
  type GroupTeam,
  type PublishedContest,
  type StoredGroup,
} from "@/lib/groups-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function teamName(team: GroupTeam) {
  const one = `${team.memberOneFirstName} ${team.memberOneLastName}`.trim();
  if (team.participationMode === "pareja" && team.memberTwoFirstName) {
    return `${one} · ${team.memberTwoFirstName} ${team.memberTwoLastName ?? ""}`.trim();
  }
  return one;
}
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
  const [publishedContests, setPublishedContests] = useState<PublishedContest[]>(
    [],
  );
  const [contestId, setContestId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    groupId: string;
    team: GroupTeam;
  } | null>(null);
  const [editOneFirst, setEditOneFirst] = useState("");
  const [editOneLast, setEditOneLast] = useState("");
  const [editTwoFirst, setEditTwoFirst] = useState("");
  const [editTwoLast, setEditTwoLast] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.all([listGroups(), listPublishedContests()])
      .then(([loadedGroups, loadedContests]) => {
        if (!active) {
          return;
        }
        setGroups(loadedGroups);
        setPublishedContests(loadedContests);
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

  const deleteTeam = (groupId: string, team: GroupTeam) => {
    void removeTeam(team.id)
      .then(() => {
        setGroups((current) =>
          current.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  teams: group.teams.filter((item) => item.id !== team.id),
                  teamCount: Math.max(0, group.teamCount - 1),
                }
              : group,
          ),
        );
        toast.success("Participante eliminado.");
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "No se pudo eliminar.",
        );
      });
  };

  const openEdit = (groupId: string, team: GroupTeam) => {
    setEditing({ groupId, team });
    setEditOneFirst(team.memberOneFirstName);
    setEditOneLast(team.memberOneLastName);
    setEditTwoFirst(team.memberTwoFirstName ?? "");
    setEditTwoLast(team.memberTwoLastName ?? "");
  };

  const saveEdit = async () => {
    if (!editing) {
      return;
    }

    const isPareja = editing.team.participationMode === "pareja";

    if (!editOneFirst.trim() || !editOneLast.trim()) {
      toast.error("Los nombres y apellidos son obligatorios.");
      return;
    }

    if (isPareja && (!editTwoFirst.trim() || !editTwoLast.trim())) {
      toast.error("Faltan los nombres y apellidos del segundo integrante.");
      return;
    }

    setSavingEdit(true);

    try {
      const updated = await updateTeam(editing.team.id, {
        memberOneFirstName: editOneFirst.trim(),
        memberOneLastName: editOneLast.trim(),
        memberTwoFirstName: editTwoFirst.trim(),
        memberTwoLastName: editTwoLast.trim(),
      });
      setGroups((current) =>
        current.map((group) =>
          group.id === editing.groupId
            ? {
                ...group,
                teams: group.teams.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : group,
        ),
      );
      toast.success("Participante actualizado.");
      setEditing(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo actualizar.",
      );
    } finally {
      setSavingEdit(false);
    }
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
              <Card key={group.id} variant="soft-gradient" className="gap-0 py-4">
                <CardHeader className="gap-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{group.contestTitle}</Badge>
                        {group.contestCategory && (
                          <Badge variant="outline">{group.contestCategory}</Badge>
                        )}
                        <button
                          type="button"
                          aria-expanded={openGroupId === group.id}
                          onClick={() =>
                            setOpenGroupId(
                              openGroupId === group.id ? null : group.id,
                            )
                          }
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                        >
                          <UsersIcon className="size-4" />
                          {group.teamCount} equipo(s)
                          <ChevronDownIcon
                            className={cn(
                              "size-4 transition-transform duration-300",
                              openGroupId === group.id && "rotate-180",
                            )}
                          />
                        </button>
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
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    openGroupId === group.id
                      ? "grid-rows-[1fr]"
                      : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <CardContent className="pt-4">
                      {group.teams.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aún no hay equipos registrados en este grupo.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {group.teams.map((team) => (
                            <li
                              key={team.id}
                              className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <span className="min-w-0 truncate font-medium">
                                {teamName(team)}
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Badge variant="outline">
                                  {team.participationMode === "pareja"
                                    ? "Pareja"
                                    : "Individual"}
                                </Badge>
                                <Button
                                  size="icon-sm"
                                  type="button"
                                  variant="outline"
                                  aria-label="Editar participante"
                                  onClick={() => openEdit(group.id, team)}
                                >
                                  <PencilIcon />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  type="button"
                                  variant="outline"
                                  aria-label="Eliminar participante"
                                  onClick={() => deleteTeam(group.id, team)}
                                >
                                  <Trash2Icon />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </div>
                </div>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar participante</DialogTitle>
            <DialogDescription>
              Corrige los nombres y apellidos del equipo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-one-first">Nombres</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-one-first"
                    value={editOneFirst}
                    onChange={(event) => setEditOneFirst(event.target.value)}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-one-last">Apellidos</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-one-last"
                    value={editOneLast}
                    onChange={(event) => setEditOneLast(event.target.value)}
                  />
                </FieldContent>
              </Field>
            </div>
            {editing?.team.participationMode === "pareja" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="edit-two-first">
                    Nombres del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="edit-two-first"
                      value={editTwoFirst}
                      onChange={(event) => setEditTwoFirst(event.target.value)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-two-last">
                    Apellidos del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="edit-two-last"
                      value={editTwoLast}
                      onChange={(event) => setEditTwoLast(event.target.value)}
                    />
                  </FieldContent>
                </Field>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={savingEdit}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingEdit}
              onClick={() => void saveEdit()}
            >
              {savingEdit ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarClockIcon,
  CalendarIcon,
  ChevronDownIcon,
  Clock8Icon,
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
import { toDatetimeLocalValue } from "@/lib/contest-schema";

import {
  createGroup,
  enrollTeam,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const sessionFormatter = new Intl.DateTimeFormat("es-BO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSession(value: string) {
  return sessionFormatter.format(new Date(value));
}

function parseDateTimeLocal(value: string) {
  if (!value) {
    return null;
  }
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function toTimeValue(value: string) {
  const date = parseDateTimeLocal(value);
  if (!date) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function updateDatePart(currentValue: string, nextDate: Date | undefined) {
  if (!nextDate) {
    return currentValue;
  }
  const currentDate = parseDateTimeLocal(currentValue);
  const nextValue = new Date(nextDate);
  if (currentDate) {
    nextValue.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  } else {
    nextValue.setHours(9, 0, 0, 0);
  }
  return toDatetimeLocalValue(nextValue.toISOString());
}

function updateTimePart(currentValue: string, nextTime: string) {
  const currentDate = parseDateTimeLocal(currentValue) ?? new Date();
  const [hours, minutes] = nextTime.split(":").map((part) => Number(part));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return currentValue;
  }
  const nextValue = new Date(currentDate);
  nextValue.setHours(hours, minutes, 0, 0);
  return toDatetimeLocalValue(nextValue.toISOString());
}

function SessionDateTimeField({
  value,
  onChange,
  minDate,
  maxDate,
  disabled = false,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  minDate: Date | null;
  maxDate: Date | null;
  disabled?: boolean;
}) {
  const date = parseDateTimeLocal(value);
  const dateLabel = date
    ? format(date, "d 'de' MMMM 'de' yyyy", { locale: es })
    : "Elige un día";
  const [timeDraft, setTimeDraft] = useState(toTimeValue(value));

  useEffect(() => {
    setTimeDraft(toTimeValue(value));
  }, [value]);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeMin =
    date && minDate && sameDay(date, minDate) ? toTimeValue(minDate.toISOString()) : undefined;
  const timeMax =
    date && maxDate && sameDay(date, maxDate) ? toTimeValue(maxDate.toISOString()) : undefined;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal sm:flex-1",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarIcon data-icon="inline-start" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          data-calendar-popover
          className="w-auto rounded-sm p-0"
          align="start"
        >
          <Calendar
            initialFocus
            mode="single"
            selected={date ?? undefined}
            defaultMonth={date ?? minDate ?? undefined}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            onSelect={(nextDate) => onChange(updateDatePart(value, nextDate))}
          />
        </PopoverContent>
      </Popover>
      <div className="relative sm:w-36">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 text-muted-foreground">
          <Clock8Icon className="size-4" />
          <span className="sr-only">Hora de la sesión</span>
        </div>
        <Input
          aria-label="Hora de la sesión"
          className="peer appearance-none bg-background pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          type="time"
          disabled={disabled || !date}
          min={timeMin}
          max={timeMax}
          value={timeDraft}
          onChange={(event) => {
            const nextValue = event.target.value;
            setTimeDraft(nextValue);
            if (nextValue) {
              onChange(updateTimePart(value, nextValue));
            }
          }}
        />
      </div>
    </div>
  );
}

export function GroupsHome() {
  const [groups, setGroups] = useState<StoredGroup[]>([]);
  const [publishedContests, setPublishedContests] = useState<PublishedContest[]>(
    [],
  );
  const [contestId, setContestId] = useState("");
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
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
  const [enrolling, setEnrolling] = useState<StoredGroup | null>(null);
  const [enrollMode, setEnrollMode] = useState<"individual" | "pareja">(
    "individual",
  );
  const [enrollOneFirst, setEnrollOneFirst] = useState("");
  const [enrollOneLast, setEnrollOneLast] = useState("");
  const [enrollTwoFirst, setEnrollTwoFirst] = useState("");
  const [enrollTwoLast, setEnrollTwoLast] = useState("");
  const [savingEnroll, setSavingEnroll] = useState(false);
  const [confirming, setConfirming] = useState<
    | { type: "group"; group: StoredGroup }
    | { type: "team"; groupId: string; team: GroupTeam }
    | null
  >(null);

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

  const selectedContest = publishedContests.find(
    (contest) => contest.id === contestId,
  );
  const contestStartsAt = selectedContest
    ? new Date(selectedContest.startsAt)
    : null;
  const contestEndsAt = selectedContest
    ? new Date(selectedContest.endsAt)
    : null;

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
      const group = await createGroup({
        contestId,
        name: name.trim(),
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null,
      });
      setGroups((current) => [group, ...current]);
      setName("");
      setScheduledAt("");
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

  const openEnroll = (group: StoredGroup) => {
    setEnrolling(group);
    setEnrollMode("individual");
    setEnrollOneFirst("");
    setEnrollOneLast("");
    setEnrollTwoFirst("");
    setEnrollTwoLast("");
  };

  const saveEnroll = async () => {
    if (!enrolling) {
      return;
    }

    if (!enrollOneFirst.trim() || !enrollOneLast.trim()) {
      toast.error("Los nombres y apellidos son obligatorios.");
      return;
    }

    if (
      enrollMode === "pareja" &&
      (!enrollTwoFirst.trim() || !enrollTwoLast.trim())
    ) {
      toast.error("Faltan los nombres y apellidos del segundo integrante.");
      return;
    }

    setSavingEnroll(true);

    try {
      const team = await enrollTeam(enrolling.id, {
        participationMode: enrollMode,
        memberOneFirstName: enrollOneFirst.trim(),
        memberOneLastName: enrollOneLast.trim(),
        memberTwoFirstName: enrollTwoFirst.trim(),
        memberTwoLastName: enrollTwoLast.trim(),
      });
      setGroups((current) =>
        current.map((group) =>
          group.id === enrolling.id
            ? {
                ...group,
                teamCount: group.teamCount + 1,
                teams: [...group.teams, team],
              }
            : group,
        ),
      );
      toast.success(`Participante inscrito. Código: ${team.personalCode}`);
      setEnrolling(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo inscribir.",
      );
    } finally {
      setSavingEnroll(false);
    }
  };

  const confirmDelete = () => {
    if (!confirming) {
      return;
    }
    if (confirming.type === "group") {
      handleDelete(confirming.group);
    } else {
      deleteTeam(confirming.groupId, confirming.team);
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
            <form className="flex flex-col gap-4" onSubmit={handleCreate}>
              <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="group-contest">Competencia</FieldLabel>
                <FieldContent>
                  <Select
                    value={contestId}
                    onValueChange={(value) => {
                      setContestId(value);
                      setScheduledAt("");
                    }}
                  >
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
              <Field>
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
              </div>
              <Field>
                <FieldLabel htmlFor="group-scheduled">
                  Fecha y hora de la sesión
                </FieldLabel>
                <FieldContent>
                  <SessionDateTimeField
                    value={scheduledAt}
                    onChange={setScheduledAt}
                    minDate={contestStartsAt}
                    maxDate={contestEndsAt}
                    disabled={!selectedContest}
                  />
                  {!selectedContest && (
                    <FieldDescription>
                      Elige primero una competencia para fijar la sesión dentro
                      de su horario.
                    </FieldDescription>
                  )}
                </FieldContent>
              </Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={creating}>
                  <PlusIcon data-icon="inline-start" />
                  {creating ? "Creando..." : "Crear grupo"}
                </Button>
              </div>
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
                      {group.scheduledAt && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarClockIcon className="size-4" />
                          Sesión: {formatSession(group.scheduledAt)}
                        </div>
                      )}
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
                        onClick={() =>
                          setConfirming({ type: "group", group })
                        }
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
                                  onClick={() =>
                                    setConfirming({
                                      type: "team",
                                      groupId: group.id,
                                      team,
                                    })
                                  }
                                >
                                  <Trash2Icon />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4 pb-1.5 pl-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEnroll(group)}
                        >
                          <PlusIcon data-icon="inline-start" />
                          Inscribir participante
                        </Button>
                      </div>
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

      <Dialog
        open={enrolling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEnrolling(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inscribir participante</DialogTitle>
            <DialogDescription>
              {enrolling ? `En ${enrolling.name}.` : ""} Se generará su código
              personal automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {enrolling?.contestAllowPairs && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={enrollMode === "individual" ? "default" : "outline"}
                  onClick={() => setEnrollMode("individual")}
                >
                  Individual
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={enrollMode === "pareja" ? "default" : "outline"}
                  onClick={() => setEnrollMode("pareja")}
                >
                  Pareja
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="enroll-one-first">Nombres</FieldLabel>
                <FieldContent>
                  <Input
                    id="enroll-one-first"
                    value={enrollOneFirst}
                    onChange={(event) => setEnrollOneFirst(event.target.value)}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="enroll-one-last">Apellidos</FieldLabel>
                <FieldContent>
                  <Input
                    id="enroll-one-last"
                    value={enrollOneLast}
                    onChange={(event) => setEnrollOneLast(event.target.value)}
                  />
                </FieldContent>
              </Field>
            </div>
            {enrollMode === "pareja" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="enroll-two-first">
                    Nombres del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="enroll-two-first"
                      value={enrollTwoFirst}
                      onChange={(event) => setEnrollTwoFirst(event.target.value)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="enroll-two-last">
                    Apellidos del 2.º integrante
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="enroll-two-last"
                      value={enrollTwoLast}
                      onChange={(event) => setEnrollTwoLast(event.target.value)}
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
              disabled={savingEnroll}
              onClick={() => setEnrolling(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingEnroll}
              onClick={() => void saveEnroll()}
            >
              {savingEnroll ? "Inscribiendo..." : "Inscribir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.type === "group"
                ? "¿Eliminar el grupo?"
                : "¿Eliminar al participante?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.type === "group"
                ? `Se eliminará "${confirming.group.name}" y todos sus equipos registrados. Esta acción no se puede deshacer.`
                : confirming
                  ? `Se eliminará a ${teamName(confirming.team)}. Esta acción no se puede deshacer.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

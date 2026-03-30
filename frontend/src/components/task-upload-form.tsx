"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CircleHelpIcon,
  FileTextIcon,
  FolderTreeIcon,
  GraduationCapIcon,
  ImagePlusIcon,
  MessageSquareTextIcon,
  PlusIcon,
  ShieldAlertIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskContentBuilder } from "@/components/task-content-builder";
import { getTaskById, saveTask, upsertTask } from "@/lib/task-storage";
import {
  ageRanges,
  buildAgeSummary,
  categories,
  createContentBlock,
  createContentImages,
  getBlocksSummary,
  getNonEmptyBlocks,
  optionLabels,
  type CategoryValue,
  type ContentBlock,
  type ContentBlockType,
  type DifficultyKey,
  type OptionKey,
  type StoredTask,
} from "@/lib/task-schema";

const difficultyOptions = [
  { value: "__empty__", label: "Vacío" },
  { value: "easy", label: "Fácil" },
  { value: "medium", label: "Medio" },
  { value: "hard", label: "Difícil" },
] as const;
const minimumAnswerCount = 2;

type BlocksSection = "bodyBlocks" | "challengeBlocks";

type FormState = {
  title: string;
  category: CategoryValue;
  difficulties: Record<DifficultyKey, string>;
  bodyBlocks: ContentBlock[];
  challengeBlocks: ContentBlock[];
  answerCount: number;
  options: Record<OptionKey, ContentBlock[]>;
  correctOption: string;
  explanation: string;
};

type TaskUploadFormProps = {
  initialTask?: StoredTask | null;
  initialTaskId?: string | null;
  onSubmitted?: (task: StoredTask) => void;
};

const createInitialOptions = (): Record<OptionKey, ContentBlock[]> => ({
  A: [createContentBlock("text")],
  B: [createContentBlock("text")],
  C: [createContentBlock("text")],
  D: [createContentBlock("text")],
  E: [createContentBlock("text")],
  F: [createContentBlock("text")],
});

const createInitialState = (): FormState => ({
  title: "",
  category: "",
  difficulties: {
    "6–8": "",
    "8–10": "",
    "10–12": "",
    "12–14": "",
    "14–16": "",
    "16–19": "",
  },
  bodyBlocks: [createContentBlock("text")],
  challengeBlocks: [createContentBlock("challenge")],
  answerCount: minimumAnswerCount,
  options: createInitialOptions(),
  correctOption: "",
  explanation: "",
});

function createStateFromTask(task: StoredTask): FormState {
  const nextOptions = createInitialOptions();

  for (const answer of task.answers) {
    nextOptions[answer.id] = answer.blocks;
  }

  return {
    title: task.title,
    category: task.category,
    difficulties: task.difficulties,
    bodyBlocks: task.bodyBlocks,
    challengeBlocks: task.challengeBlocks,
    answerCount: task.answers.length,
    options: nextOptions,
    correctOption: task.correctAnswerId,
    explanation: task.explanation,
  };
}

function validateForm(state: FormState) {
  const errors: string[] = [];
  const activeOptionLabels = optionLabels.slice(0, state.answerCount);
  const completedOptions = activeOptionLabels.filter(
    (label) => getNonEmptyBlocks(state.options[label]).length > 0,
  );
  const nonEmptyBodyBlocks = getNonEmptyBlocks(state.bodyBlocks);
  const nonEmptyChallengeBlocks = getNonEmptyBlocks(state.challengeBlocks);
  const challengeQuestionBlocks = state.challengeBlocks.filter(
    (block) => block.type === "challenge" && block.content.trim().length > 0,
  );

  if (!state.title.trim()) {
    errors.push("El título es obligatorio.");
  }

  if (!state.category) {
    errors.push("Debes seleccionar una categoría.");
  }

  if (!Object.values(state.difficulties).some(Boolean)) {
    errors.push("Debes asignar dificultad al menos a un rango de edad.");
  }

  if (nonEmptyBodyBlocks.length === 0) {
    errors.push("Debes agregar contenido en el cuerpo.");
  }

  if (nonEmptyChallengeBlocks.length === 0) {
    errors.push("Debes agregar contenido en la pregunta o desafío.");
  }

  if (challengeQuestionBlocks.length === 0) {
    errors.push(
      "Debes agregar al menos un bloque de pregunta o desafío en esa sección.",
    );
  }

  if (completedOptions.length < minimumAnswerCount) {
    errors.push("Debes completar al menos dos respuestas.");
  }

  if (!state.correctOption) {
    errors.push("Debes marcar una respuesta correcta.");
  }

  if (
    state.correctOption &&
    (!activeOptionLabels.includes(state.correctOption as OptionKey) ||
      getNonEmptyBlocks(state.options[state.correctOption as OptionKey]).length === 0)
  ) {
    errors.push("La respuesta marcada como correcta debe tener contenido.");
  }

  if (!state.explanation.trim()) {
    errors.push("La explicación de la respuesta es obligatoria.");
  }

  const normalizedValues = completedOptions
    .map((label) => getBlocksSummary(state.options[label]))
    .filter(Boolean);
  if (new Set(normalizedValues).size !== normalizedValues.length) {
    errors.push("Las respuestas no deben repetir el mismo contenido.");
  }

  return errors;
}

function buildStoredTask(state: FormState, existingTaskId?: string): StoredTask {
  const activeOptionLabels = optionLabels.slice(0, state.answerCount);

  return {
    id: existingTaskId ?? crypto.randomUUID(),
    title: state.title.trim(),
    category: state.category as Exclude<CategoryValue, "">,
    difficulties: state.difficulties,
    bodyBlocks: state.bodyBlocks,
    challengeBlocks: state.challengeBlocks,
    answers: activeOptionLabels.map((label) => ({
      id: label,
      blocks: state.options[label],
    })),
    correctAnswerId: state.correctOption as OptionKey,
    explanation: state.explanation.trim(),
    status: "Borrador",
    updatedAt: new Date().toISOString(),
  };
}

export function TaskUploadForm({
  initialTask = null,
  initialTaskId = null,
  onSubmitted,
}: TaskUploadFormProps) {
  const fallbackInitialTask =
    initialTask ??
    (typeof window !== "undefined" && initialTaskId ? getTaskById(initialTaskId) : null);

  const [form, setForm] = useState<FormState>(() =>
    fallbackInitialTask ? createStateFromTask(fallbackInitialTask) : createInitialState(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [loadedTask, setLoadedTask] = useState<StoredTask | null>(fallbackInitialTask);
  const activeOptionLabels = optionLabels.slice(0, form.answerCount);

  const completedOptionsCount = useMemo(
    () =>
      activeOptionLabels.filter(
        (label) => getNonEmptyBlocks(form.options[label]).length > 0,
      ).length,
    [activeOptionLabels, form.options],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(form);
    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      toast.error("La tarea todavía no está lista para guardarse.");
      return;
    }

    const task = buildStoredTask(form, loadedTask?.id);

    if (loadedTask) {
      upsertTask(task);
    } else {
      saveTask(task);
    }

    onSubmitted?.(task);
    setLoadedTask(task);
    setForm(loadedTask ? createStateFromTask(task) : createInitialState());
    setErrors([]);
    toast.success(
      loadedTask
        ? "La tarea se actualizó en el frontend."
        : "La tarea se guardó en el frontend.",
      {
      description: `${task.title} · ${buildAgeSummary(task.difficulties)}`,
      },
    );
  };

  const handleReset = () => {
    setForm(
      loadedTask
        ? createStateFromTask(loadedTask)
        : createInitialState(),
    );
    setErrors([]);
  };

  const updateSectionBlocks = (
    section: BlocksSection,
    blockId: string,
    updater: (block: ContentBlock) => ContentBlock,
  ) => {
    setForm((current) => ({
      ...current,
      [section]: current[section].map((block) =>
        block.id === blockId ? updater(block) : block,
      ),
    }));
  };

  const updateOptionBlocks = (
    optionKey: OptionKey,
    blockId: string,
    updater: (block: ContentBlock) => ContentBlock,
  ) => {
    setForm((current) => ({
      ...current,
      options: {
        ...current.options,
        [optionKey]: current.options[optionKey].map((block) =>
          block.id === blockId ? updater(block) : block,
        ),
      },
    }));
  };

  const addSectionBlock = (
    section: BlocksSection,
    type: ContentBlockType = "text",
  ) => {
    const newBlock = createContentBlock(type);

    setForm((current) => ({
      ...current,
      [section]: [...current[section], newBlock],
    }));

    return newBlock.id;
  };

  const addOptionBlock = (optionKey: OptionKey, type: ContentBlockType = "text") => {
    const newBlock = createContentBlock(type);

    setForm((current) => ({
      ...current,
      options: {
        ...current.options,
        [optionKey]: [...current.options[optionKey], newBlock],
      },
    }));

    return newBlock.id;
  };

  const removeSectionBlock = (section: BlocksSection, blockId: string) => {
    setForm((current) => {
      const nextBlocks = current[section].filter((item) => item.id !== blockId);

      return {
        ...current,
        [section]:
          nextBlocks.length > 0
            ? nextBlocks
            : [createContentBlock(section === "challengeBlocks" ? "challenge" : "text")],
      };
    });
  };

  const removeOptionBlock = (optionKey: OptionKey, blockId: string) => {
    setForm((current) => {
      const nextBlocks = current.options[optionKey].filter(
        (item) => item.id !== blockId,
      );

      return {
        ...current,
        options: {
          ...current.options,
          [optionKey]:
            nextBlocks.length > 0 ? nextBlocks : [createContentBlock("text")],
        },
      };
    });
  };

  const moveSectionBlock = (
    section: BlocksSection,
    fromBlockId: string,
    toBlockId: string,
    position: "before" | "after",
  ) => {
    setForm((current) => {
      const blocks = [...current[section]];
      const fromIndex = blocks.findIndex((block) => block.id === fromBlockId);
      const toIndex = blocks.findIndex((block) => block.id === toBlockId);

      if (fromIndex === -1 || toIndex === -1) {
        return current;
      }

      const [movedBlock] = blocks.splice(fromIndex, 1);
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const insertIndex =
        position === "before" ? adjustedToIndex : adjustedToIndex + 1;

      blocks.splice(insertIndex, 0, movedBlock);

      return {
        ...current,
        [section]: blocks,
      };
    });
  };

  const moveOptionBlock = (
    optionKey: OptionKey,
    fromBlockId: string,
    toBlockId: string,
    position: "before" | "after",
  ) => {
    setForm((current) => {
      const blocks = [...current.options[optionKey]];
      const fromIndex = blocks.findIndex((block) => block.id === fromBlockId);
      const toIndex = blocks.findIndex((block) => block.id === toBlockId);

      if (fromIndex === -1 || toIndex === -1) {
        return current;
      }

      const [movedBlock] = blocks.splice(fromIndex, 1);
      const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      const insertIndex =
        position === "before" ? adjustedToIndex : adjustedToIndex + 1;

      blocks.splice(insertIndex, 0, movedBlock);

      return {
        ...current,
        options: {
          ...current.options,
          [optionKey]: blocks,
        },
      };
    });
  };

  const updateSectionBlockImage = async (
    section: BlocksSection,
    blockId: string,
    files: FileList | null,
  ) => {
    const nextImage = (await createContentImages(files))[0] ?? null;

    updateSectionBlocks(section, blockId, (block) => ({
      ...block,
      image: nextImage,
      widthPercent: block.widthPercent || 100,
    }));
  };

  const updateOptionBlockImage = async (
    optionKey: OptionKey,
    blockId: string,
    files: FileList | null,
  ) => {
    const nextImage = (await createContentImages(files))[0] ?? null;

    updateOptionBlocks(optionKey, blockId, (block) => ({
      ...block,
      image: nextImage,
      widthPercent: block.widthPercent || 100,
    }));
  };

  const updateSectionBlockWidth = (
    section: BlocksSection,
    blockId: string,
    widthPercent: number,
  ) => {
    updateSectionBlocks(section, blockId, (block) => ({
      ...block,
      widthPercent,
    }));
  };

  const updateOptionBlockWidth = (
    optionKey: OptionKey,
    blockId: string,
    widthPercent: number,
  ) => {
    updateOptionBlocks(optionKey, blockId, (block) => ({
      ...block,
      widthPercent,
    }));
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={handleSubmit}
      onReset={handleReset}
    >
      {errors.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>No se pudo guardar la tarea</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 flex list-disc flex-col gap-1">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Información general</CardTitle>
          <CardDescription>
            Define la identidad y la clasificación principal de la tarea.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field data-invalid={!form.title.trim() && errors.length > 0}>
              <FieldLabel htmlFor="title">Título</FieldLabel>
              <FieldContent>
                <Input
                  id="title"
                  aria-invalid={!form.title.trim() && errors.length > 0}
                  placeholder="Ej. Secuencia incorrecta de transformaciones"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <FieldDescription>
                  Debe permitir identificar la tarea rápidamente.
                </FieldDescription>
              </FieldContent>
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Categoría</FieldLegend>
              <FieldDescription>
                Selecciona la categoría principal de la tarea.
              </FieldDescription>
              <RadioGroup
                value={form.category}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    category: value as CategoryValue,
                  }))
                }
              >
                {categories.map((category) => (
                  <Field key={category} orientation="horizontal">
                    <RadioGroupItem id={`category-${category}`} value={category} />
                    <FieldLabel htmlFor={`category-${category}`}>
                      {category}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              {errors.length > 0 && !form.category && (
                <FieldError>Debes seleccionar una categoría.</FieldError>
              )}
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <GraduationCapIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Dificultad por rango de edad</CardTitle>
              <CardDescription>
                Define en qué grupos aplica la tarea y con qué dificultad.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <FieldGroup>
            <FieldDescription>
              Selecciona la dificultad correspondiente para cada rango de edad
              que aplique.
            </FieldDescription>
            {ageRanges.map((range) => (
              <Field key={range} orientation="responsive">
                <FieldContent className="gap-0.5">
                  <FieldTitle>{range}</FieldTitle>
                </FieldContent>
                <Select
                  value={form.difficulties[range] || "__empty__"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      difficulties: {
                        ...current.difficulties,
                        [range]: value === "__empty__" ? "" : value,
                      },
                    }))
                  }
                >
                  <SelectTrigger className="w-full md:min-w-48">
                    <SelectValue placeholder="Selecciona dificultad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {difficultyOptions.map((option) => (
                        <SelectItem key={option.label} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ))}
            {errors.length > 0 &&
              !Object.values(form.difficulties).some(Boolean) && (
                <FieldError>
                  Debes asignar dificultad al menos a un rango de edad.
                </FieldError>
              )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <FileTextIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Cuerpo</CardTitle>
              <CardDescription>
                Construye el contenido principal de la tarea con bloques.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <TaskContentBuilder
            allowedBlockTypes={["text", "image"]}
            blocks={form.bodyBlocks}
            description="Agrega texto o imágenes para el cuerpo."
            onAddBlock={(type) => addSectionBlock("bodyBlocks", type)}
            onRemoveBlock={(blockId) => removeSectionBlock("bodyBlocks", blockId)}
            onMoveBlock={(fromBlockId, toBlockId, position) =>
              moveSectionBlock("bodyBlocks", fromBlockId, toBlockId, position)
            }
            onUpdateBlockContent={(blockId, content) =>
              updateSectionBlocks("bodyBlocks", blockId, (current) => ({
                ...current,
                content,
              }))
            }
            onUpdateBlockImage={(blockId, files) => {
              void updateSectionBlockImage("bodyBlocks", blockId, files);
            }}
            onUpdateBlockWidth={(blockId, widthPercent) =>
              updateSectionBlockWidth("bodyBlocks", blockId, widthPercent)
            }
            showChallengeErrors={false}
            textPlaceholder="Escribe el contenido del cuerpo."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <MessageSquareTextIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Pregunta o desafío</CardTitle>
              <CardDescription>
                Mantén la consigna en una sección aparte, usando el mismo editor
                de bloques.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <TaskContentBuilder
            allowedBlockTypes={["text", "image", "challenge"]}
            blocks={form.challengeBlocks}
            description="Agrega bloques para redactar la consigna."
            onAddBlock={(type) =>
              addSectionBlock("challengeBlocks", type ?? "challenge")
            }
            onRemoveBlock={(blockId) =>
              removeSectionBlock("challengeBlocks", blockId)
            }
            onMoveBlock={(fromBlockId, toBlockId, position) =>
              moveSectionBlock("challengeBlocks", fromBlockId, toBlockId, position)
            }
            onUpdateBlockContent={(blockId, content) =>
              updateSectionBlocks("challengeBlocks", blockId, (current) => ({
                ...current,
                content,
              }))
            }
            onUpdateBlockImage={(blockId, files) => {
              void updateSectionBlockImage("challengeBlocks", blockId, files);
            }}
            onUpdateBlockWidth={(blockId, widthPercent) =>
              updateSectionBlockWidth("challengeBlocks", blockId, widthPercent)
            }
            showChallengeErrors={errors.length > 0}
            textPlaceholder="Escribe el contenido de la consigna."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <CircleHelpIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Respuestas</CardTitle>
              <CardDescription>
                Cada respuesta tiene su propia sección y también usa bloques.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <FieldSet>
            <FieldLegend variant="label">Respuestas disponibles</FieldLegend>
            <FieldDescription>
              Marca una sola respuesta como correcta.
            </FieldDescription>
            <RadioGroup
              value={form.correctOption}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, correctOption: value }))
              }
            >
              <div className="flex flex-col gap-6">
                {activeOptionLabels.map((label, index) => {
                  const invalid =
                    errors.length > 0 &&
                    (completedOptionsCount < minimumAnswerCount ||
                      (form.correctOption === label &&
                        getNonEmptyBlocks(form.options[label]).length === 0));

                  return (
                    <Field key={label} data-invalid={invalid}>
                      <Card>
                        <CardHeader className="border-b">
                          <Field orientation="horizontal">
                            <RadioGroupItem
                              id={`correct-${label}`}
                              value={label}
                            />
                            <FieldContent className="gap-1">
                              <FieldLabel htmlFor={`correct-${label}`}>
                                Respuesta {index + 1}
                              </FieldLabel>
                              <FieldDescription>
                                Puedes combinar texto e imágenes en esta respuesta.
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <TaskContentBuilder
                            allowedBlockTypes={["text", "image"]}
                            blocks={form.options[label]}
                            description="Agrega bloques para construir esta respuesta."
                            onAddBlock={(type) => addOptionBlock(label, type)}
                            onRemoveBlock={(blockId) =>
                              removeOptionBlock(label, blockId)
                            }
                            onMoveBlock={(fromBlockId, toBlockId, position) =>
                              moveOptionBlock(label, fromBlockId, toBlockId, position)
                            }
                            onUpdateBlockContent={(blockId, content) =>
                              updateOptionBlocks(label, blockId, (current) => ({
                                ...current,
                                content,
                              }))
                            }
                            onUpdateBlockImage={(blockId, files) => {
                              void updateOptionBlockImage(label, blockId, files);
                            }}
                            onUpdateBlockWidth={(blockId, widthPercent) =>
                              updateOptionBlockWidth(label, blockId, widthPercent)
                            }
                            showChallengeErrors={false}
                            textPlaceholder="Escribe el contenido de la respuesta."
                          />
                        </CardContent>
                      </Card>
                    </Field>
                  );
                })}
              </div>
            </RadioGroup>
            {form.answerCount < optionLabels.length && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    answerCount: Math.min(
                      current.answerCount + 1,
                      optionLabels.length,
                    ),
                  }))
                }
              >
                <PlusIcon data-icon="inline-start" />
                Agregar respuesta
              </Button>
            )}
            {errors.length > 0 && (
              <FieldError errors={errors.map((message) => ({ message }))} />
            )}
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <FolderTreeIcon className="text-muted-foreground" />
            <div>
              <CardTitle>Explicación de la respuesta</CardTitle>
              <CardDescription>
                Deja trazabilidad pedagógica para revisión y publicación.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Field data-invalid={!form.explanation.trim() && errors.length > 0}>
            <FieldLabel htmlFor="explanation">Explicación</FieldLabel>
            <FieldContent>
              <Textarea
                id="explanation"
                rows={6}
                aria-invalid={!form.explanation.trim() && errors.length > 0}
                placeholder="Explica por qué la respuesta correcta resuelve la tarea y cómo se descartan las demás."
                value={form.explanation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    explanation: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                Esta parte no la ve el estudiante, pero sí mejora la edición
                interna.
              </FieldDescription>
            </FieldContent>
          </Field>
        </CardContent>
        <CardFooter className="justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImagePlusIcon />
            Las tareas se guardan en el frontend con sus imágenes.
          </div>
          <div className="flex gap-3">
            <Button type="reset" variant="outline">
              Limpiar
            </Button>
            <Button type="submit">
              <UploadIcon data-icon="inline-start" />
              {loadedTask ? "Guardar cambios" : "Guardar borrador"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}

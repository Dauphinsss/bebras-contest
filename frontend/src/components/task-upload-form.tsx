"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BetweenHorizonalStartIcon,
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
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DragDropEditor } from "@/components/drag-drop-editor";
import { TaskContentBuilder } from "@/components/task-content-builder";
import { createTask, updateTask } from "@/lib/tasks-api";
import {
  ageRanges,
  buildAgeSummary,
  categories,
  createContentBlock,
  createContentImages,
  getBlocksSummary,
  getNonEmptyBlocks,
  normalizeCategories,
  optionLabels,
  type AnswerType,
  type CategoryItem,
  type ContentBlock,
  type ContentBlockType,
  type DifficultyKey,
  type MultipleChoiceOrderMode,
  type OptionKey,
  type StoredTaskRangeAnswer,
  type StoredTaskDragDropItem,
  type StoredTask,
} from "@/lib/task-schema";

const difficultyOptions = [
  { value: "easy", label: "Fácil" },
  { value: "medium", label: "Medio" },
  { value: "hard", label: "Difícil" },
] as const;
const minimumAnswerCount = 2;

type BlocksSection = "bodyBlocks" | "challengeBlocks";

type FormState = {
  title: string;
  categories: CategoryItem[];
  selectedAgeRanges: Record<DifficultyKey, boolean>;
  difficulties: Record<DifficultyKey, string>;
  bodyBlocks: ContentBlock[];
  challengeBlocks: ContentBlock[];
  answerType: AnswerType;
  multipleChoiceOrderMode: MultipleChoiceOrderMode;
  answerCount: number;
  answerOrder: OptionKey[];
  multipleChoiceContentType: "text" | "image";
  options: Record<OptionKey, ContentBlock[]>;
  correctOption: string;
  shortAnswer: string;
  rangeAnswers: StoredTaskRangeAnswer[];
  dragDropBackground: {
    id: string;
    name: string;
    url: string;
  } | null;
  dragDropItems: StoredTaskDragDropItem[];
  explanation: string;
};

type TaskUploadFormProps = {
  initialTask?: StoredTask | null;
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
  categories: [],
  selectedAgeRanges: {
    "6–8": false,
    "8–10": false,
    "10–12": false,
    "12–14": false,
    "14–16": false,
    "16–19": false,
  },
  difficulties: {
    "6–8": "",
    "8–10": "",
    "10–12": "",
    "12–14": "",
    "14–16": "",
    "16–19": "",
  },
  bodyBlocks: [createContentBlock("text")],
  challengeBlocks: [createContentBlock("text")],
  answerType: "multiple_choice",
  multipleChoiceOrderMode: "fixed",
  answerCount: minimumAnswerCount,
  answerOrder: [...optionLabels],
  multipleChoiceContentType: "text",
  options: createInitialOptions(),
  correctOption: "",
  shortAnswer: "",
  rangeAnswers: [
    {
      id: crypto.randomUUID(),
      label: "Rango válido",
      min: 0,
      max: 10,
    },
  ],
  dragDropBackground: null,
  dragDropItems: [
    {
      id: crypto.randomUUID(),
      label: "Objeto 1",
      image: null,
      targetX: 50,
      targetY: 50,
      tolerance: 10,
    },
  ],
  explanation: "",
});

function createStateFromTask(task: StoredTask): FormState {
  const nextOptions = createInitialOptions();
  let multipleChoiceContentType: "text" | "image" = "text";

  for (const answer of task.answers) {
    nextOptions[answer.id] = answer.blocks;
    if (answer.blocks.some((block) => block.type === "image")) {
      multipleChoiceContentType = "image";
    }
  }

  return {
    title: task.title,
    categories: normalizeCategories(task.categories),
    selectedAgeRanges: {
      "6–8": Boolean(task.difficulties["6–8"]),
      "8–10": Boolean(task.difficulties["8–10"]),
      "10–12": Boolean(task.difficulties["10–12"]),
      "12–14": Boolean(task.difficulties["12–14"]),
      "14–16": Boolean(task.difficulties["14–16"]),
      "16–19": Boolean(task.difficulties["16–19"]),
    },
    difficulties: task.difficulties,
    bodyBlocks: task.bodyBlocks,
    challengeBlocks: task.challengeBlocks,
    answerType: task.answerType ?? "multiple_choice",
    multipleChoiceOrderMode: task.multipleChoiceOrderMode ?? "fixed",
    answerCount:
      task.answerType === "multiple_choice"
        ? Math.max(task.answers.length, minimumAnswerCount)
        : minimumAnswerCount,
    answerOrder: [
      ...task.answers.map((answer) => answer.id),
      ...optionLabels.filter(
        (label) => !task.answers.some((answer) => answer.id === label),
      ),
    ],
    multipleChoiceContentType,
    options: nextOptions,
    correctOption: task.correctAnswerId,
    shortAnswer: task.shortAnswer ?? "",
    rangeAnswers:
      (task.rangeAnswers ?? []).length > 0
        ? task.rangeAnswers
        : [
            {
              id: crypto.randomUUID(),
              label: "Rango válido",
              min: 0,
              max: 10,
            },
          ],
    dragDropBackground: task.dragDropBackground ?? null,
    dragDropItems:
      (task.dragDropItems ?? []).length > 0
        ? task.dragDropItems
        : [
            {
              id: crypto.randomUUID(),
              label: "Objeto 1",
              image: null,
              targetX: 50,
              targetY: 50,
              tolerance: 10,
            },
          ],
    explanation: task.explanation,
  };
}

function validateForm(state: FormState) {
  const errors: string[] = [];
  const activeOptionLabels = state.answerOrder.slice(0, state.answerCount);
  const completedOptions = activeOptionLabels.filter(
    (label) => getNonEmptyBlocks(state.options[label]).length > 0,
  );
  const nonEmptyBodyBlocks = getNonEmptyBlocks(state.bodyBlocks);
  const nonEmptyChallengeBlocks = getNonEmptyBlocks(state.challengeBlocks);

  if (!state.title.trim()) {
    errors.push("El título es obligatorio.");
  }

  if (state.categories.length === 0) {
    errors.push("Debes seleccionar al menos una categoría.");
  }

  const selectedRanges = ageRanges.filter((range) => state.selectedAgeRanges[range]);

  if (selectedRanges.length === 0) {
    errors.push("Debes activar al menos un rango de edad.");
  }

  if (selectedRanges.some((range) => !state.difficulties[range])) {
    errors.push("Cada rango activado debe tener una dificultad.");
  }

  if (nonEmptyBodyBlocks.length === 0) {
    errors.push("Debes agregar contenido en el cuerpo.");
  }

  if (nonEmptyChallengeBlocks.length === 0) {
    errors.push("Debes agregar contenido en la pregunta o desafío.");
  }

  if (state.answerType === "multiple_choice") {
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

    const normalizedValues = completedOptions
      .map((label) => getBlocksSummary(state.options[label]))
      .filter(Boolean);
    if (new Set(normalizedValues).size !== normalizedValues.length) {
      errors.push("Las respuestas no deben repetir el mismo contenido.");
    }
  }

  if (state.answerType === "short_text" && !state.shortAnswer.trim()) {
    errors.push("Debes definir la respuesta corta esperada.");
  }

  if (state.answerType === "range") {
    if (state.rangeAnswers.length === 0) {
      errors.push("Debes agregar al menos un rango válido.");
    }

    for (const rangeAnswer of state.rangeAnswers) {
      if (!rangeAnswer.label.trim()) {
        errors.push("Cada rango debe tener una etiqueta.");
      }

      if (Number.isNaN(rangeAnswer.min) || Number.isNaN(rangeAnswer.max)) {
        errors.push("Cada rango debe tener valores numéricos válidos.");
      }

      if (rangeAnswer.min > rangeAnswer.max) {
        errors.push("En cada rango, el mínimo no puede ser mayor que el máximo.");
      }
    }
  }

  if (state.answerType === "drag_drop") {
    if (!state.dragDropBackground) {
      errors.push("Debes agregar la imagen de fondo para arrastrar y soltar.");
    }

    if (state.dragDropItems.length === 0) {
      errors.push("Debes agregar al menos un objeto arrastrable.");
    }

    for (const item of state.dragDropItems) {
      if (!item.label.trim()) {
        errors.push("Cada objeto arrastrable debe tener un nombre.");
      }

      if (!item.image) {
        errors.push("Cada objeto arrastrable debe tener una imagen.");
      }

      if (item.targetX < 0 || item.targetX > 100 || item.targetY < 0 || item.targetY > 100) {
        errors.push("La posición correcta de cada objeto debe estar entre 0 y 100.");
      }

      if (item.tolerance <= 0 || item.tolerance > 100) {
        errors.push("El margen permitido de cada objeto debe estar entre 1 y 100.");
      }
    }
  }

  if (!state.explanation.trim()) {
    errors.push("La explicación de la respuesta es obligatoria.");
  }

  return errors;
}

function buildStoredTask(state: FormState, existingTaskId?: string): StoredTask {
  const activeOptionLabels = state.answerOrder.slice(0, state.answerCount);

  return {
    id: existingTaskId ?? crypto.randomUUID(),
    title: state.title.trim(),
    categories: state.categories,
    difficulties: ageRanges.reduce<Record<DifficultyKey, string>>((acc, range) => {
      acc[range] = state.selectedAgeRanges[range] ? state.difficulties[range] : "";
      return acc;
    }, {
      "6–8": "",
      "8–10": "",
      "10–12": "",
      "12–14": "",
      "14–16": "",
      "16–19": "",
    }),
    bodyBlocks: state.bodyBlocks,
    challengeBlocks: state.challengeBlocks,
    answerType: state.answerType,
    multipleChoiceOrderMode:
      state.answerType === "multiple_choice"
        ? state.multipleChoiceOrderMode
        : "fixed",
    answers:
      state.answerType === "multiple_choice"
        ? activeOptionLabels.map((label) => ({
            id: label,
            blocks: state.options[label],
          }))
        : [],
    correctAnswerId:
      state.answerType === "multiple_choice"
        ? (state.correctOption as OptionKey)
        : "A",
    shortAnswer: state.answerType === "short_text" ? state.shortAnswer.trim() : "",
    rangeAnswers:
      state.answerType === "range"
        ? state.rangeAnswers.map((rangeAnswer) => ({
            ...rangeAnswer,
            label: rangeAnswer.label.trim(),
          }))
        : [],
    dragDropBackground:
      state.answerType === "drag_drop" ? state.dragDropBackground : null,
    dragDropItems:
      state.answerType === "drag_drop"
        ? state.dragDropItems.map((item) => ({
            ...item,
            label: item.label.trim(),
          }))
        : [],
    explanation: state.explanation.trim(),
    status: "Borrador",
    updatedAt: new Date().toISOString(),
  };
}

export function TaskUploadForm({
  initialTask = null,
  onSubmitted,
}: TaskUploadFormProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialTask ? createStateFromTask(initialTask) : createInitialState(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [loadedTask, setLoadedTask] = useState<StoredTask | null>(initialTask);
  const activeOptionLabels = form.answerOrder.slice(0, form.answerCount);

  const completedOptionsCount = useMemo(
    () =>
      activeOptionLabels.filter(
        (label) => getNonEmptyBlocks(form.options[label]).length > 0,
      ).length,
    [activeOptionLabels, form.options],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateForm(form);
    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      toast.error("La tarea todavía no está lista para guardarse.");
      return;
    }

    const draft = buildStoredTask(form, loadedTask?.id);
    const task = loadedTask ? await updateTask(draft) : await createTask(draft);

    onSubmitted?.(task);
    setLoadedTask(task);
    setForm(loadedTask ? createStateFromTask(task) : createInitialState());
    setErrors([]);
    toast.success(
      loadedTask
        ? "La tarea se actualizó correctamente."
        : "La tarea se guardó correctamente.",
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

  const removeSectionBlock = (section: BlocksSection, blockId: string) => {
    setForm((current) => {
      const nextBlocks = current[section].filter((item) => item.id !== blockId);

      return {
        ...current,
        [section]:
          nextBlocks.length > 0
            ? nextBlocks
            : [createContentBlock("text")],
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

  const moveAnswer = (optionKey: OptionKey, direction: "up" | "down") => {
    setForm((current) => {
      const activeOrder = current.answerOrder.slice(0, current.answerCount);
      const inactiveOrder = current.answerOrder.slice(current.answerCount);
      const currentIndex = activeOrder.indexOf(optionKey);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= activeOrder.length) {
        return current;
      }

      const nextActiveOrder = [...activeOrder];
      [nextActiveOrder[currentIndex], nextActiveOrder[targetIndex]] = [
        nextActiveOrder[targetIndex],
        nextActiveOrder[currentIndex],
      ];

      return {
        ...current,
        answerOrder: [...nextActiveOrder, ...inactiveOrder],
      };
    });
  };

  const updateDragDropBackground = async (files: FileList | null) => {
    const nextImage = (await createContentImages(files))[0] ?? null;

    setForm((current) => ({
      ...current,
      dragDropBackground: nextImage,
    }));
  };

  const updateDragDropItemImage = async (itemId: string, files: FileList | null) => {
    const nextImage = (await createContentImages(files))[0] ?? null;

    setForm((current) => ({
      ...current,
      dragDropItems: current.dragDropItems.map((item) =>
        item.id === itemId ? { ...item, image: nextImage } : item,
      ),
    }));
  };

  const updateDragDropItem = (
    itemId: string,
    patch: Partial<Pick<StoredTaskDragDropItem, "label" | "targetX" | "targetY" | "tolerance">>,
  ) => {
    setForm((current) => ({
      ...current,
      dragDropItems: current.dragDropItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    }));
  };

  return (
    <form
      className="flex flex-col gap-5 sm:gap-6"
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
                Selecciona una o varias categorías para la tarea.
              </FieldDescription>
              <div className="flex flex-col gap-3">
                {categories.map((category) => {
                  const checked = form.categories.includes(category);

                  return (
                    <Field key={category} orientation="horizontal">
                      <Checkbox
                        checked={checked}
                        id={`category-${category}`}
                        onCheckedChange={(nextChecked) =>
                          setForm((current) => ({
                            ...current,
                            categories: nextChecked
                              ? [...current.categories, category]
                              : current.categories.filter(
                                  (currentCategory) => currentCategory !== category,
                                ),
                          }))
                        }
                      />
                      <FieldLabel htmlFor={`category-${category}`}>
                        {category}
                      </FieldLabel>
                    </Field>
                  );
                })}
              </div>
              {errors.length > 0 && form.categories.length === 0 && (
                <FieldError>Debes seleccionar al menos una categoría.</FieldError>
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
              Activa los rangos de edad donde aplica la tarea y luego define su
              dificultad.
            </FieldDescription>
            {ageRanges.map((range) => (
              <Field key={range} orientation="responsive">
                <FieldContent className="gap-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={form.selectedAgeRanges[range]}
                      id={`age-range-${range}`}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          selectedAgeRanges: {
                            ...current.selectedAgeRanges,
                            [range]: checked === true,
                          },
                          difficulties: {
                            ...current.difficulties,
                            [range]: checked === true ? current.difficulties[range] : "",
                          },
                        }))
                      }
                    />
                    <FieldLabel htmlFor={`age-range-${range}`}>{range}</FieldLabel>
                  </div>
                </FieldContent>
                <Select
                  disabled={!form.selectedAgeRanges[range]}
                  value={form.difficulties[range] || undefined}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      difficulties: {
                        ...current.difficulties,
                        [range]: value,
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
              !Object.values(form.selectedAgeRanges).some(Boolean) && (
                <FieldError>
                  Debes activar al menos un rango de edad.
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
            allowedBlockTypes={["text", "image"]}
            blocks={form.challengeBlocks}
            description="Agrega bloques para redactar la consigna."
            onAddBlock={(type) => addSectionBlock("challengeBlocks", type ?? "text")}
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
            showChallengeErrors={false}
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
                Define el tipo de respuesta y su configuración.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Tipo de respuesta</FieldLegend>
              <FieldDescription>
                Elige cómo responderá el participante esta tarea.
              </FieldDescription>
              <RadioGroup
                value={form.answerType}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    answerType: value as AnswerType,
                    answerCount:
                      value === "multiple_choice"
                        ? Math.max(current.answerCount, minimumAnswerCount)
                        : current.answerCount,
                  }))
                }
              >
                <Field orientation="horizontal">
                  <RadioGroupItem
                    id="answer-type-multiple-choice"
                    value="multiple_choice"
                  />
                  <FieldLabel htmlFor="answer-type-multiple-choice">
                    Opción múltiple
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem
                    id="answer-type-short-text"
                    value="short_text"
                  />
                  <FieldLabel htmlFor="answer-type-short-text">
                    Respuesta corta
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="answer-type-range" value="range" />
                  <FieldLabel htmlFor="answer-type-range">
                    Respuesta por rangos
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="answer-type-drag-drop" value="drag_drop" />
                  <FieldLabel htmlFor="answer-type-drag-drop">
                    Arrastrar y soltar
                  </FieldLabel>
                </Field>
              </RadioGroup>
            </FieldSet>

            {form.answerType === "multiple_choice" && (
              <FieldSet>
                <FieldLegend variant="label">Respuestas disponibles</FieldLegend>
                <FieldDescription>
                  Marca una sola respuesta como correcta.
                </FieldDescription>
                <FieldSet>
                  <FieldLegend variant="label">Tipo de contenido</FieldLegend>
                  <FieldDescription>
                    Todas las respuestas de opción múltiple usarán este mismo tipo.
                  </FieldDescription>
                  <RadioGroup
                    value={form.multipleChoiceContentType}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        multipleChoiceContentType: value as "text" | "image",
                        options: optionLabels.reduce<Record<OptionKey, ContentBlock[]>>(
                          (acc, optionLabel) => {
                            acc[optionLabel] = current.answerOrder
                              .slice(0, current.answerCount)
                              .includes(optionLabel)
                              ? [
                                  createContentBlock(
                                    value === "image" ? "image" : "text",
                                  ),
                                ]
                              : current.options[optionLabel];
                            return acc;
                          },
                          {
                            A: current.options.A,
                            B: current.options.B,
                            C: current.options.C,
                            D: current.options.D,
                            E: current.options.E,
                            F: current.options.F,
                          },
                        ),
                      }))
                    }
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        id="multiple-choice-content-text"
                        value="text"
                      />
                      <FieldLabel htmlFor="multiple-choice-content-text">
                        Texto
                      </FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        id="multiple-choice-content-image"
                        value="image"
                      />
                      <FieldLabel htmlFor="multiple-choice-content-image">
                        Imagen
                      </FieldLabel>
                    </Field>
                  </RadioGroup>
                </FieldSet>
                <FieldSet>
                  <FieldLegend variant="label">Orden de las respuestas</FieldLegend>
                  <FieldDescription>
                    Define si el estudiante verá las respuestas en el orden creado o en orden aleatorio.
                  </FieldDescription>
                  <RadioGroup
                    value={form.multipleChoiceOrderMode}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        multipleChoiceOrderMode: value as MultipleChoiceOrderMode,
                      }))
                    }
                  >
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        id="multiple-choice-order-fixed"
                        value="fixed"
                      />
                      <FieldLabel htmlFor="multiple-choice-order-fixed">
                        Orden específico
                      </FieldLabel>
                    </Field>
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        id="multiple-choice-order-random"
                        value="random"
                      />
                      <FieldLabel htmlFor="multiple-choice-order-random">
                        Orden aleatorio
                      </FieldLabel>
                    </Field>
                  </RadioGroup>
                </FieldSet>
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
                      const optionBlock =
                        form.options[label][0] ??
                        createContentBlock(form.multipleChoiceContentType);

                      return (
                        <Field key={label} data-invalid={invalid}>
                          <Card className="rounded-xl border bg-card shadow-sm">
                            <CardHeader className="border-b">
                              <div className="flex items-center justify-between gap-4">
                                <Field orientation="horizontal">
                                  <RadioGroupItem
                                    id={`correct-${label}`}
                                    value={label}
                                  />
                                  <FieldContent className="gap-1">
                                    <FieldLabel htmlFor={`correct-${label}`}>
                                      Respuesta {index + 1}
                                    </FieldLabel>
                                  </FieldContent>
                                </Field>
                                {form.multipleChoiceOrderMode === "fixed" && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      disabled={index === 0}
                                      onClick={() => moveAnswer(label, "up")}
                                    >
                                      <ArrowUpIcon />
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      disabled={index === activeOptionLabels.length - 1}
                                      onClick={() => moveAnswer(label, "down")}
                                    >
                                      <ArrowDownIcon />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                              {form.multipleChoiceContentType === "text" ? (
                                <Input
                                  aria-invalid={invalid}
                                  placeholder="Escribe la respuesta."
                                  value={optionBlock.content}
                                  onChange={(event) =>
                                    updateOptionBlocks(label, optionBlock.id, (current) => ({
                                      ...current,
                                      content: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <div className="flex flex-col gap-4">
                                  {!optionBlock.image && (
                                    <Input
                                      accept="image/*"
                                      type="file"
                                      onChange={(event) => {
                                        void updateOptionBlockImage(
                                          label,
                                          optionBlock.id,
                                          event.target.files,
                                        );
                                        event.target.value = "";
                                      }}
                                    />
                                  )}
                                  {optionBlock.image && (
                                    <div className="flex flex-col gap-4">
                                      <div className="flex justify-center">
                                        <img
                                          alt={optionBlock.image.name}
                                          className="block h-auto max-h-72 max-w-full rounded-lg"
                                          src={optionBlock.image.url}
                                        />
                                      </div>
                                      <div className="flex justify-start">
                                        <label>
                                          <input
                                            accept="image/*"
                                            className="sr-only"
                                            type="file"
                                            onChange={(event) => {
                                              void updateOptionBlockImage(
                                                label,
                                                optionBlock.id,
                                                event.target.files,
                                              );
                                              event.target.value = "";
                                            }}
                                          />
                                          <Button type="button" variant="outline" asChild>
                                            <span>Reemplazar imagen</span>
                                          </Button>
                                        </label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
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
              </FieldSet>
            )}

            {form.answerType === "short_text" && (
              <Field data-invalid={!form.shortAnswer.trim() && errors.length > 0}>
                <FieldLabel htmlFor="short-answer">
                  Respuesta corta esperada
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="short-answer"
                    aria-invalid={!form.shortAnswer.trim() && errors.length > 0}
                    placeholder="Ej. 42"
                    value={form.shortAnswer}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        shortAnswer: event.target.value,
                      }))
                    }
                  />
                  <FieldDescription>
                    El probador validará este texto ignorando mayúsculas y espacios
                    al inicio y al final.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}

            {form.answerType === "range" && (
              <FieldSet>
                <FieldLegend variant="label">Rangos válidos</FieldLegend>
                <FieldDescription>
                  Define uno o varios intervalos aceptados para la respuesta.
                </FieldDescription>
                <div className="flex flex-col gap-4">
                  {form.rangeAnswers.map((rangeAnswer, index) => (
                    <Card key={rangeAnswer.id} className="rounded-xl border bg-card shadow-sm">
                      <CardHeader className="border-b">
                        <div className="flex items-center gap-3">
                          <BetweenHorizonalStartIcon className="text-muted-foreground" />
                          <div>
                            <CardTitle className="text-base">
                              Rango {index + 1}
                            </CardTitle>
                            <CardDescription>
                              El participante será correcto si su valor cae dentro de este rango.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4 pt-6">
                        <Field>
                          <FieldLabel htmlFor={`range-label-${rangeAnswer.id}`}>
                            Etiqueta
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              id={`range-label-${rangeAnswer.id}`}
                              placeholder="Ej. Entre 10 y 20"
                              value={rangeAnswer.label}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  rangeAnswers: current.rangeAnswers.map((item) =>
                                    item.id === rangeAnswer.id
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </FieldContent>
                        </Field>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor={`range-min-${rangeAnswer.id}`}>
                              Mínimo
                            </FieldLabel>
                            <FieldContent>
                              <Input
                                id={`range-min-${rangeAnswer.id}`}
                                type="number"
                                value={String(rangeAnswer.min)}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    rangeAnswers: current.rangeAnswers.map((item) =>
                                      item.id === rangeAnswer.id
                                        ? {
                                            ...item,
                                            min: Number(event.target.value || 0),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </FieldContent>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`range-max-${rangeAnswer.id}`}>
                              Máximo
                            </FieldLabel>
                            <FieldContent>
                              <Input
                                id={`range-max-${rangeAnswer.id}`}
                                type="number"
                                value={String(rangeAnswer.max)}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    rangeAnswers: current.rangeAnswers.map((item) =>
                                      item.id === rangeAnswer.id
                                        ? {
                                            ...item,
                                            max: Number(event.target.value || 0),
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </FieldContent>
                          </Field>
                        </div>
                        {form.rangeAnswers.length > 1 && (
                          <Button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                rangeAnswers: current.rangeAnswers.filter(
                                  (item) => item.id !== rangeAnswer.id,
                                ),
                              }))
                            }
                          >
                            Eliminar rango
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        rangeAnswers: [
                          ...current.rangeAnswers,
                          {
                            id: crypto.randomUUID(),
                            label: "Nuevo rango",
                            min: 0,
                            max: 0,
                          },
                        ],
                      }))
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    Agregar rango
                  </Button>
                </div>
              </FieldSet>
            )}

            {form.answerType === "drag_drop" && (
              <FieldSet>
                <FieldLegend variant="label">Escenario interactivo</FieldLegend>
                <FieldDescription>
                  Define la imagen de fondo, los objetos y la posición correcta de cada uno.
                </FieldDescription>
                <DragDropEditor
                  backgroundUrl={form.dragDropBackground?.url ?? null}
                  items={form.dragDropItems}
                  onUploadBackground={(files) => {
                    void updateDragDropBackground(files);
                  }}
                  onReplaceItemImage={(itemId, files) => {
                    void updateDragDropItemImage(itemId, files);
                  }}
                  onAddItem={() =>
                    setForm((current) => ({
                      ...current,
                      dragDropItems: [
                        ...current.dragDropItems,
                        {
                          id: crypto.randomUUID(),
                          label: `Objeto ${current.dragDropItems.length + 1}`,
                          image: null,
                          targetX: 50,
                          targetY: 50,
                          tolerance: 10,
                        },
                      ],
                    }))
                  }
                  onRemoveItem={(itemId) =>
                    setForm((current) => ({
                      ...current,
                      dragDropItems:
                        current.dragDropItems.length > 1
                          ? current.dragDropItems.filter((item) => item.id !== itemId)
                          : current.dragDropItems,
                    }))
                  }
                  onUpdateItem={updateDragDropItem}
                />
              </FieldSet>
            )}

            {errors.length > 0 && (
              <FieldError errors={errors.map((message) => ({ message }))} />
            )}
          </FieldGroup>
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
        <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImagePlusIcon />
            Las tareas se guardan con sus imágenes.
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

export const categories = [
  "Algoritmos y programación",
  "Estructuras de datos y representaciones",
  "Procesos computacionales y hardware",
  "Comunicación y redes",
  "Interacción, sistemas y sociedad",
] as const;

export const ageRanges = [
  "6–8",
  "8–10",
  "10–12",
  "12–14",
  "14–16",
  "16–19",
] as const;

export const optionLabels = ["A", "B", "C", "D", "E", "F"] as const;
export const answerTypes = [
  "multiple_choice",
  "short_text",
  "range",
] as const;
export const multipleChoiceOrderModes = ["fixed", "random"] as const;

export type ContentBlockType = "text" | "image" | "challenge";

export type ContentImage = {
  id: string;
  name: string;
  url: string;
};

export type ContentBlock = {
  id: string;
  type: ContentBlockType;
  content: string;
  image: ContentImage | null;
  widthPercent: number;
};

export type DifficultyKey = (typeof ageRanges)[number];
export type OptionKey = (typeof optionLabels)[number];
export type CategoryValue = (typeof categories)[number] | "";
export type CategoryItem = Exclude<CategoryValue, "">;
export type AnswerType = (typeof answerTypes)[number];
export type MultipleChoiceOrderMode = (typeof multipleChoiceOrderModes)[number];

export type StoredTaskAnswer = {
  id: OptionKey;
  blocks: ContentBlock[];
};

export type StoredTaskRangeAnswer = {
  id: string;
  label: string;
  min: number;
  max: number;
};

export type StoredTask = {
  id: string;
  title: string;
  categories: CategoryItem[];
  difficulties: Record<DifficultyKey, string>;
  bodyBlocks: ContentBlock[];
  challengeBlocks: ContentBlock[];
  answerType: AnswerType;
  multipleChoiceOrderMode: MultipleChoiceOrderMode;
  answers: StoredTaskAnswer[];
  correctAnswerId: OptionKey;
  shortAnswer: string;
  rangeAnswers: StoredTaskRangeAnswer[];
  explanation: string;
  status: "Borrador";
  updatedAt: string;
};

export function createContentBlock(
  type: ContentBlockType = "text",
): ContentBlock {
  return {
    id: crypto.randomUUID(),
    type,
    content: "",
    image: null,
    widthPercent: 100,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se pudo leer la imagen."));
    };

    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export async function createContentImages(files: FileList | null) {
  if (!files) {
    return [];
  }

  const imageFiles = Array.from(files).filter((file) =>
    file.type.startsWith("image/"),
  );

  return Promise.all(
    imageFiles.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: await readFileAsDataUrl(file),
    })),
  );
}

export function getNonEmptyBlocks(blocks: ContentBlock[]) {
  return blocks.filter((block) => {
    if (block.type === "image") {
      return block.image !== null;
    }

    return block.content.trim().length > 0;
  });
}

export function getQuestionSummary(blocks: ContentBlock[]) {
  const challengeBlock = blocks.find(
    (block) => block.type === "challenge" && block.content.trim().length > 0,
  );

  if (challengeBlock) {
    return challengeBlock.content.trim();
  }

  const firstTextBlock = blocks.find((block) => block.content.trim().length > 0);
  return firstTextBlock?.content.trim() ?? "Sin pregunta definida";
}

export function getBlocksSummary(blocks: ContentBlock[]) {
  const parts = blocks.flatMap((block) => {
    if (block.type === "image") {
      return block.image ? [`imagen:${block.image.name}`] : [];
    }

    const content = block.content.trim().toLowerCase();
    return content ? [content] : [];
  });

  return parts.join(" | ");
}

export function buildAgeSummary(difficulties: Record<DifficultyKey, string>) {
  const activeRanges = ageRanges.filter((range) => difficulties[range]);
  return activeRanges.length > 0 ? activeRanges.join(", ") : "Sin rango asignado";
}

export function normalizeCategories(value: unknown): CategoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is CategoryItem =>
    typeof item === "string" &&
    (categories as readonly string[]).includes(item),
  );
}

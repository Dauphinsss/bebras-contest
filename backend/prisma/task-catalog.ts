import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "../src/generated/prisma/client";
import { validateCatalog } from "./catalog-migration";
import { seedDragDropConfig } from "./seed-drag-drop";

type CatalogTask = {
  id: string;
  title: string;
  country?: string | null;
  year?: number | null;
  sourceTaskCode?: string | null;
  categories?: string[];
  category?: string[];
  difficulties?: Record<string, string>;
  bodyBlocks?: unknown[];
  challengeBlocks?: unknown[];
  answerType?: string;
  answerConfig?: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
  multipleChoiceOrderMode?: string;
  answers?: unknown[];
  correctAnswerId?: string;
  shortAnswer?: string;
  dragDropBackground?: unknown;
  dragDropItems?: unknown;
  dragDropTargets?: unknown[];
  dragDropSolutions?: unknown[];
  explanationBlocks?: unknown[];
  isPractice?: boolean;
};

export type CatalogTaskData = Prisma.TaskDraftCreateManyInput & { id: string };

export const CATALOG_PATH = path.resolve(__dirname, "seed/bebras-tasks.json");

export function catalogTaskData(task: CatalogTask): CatalogTaskData {
  return {
    id: task.id,
    title: task.title,
    country: task.country ?? null,
    year: task.year ?? null,
    sourceTaskCode: task.sourceTaskCode ?? null,
    category: JSON.stringify(
      task.categories ?? task.category ?? ["Algoritmos y programación"],
    ),
    difficulties: JSON.stringify(task.difficulties ?? {}),
    bodyBlocks: JSON.stringify(task.bodyBlocks ?? []),
    challengeBlocks: JSON.stringify(task.challengeBlocks ?? []),
    answerType: task.answerType ?? "multiple_choice",
    answerConfig: JSON.stringify(task.answerConfig ?? {}),
    answerKey: JSON.stringify(task.answerKey ?? {}),
    multipleChoiceOrderMode: task.multipleChoiceOrderMode ?? "fixed",
    answers: JSON.stringify(task.answers ?? []),
    correctAnswerId: task.correctAnswerId ?? "",
    shortAnswer: task.shortAnswer ?? "",
    dragDropBackground: JSON.stringify(task.dragDropBackground ?? null),
    dragDropItems: JSON.stringify(seedDragDropConfig(task)),
    explanationBlocks: JSON.stringify(task.explanationBlocks ?? []),
    isPractice: task.isPractice ?? true,
  };
}

export function loadCatalogTaskData(catalogPath = CATALOG_PATH) {
  const catalog: unknown = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  validateCatalog(catalog);
  return (catalog as CatalogTask[]).map(catalogTaskData);
}

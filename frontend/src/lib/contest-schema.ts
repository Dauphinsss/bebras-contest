import { buildAgeSummary, type CategoryItem, type DifficultyKey } from "@/lib/task-schema";

/**
 * Categorías oficiales de Bebras Bolivia. Fuente única de verdad: el CMS
 * (bebras-bolivia/cms/content/current/data/categories.json). Aquí se replican
 * para el MVP; a futuro se leerán del Content Store.
 */
export const CONTEST_CATEGORIES = [
  { name: "Guacamayo", age: "5-8 años" },
  { name: "Capibara", age: "8-10 años" },
  { name: "Titi", age: "10-12 años" },
  { name: "Jucumari", age: "12-14 años" },
  { name: "Yaguareté", age: "14-18 años" },
] as const;

/** Estado derivado de la competencia (no es un campo editable). */
export type ContestState = "borrador" | "programada" | "abierta" | "cerrada";

export type ContestTaskSummary = {
  id: string;
  title: string;
  categories: CategoryItem[];
  difficulties: Record<DifficultyKey, string>;
  status: string;
};

export type StoredContestTask = {
  id: string;
  position: number;
  taskId: string;
  minScore: number;
  noAnswerScore: number;
  maxScore: number;
  task: ContestTaskSummary;
};

export type ContestTaskConfigInput = {
  taskId: string;
  minScore: number;
  noAnswerScore: number;
  maxScore: number;
};

export type QuestionDisplayMode = "one_by_one" | "all";

export type StoredContest = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  questionDisplayMode: QuestionDisplayMode;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  publishedAt: string | null;
  state: ContestState;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  tasks: StoredContestTask[];
};

export type ContestDraftInput = {
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  questionDisplayMode: QuestionDisplayMode;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  tasks: ContestTaskConfigInput[];
};

export const CONTEST_STATE_LABELS: Record<ContestState, string> = {
  borrador: "Borrador",
  programada: "Programada",
  abierta: "Abierta",
  cerrada: "Cerrada",
};

export function formatContestWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return `${start.toLocaleString("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  })} - ${end.toLocaleString("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

export function formatContestTaskSummary(task: ContestTaskSummary) {
  return `${buildAgeSummary(task.difficulties)} · ${task.categories.join(", ") || "Sin categoría"}`;
}

export function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

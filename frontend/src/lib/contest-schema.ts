import {
  buildAgeSummary,
  type CategoryItem,
  type DifficultyKey,
} from "@/lib/task-schema";

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
  { name: "Yaguareté", age: "14-16 años" },
  { name: "Kuntur", age: "17-18 años" },
] as const;

export const SCHOOL_GRADES = [
  { value: "P1", label: "1.º de primaria", category: "Guacamayo" },
  { value: "P2", label: "2.º de primaria", category: "Guacamayo" },
  { value: "P3", label: "3.º de primaria", category: "Capibara" },
  { value: "P4", label: "4.º de primaria", category: "Capibara" },
  { value: "P5", label: "5.º de primaria", category: "Titi" },
  { value: "P6", label: "6.º de primaria", category: "Titi" },
  { value: "S1", label: "1.º de secundaria", category: "Jucumari" },
  { value: "S2", label: "2.º de secundaria", category: "Jucumari" },
  { value: "S3", label: "3.º de secundaria", category: "Yaguareté" },
  { value: "S4", label: "4.º de secundaria", category: "Yaguareté" },
  { value: "S5", label: "5.º de secundaria", category: "Kuntur" },
  { value: "S6", label: "6.º de secundaria", category: "Kuntur" },
] as const;

export type SchoolGrade = (typeof SCHOOL_GRADES)[number];

export function gradesForCategory(category: string) {
  if (!category) {
    return [...SCHOOL_GRADES];
  }

  return SCHOOL_GRADES.filter((grade) => grade.category === category);
}

export function gradeLabel(value: string | null) {
  return SCHOOL_GRADES.find((grade) => grade.value === value)?.label ?? "—";
}

/** Estado derivado de la competencia (no es un campo editable). */
export type ContestState =
  | "borrador"
  | "programada"
  | "abierta"
  | "cerrada"
  | "consolidada"
  | "publicada";

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
  difficulty: TaskDifficulty;
  minScore: number;
  noAnswerScore: number;
  maxScore: number;
  task: ContestTaskSummary;
};

export type ContestTaskConfigInput = {
  taskId: string;
};

export const BEBRAS_SCORING = {
  easy: { letter: "A", label: "Fácil", correct: 6, wrong: -2 },
  medium: { letter: "B", label: "Medio", correct: 9, wrong: -3 },
  hard: { letter: "C", label: "Difícil", correct: 12, wrong: -4 },
} as const;

export type TaskDifficulty = keyof typeof BEBRAS_SCORING;

export const CATEGORY_AGE_RANGE: Record<string, DifficultyKey> = {
  Guacamayo: "5–8",
  Capibara: "8–10",
  Titi: "10–12",
  Jucumari: "12–14",
  "Yaguareté": "14–16",
  Kuntur: "17–18",
};

export function isTaskDifficulty(value: unknown): value is TaskDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

export function taskDifficultyForCategory(
  difficulties: Record<string, string>,
  category: string,
) {
  const range = CATEGORY_AGE_RANGE[category];

  if (!range) {
    return null;
  }

  const value = difficulties[range];
  return isTaskDifficulty(value) ? value : null;
}

export type QuestionDisplayMode = "one_by_one" | "all";

export type StoredContest = {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  initialScore: number;
  questionDisplayMode: QuestionDisplayMode;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  publishedAt: string | null;
  consolidatedAt: string | null;
  resultsPublishedAt: string | null;
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
  consolidada: "Consolidada",
  publicada: "Resultados publicados",
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

export function fromDatetimeLocalValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

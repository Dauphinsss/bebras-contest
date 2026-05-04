import { buildAgeSummary, type CategoryItem, type DifficultyKey } from "@/lib/task-schema";

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
  task: ContestTaskSummary;
};

export type StoredContest = {
  id: string;
  title: string;
  level: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  allowPairs: boolean;
  showFeedback: boolean;
  isVisible: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  tasks: StoredContestTask[];
};

export type ContestDraftInput = {
  title: string;
  level: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  allowPairs: boolean;
  showFeedback: boolean;
  isVisible: boolean;
  status: string;
  taskIds: string[];
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

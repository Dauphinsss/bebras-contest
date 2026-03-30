import {
  buildAgeSummary,
  getQuestionSummary,
  type StoredTask,
} from "@/lib/task-schema";
import { seedTasks } from "@/lib/mock-tasks";

const TASKS_STORAGE_KEY = "bebras-bolivia.tasks";
const DELETED_SEED_TASKS_STORAGE_KEY = "bebras-bolivia.deleted-seed-tasks";

export type HomeTaskItem = {
  id: string;
  title: string;
  categories: string[];
  ageSummary: string;
  question: string;
  status: "Borrador";
};

export function getStoredTasks() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as StoredTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredTasks(tasks: StoredTask[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

function getDeletedSeedTaskIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(DELETED_SEED_TASKS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDeletedSeedTaskIds(taskIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DELETED_SEED_TASKS_STORAGE_KEY,
    JSON.stringify(taskIds),
  );
}

export function saveTask(task: StoredTask) {
  const currentTasks = getStoredTasks();
  const deletedSeedTaskIds = getDeletedSeedTaskIds().filter((id) => id !== task.id);
  writeStoredTasks([task, ...currentTasks]);
  writeDeletedSeedTaskIds(deletedSeedTaskIds);
}

export function upsertTask(task: StoredTask) {
  const currentTasks = getStoredTasks();
  const nextTasks = currentTasks.filter((currentTask) => currentTask.id !== task.id);
  const deletedSeedTaskIds = getDeletedSeedTaskIds().filter((id) => id !== task.id);
  writeStoredTasks([task, ...nextTasks]);
  writeDeletedSeedTaskIds(deletedSeedTaskIds);
}

export function deleteTask(taskId: string) {
  const currentTasks = getStoredTasks();
  const nextTasks = currentTasks.filter((task) => task.id !== taskId);
  writeStoredTasks(nextTasks);

  if (seedTasks.some((task) => task.id === taskId)) {
    const deletedSeedTaskIds = new Set(getDeletedSeedTaskIds());
    deletedSeedTaskIds.add(taskId);
    writeDeletedSeedTaskIds([...deletedSeedTaskIds]);
  }
}

export function getAllTasks() {
  const storedTasks = getStoredTasks();
  const storedIds = new Set(storedTasks.map((task) => task.id));
  const deletedSeedTaskIds = new Set(getDeletedSeedTaskIds());
  const fallbackSeedTasks = seedTasks.filter(
    (task) => !storedIds.has(task.id) && !deletedSeedTaskIds.has(task.id),
  );
  return [...storedTasks, ...fallbackSeedTasks];
}

export function getTaskById(taskId: string) {
  return getAllTasks().find((task) => task.id === taskId) ?? null;
}

export function mapTaskToHomeItem(task: StoredTask): HomeTaskItem {
  return {
    id: task.id,
    title: task.title,
    categories: [task.category],
    ageSummary: buildAgeSummary(task.difficulties),
    question: getQuestionSummary(task.challengeBlocks),
    status: task.status,
  };
}

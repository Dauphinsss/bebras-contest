import { normalizeCategories, type StoredTask } from "@/lib/task-schema";
import { BEBRAS_CATEGORIES } from "@/lib/contest-schema";
import { apiRequest as request } from "@/lib/api-client";

export type HomeTaskItem = {
  id: string;
  title: string;
  categories: string[];
  /** Categorías de Bebras que cubre, según los rangos de edad con dificultad. */
  levels: string[];
  status: "Borrador";
  isPractice: boolean;
};

export function listTasks() {
  return request<StoredTask[]>("/api/tasks");
}

export function getTask(taskId: string) {
  return request<StoredTask>(`/api/tasks/${taskId}`);
}

export function createTask(task: Omit<StoredTask, "id"> & { id?: string }) {
  return request<StoredTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export function updateTask(task: StoredTask) {
  return request<StoredTask>(`/api/tasks/${task.id}`, {
    method: "PUT",
    body: JSON.stringify(task),
  });
}

export function removeTask(taskId: string) {
  return request<null>(`/api/tasks/${taskId}`, {
    method: "DELETE",
  });
}

export function setTaskPractice(taskId: string, isPractice: boolean) {
  return request<{ id: string; isPractice: boolean }>(
    `/api/tasks/${taskId}/practice`,
    {
      method: "PATCH",
      body: JSON.stringify({ isPractice }),
    },
  );
}

export function mapTaskToHomeItem(task: StoredTask): HomeTaskItem {
  return {
    id: task.id,
    title: task.title,
    categories: normalizeCategories(task.categories),
    levels: BEBRAS_CATEGORIES.filter(
      (category) => (task.difficulties[category.ageRange] ?? "").trim() !== "",
    ).map((category) => category.name),
    status: task.status,
    isPractice: Boolean((task as { isPractice?: boolean }).isPractice),
  };
}

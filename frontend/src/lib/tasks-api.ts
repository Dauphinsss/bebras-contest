import {
  buildAgeSummary,
  getQuestionSummary,
  normalizeCategories,
  type StoredTask,
} from "@/lib/task-schema";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type HomeTaskItem = {
  id: string;
  title: string;
  categories: string[];
  ageSummary: string;
  question: string;
  status: "Borrador";
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

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

export function mapTaskToHomeItem(task: StoredTask): HomeTaskItem {
  return {
    id: task.id,
    title: task.title,
    categories: normalizeCategories(task.categories),
    ageSummary: buildAgeSummary(task.difficulties),
    question: getQuestionSummary(task.challengeBlocks),
    status: task.status,
  };
}

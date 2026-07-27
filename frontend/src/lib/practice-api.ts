import type { PlayTask } from "@/lib/play-api";
import { publicRequest } from "@/lib/api-client";

export type PracticeCategory = {
  name: string;
  age: string;
  count: number;
};

export type PracticeTaskItem = {
  id: string;
  title: string;
  answerType: string;
};

export type PracticeTaskList = {
  category: string;
  age: string;
  tasks: PracticeTaskItem[];
};

export type PracticeCheck = {
  correct: boolean;
  explanation: string;
};

function get<T>(path: string) {
  return publicRequest<T>(path);
}

export function listPracticeCategories() {
  return get<PracticeCategory[]>("/api/practice/categories");
}

export function listPracticeTasks(category: string) {
  return get<PracticeTaskList>(
    `/api/practice/tasks?category=${encodeURIComponent(category)}`,
  );
}

export function getPracticeTask(id: string) {
  return get<PlayTask>(`/api/practice/tasks/${id}`);
}

export function checkPracticeAnswer(id: string, payload: unknown) {
  return publicRequest<PracticeCheck>(`/api/practice/tasks/${id}/check`, {
    method: "POST",
    body: JSON.stringify({ payload }),
  });
}

import { apiRequest as request } from "@/lib/api-client";
import type { ContestState } from "@/lib/contest-schema";

export type PracticeTask = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
};

export type StoredPractice = {
  id: string;
  /** El del grupo que nace con la práctica: es el que se reparte. */
  accessCode: string | null;
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  taskCount: number;
  groupCount: number;
  studentCount: number;
  state: ContestState;
};

export type PracticeDraftInput = {
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  tasks: string[];
};

export function listPractices() {
  return request<StoredPractice[]>("/api/practices");
}

/** Solo las preguntas que el administrador liberó para práctica. */
export function listPracticeTasks(category: string) {
  return request<{ category: string; ageRange: string; tasks: PracticeTask[] }>(
    `/api/practices/tasks?category=${encodeURIComponent(category)}`,
  );
}

export function createPractice(practice: PracticeDraftInput) {
  return request<StoredPractice>("/api/practices", {
    method: "POST",
    body: JSON.stringify(practice),
  });
}

export function removePractice(practiceId: string) {
  return request<null>(`/api/practices/${practiceId}`, { method: "DELETE" });
}

import type {
  ContentBlock,
  ContentImage,
  StoredTaskDragDropItem,
} from "@/lib/task-schema";

import { publicRequest as request } from "@/lib/api-client";

export type PlayAnswerOption = {
  id: string;
  blocks: ContentBlock[];
};

export type PlayTask = {
  taskId: string;
  position: number;
  title: string;
  bodyBlocks: ContentBlock[];
  challengeBlocks: ContentBlock[];
  answerType: string;
  multipleChoiceOrderMode: string;
  multipleChoiceMode: "single" | "any" | "all";
  answers: PlayAnswerOption[];
  dragDropBackground: ContentImage | null;
  dragDropItems: Pick<StoredTaskDragDropItem, "id" | "label" | "image">[];
  explanation?: string;
  correct?: boolean;
};

export type AttemptResult = {
  totalScore: number;
  correctCount: number;
  answeredCount: number;
  rankPosition: number | null;
};

export type AttemptState = {
  contestTitle: string;
  durationMinutes: number;
  questionDisplayMode: "one_by_one" | "all";
  state: string;
  status: "pending" | "in_progress" | "finished";
  startedAt: string | null;
  endsAt: string | null;
  resultsPublished: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  tasks: PlayTask[];
  answers: Record<string, unknown>;
  result: AttemptResult | null;
};

export function answerHasResponse(answerType: string, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const value = payload as Record<string, unknown>;

  if (answerType === "multiple_choice") {
    return Array.isArray(value.selected) && value.selected.length > 0;
  }

  if (answerType === "short_text") {
    return typeof value.text === "string" && value.text.trim().length > 0;
  }

  if (answerType === "range") {
    const raw = String(value.value ?? "").trim();
    return raw !== "" && !Number.isNaN(Number(raw));
  }

  if (answerType === "drag_drop") {
    return (
      Boolean(value.placements) &&
      typeof value.placements === "object" &&
      Object.keys(value.placements as object).length > 0
    );
  }

  return false;
}

export function getAttempt(personalCode: string) {
  return request<AttemptState>(`/api/play/attempt/${personalCode}`);
}

export function startAttempt(personalCode: string) {
  return request<{ ok: boolean }>("/api/play/start", {
    method: "POST",
    body: JSON.stringify({ personalCode }),
  });
}

export function saveAnswer(
  personalCode: string,
  taskId: string,
  payload: unknown,
) {
  return request<null>("/api/play/answer", {
    method: "POST",
    body: JSON.stringify({ personalCode, taskId, payload }),
  });
}

export function submitAttempt(personalCode: string) {
  return request<{ ok: boolean }>("/api/play/submit", {
    method: "POST",
    body: JSON.stringify({ personalCode }),
  });
}

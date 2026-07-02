import type {
  ContentBlock,
  ContentImage,
  StoredTaskDragDropItem,
} from "@/lib/task-schema";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

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
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  tasks: PlayTask[];
  answers: Record<string, unknown>;
  result: AttemptResult | null;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // keep generic
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
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

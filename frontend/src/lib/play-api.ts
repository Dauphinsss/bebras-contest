import type {
  ContentBlock,
  ContentImage,
  StoredTaskDragDropItem,
  StoredTaskDragDropTarget,
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
  dragDropItems: Pick<
    StoredTaskDragDropItem,
    "id" | "label" | "image" | "widthPercent"
  >[];
  dragDropTargets: StoredTaskDragDropTarget[];
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
  suspendedAt: string | null;
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

const PLAY_SESSION_KEY = "bebras_play_session";

export function readPlaySession() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(PLAY_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storePlaySession(sessionToken: string) {
  try {
    window.localStorage.setItem(PLAY_SESSION_KEY, sessionToken);
  } catch {
    return;
  }
}

export function forgetPlaySession() {
  try {
    window.localStorage.removeItem(PLAY_SESSION_KEY);
  } catch {
    return;
  }
}

function playRequest<T>(path: string, options: RequestInit = {}) {
  const sessionToken = readPlaySession();

  return request<T>(path, {
    ...options,
    headers: sessionToken ? { "x-play-session": sessionToken } : undefined,
  });
}

export type PlaySession = {
  sessionToken: string;
  groupName: string;
  contestTitle: string;
  participationMode: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
};

export function openPlaySession(
  accessCode: string,
  firstName: string,
  lastName: string,
) {
  return request<PlaySession>("/api/play/session", {
    method: "POST",
    body: JSON.stringify({ accessCode, firstName, lastName }),
  });
}

export function closePlaySession() {
  return playRequest<null>("/api/play/session/close", { method: "POST" });
}

export function sendPlayHeartbeat() {
  return playRequest<{ ok: boolean }>("/api/play/heartbeat", {
    method: "POST",
  });
}

export function getAttempt() {
  return playRequest<AttemptState>("/api/play/attempt");
}

export function startAttempt() {
  return playRequest<{ ok: boolean }>("/api/play/start", { method: "POST" });
}

export function saveAnswer(taskId: string, payload: unknown) {
  return playRequest<null>("/api/play/answer", {
    method: "POST",
    body: JSON.stringify({ taskId, payload }),
  });
}

export function submitAttempt() {
  return playRequest<{ ok: boolean }>("/api/play/submit", { method: "POST" });
}

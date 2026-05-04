import {
  type ContestDraftInput,
  type StoredContest,
} from "@/lib/contest-schema";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // Keep the generic message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function listContests() {
  return request<StoredContest[]>("/api/contests");
}

export function getContest(contestId: string) {
  return request<StoredContest>(`/api/contests/${contestId}`);
}

export function createContest(contest: ContestDraftInput) {
  return request<StoredContest>("/api/contests", {
    method: "POST",
    body: JSON.stringify(contest),
  });
}

export function updateContest(contestId: string, contest: ContestDraftInput) {
  return request<StoredContest>(`/api/contests/${contestId}`, {
    method: "PUT",
    body: JSON.stringify(contest),
  });
}

export function publishContest(contestId: string) {
  return request<StoredContest>(`/api/contests/${contestId}/publish`, {
    method: "POST",
  });
}

export function removeContest(contestId: string) {
  return request<null>(`/api/contests/${contestId}`, {
    method: "DELETE",
  });
}

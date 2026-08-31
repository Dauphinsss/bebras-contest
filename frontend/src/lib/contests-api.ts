import {
  type ContestState,
  type ContestDraftInput,
  type StoredContest,
} from "@/lib/contest-schema";
import { apiRequest as request } from "@/lib/api-client";

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

export function consolidateContest(contestId: string) {
  return request<StoredContest & { closedAttempts: number }>(
    `/api/contests/${contestId}/consolidate`,
    { method: "POST" },
  );
}

export function publishContestResults(contestId: string) {
  return request<StoredContest>(`/api/contests/${contestId}/results/publish`, {
    method: "POST",
  });
}

export function unpublishContestResults(contestId: string) {
  return request<StoredContest>(
    `/api/contests/${contestId}/results/unpublish`,
    {
      method: "POST",
    },
  );
}

export function removeContest(contestId: string) {
  return request<null>(`/api/contests/${contestId}`, {
    method: "DELETE",
  });
}

export type ContestResultRow = {
  teamId: string;
  groupName: string;
  participationMode: string;
  grade: string | null;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  status: string;
  elapsedSeconds: number | null;
  totalScore: number | null;
  correctCount: number | null;
  answeredCount: number | null;
  rankPosition: number | null;
};

export type ContestResults = {
  contestTitle: string;
  taskCount: number;
  state: ContestState;
  rows: ContestResultRow[];
};

export function getContestResults(contestId: string) {
  return request<ContestResults>(`/api/contests/${contestId}/results`);
}

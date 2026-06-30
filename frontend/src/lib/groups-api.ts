import { authHeaders, handleUnauthorized } from "@/lib/auth";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type GroupTeam = {
  id: string;
  participationMode: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  status: string;
  createdAt: string;
};

export type StoredGroup = {
  id: string;
  name: string;
  accessCode: string;
  contestId: string;
  contestTitle: string;
  contestCategory: string;
  expiresAt: string | null;
  createdAt: string;
  teamCount: number;
  teams: GroupTeam[];
};

export type GroupDraftInput = {
  contestId: string;
  name: string;
};

export type PublishedContest = {
  id: string;
  title: string;
  category: string;
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401 || response.status === 403) {
    handleUnauthorized();
    throw new Error("Sesión expirada. Inicia sesión de nuevo.");
  }

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

export function listPublishedContests() {
  return request<PublishedContest[]>("/api/published-contests");
}

export function listGroups() {
  return request<StoredGroup[]>("/api/groups");
}

export function getGroup(groupId: string) {
  return request<StoredGroup>(`/api/groups/${groupId}`);
}

export function createGroup(group: GroupDraftInput) {
  return request<StoredGroup>("/api/groups", {
    method: "POST",
    body: JSON.stringify(group),
  });
}

export function removeGroup(groupId: string) {
  return request<null>(`/api/groups/${groupId}`, {
    method: "DELETE",
  });
}

export type TeamUpdateInput = {
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string;
  memberTwoLastName: string;
};

export function updateTeam(teamId: string, data: TeamUpdateInput) {
  return request<GroupTeam>(`/api/teams/${teamId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function removeTeam(teamId: string) {
  return request<null>(`/api/teams/${teamId}`, {
    method: "DELETE",
  });
}

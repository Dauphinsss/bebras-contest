import { apiRequest as request } from "@/lib/api-client";

export type GroupTeam = {
  id: string;
  participationMode: string;
  grade: string | null;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  personalCode: string;
  status: string;
  createdAt: string;
};

export type EnrollTeamInput = {
  participationMode: "individual" | "pareja";
  grade: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName?: string;
  memberTwoLastName?: string;
};

export type StoredGroup = {
  id: string;
  name: string;
  accessCode: string;
  contestId: string;
  contestTitle: string;
  contestCategory: string;
  contestAllowPairs: boolean;
  scheduledAt: string | null;
  firstUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  teamCount: number;
  teams: GroupTeam[];
};

export type GroupDraftInput = {
  contestId: string;
  name: string;
  scheduledAt?: string | null;
};

export type PublishedContest = {
  id: string;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string;
};

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

export function enrollTeam(groupId: string, data: EnrollTeamInput) {
  return request<GroupTeam>(`/api/groups/${groupId}/teams`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type TeamUpdateInput = {
  grade: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName?: string;
  memberTwoLastName?: string;
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

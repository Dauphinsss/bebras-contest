import { API_BASE_URL, apiRequest as request } from "@/lib/api-client";
import { authHeaders } from "@/lib/auth";

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
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
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

export type RosterImportResult = {
  created: Array<{ row: number; name: string; personalCode: string }>;
  skipped: Array<{ row: number; name: string; reason: string }>;
};

export async function downloadRosterTemplate(groupId: string, name: string) {
  const response = await fetch(
    `${API_BASE_URL}/api/groups/${groupId}/roster-template`,
    { headers: authHeaders() },
  );

  if (!response.ok) {
    throw new Error("No se pudo descargar la plantilla.");
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `participantes-${name}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function importRoster(groupId: string, file: File) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/roster`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  const data = (await response.json().catch(() => ({}))) as
    | RosterImportResult
    | { message?: string };

  if (!response.ok) {
    throw new Error(
      ("message" in data && data.message) || "No se pudo importar la planilla.",
    );
  }

  return data as RosterImportResult;
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

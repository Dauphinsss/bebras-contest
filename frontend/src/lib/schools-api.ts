const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type SchoolResult = {
  codUe: string;
  name: string;
  dep: string;
  sec: string;
  dis: string;
};

export async function searchSchools(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const response = await fetch(
    `${API_BASE_URL}/api/schools?q=${encodeURIComponent(trimmed)}`,
  );

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as SchoolResult[];
}

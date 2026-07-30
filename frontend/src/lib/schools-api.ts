import { publicRequest } from "@/lib/api-client";

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

  return publicRequest<SchoolResult[]>(
    `/api/schools?q=${encodeURIComponent(trimmed)}`,
  );
}

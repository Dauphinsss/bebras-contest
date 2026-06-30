import { authHeaders, handleUnauthorized } from "@/lib/auth";

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type Maestro = {
  id: number;
  name: string | null;
  email: string;
  status: string;
  createdAt: string;
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

export function listMaestros() {
  return request<Maestro[]>("/api/users/maestros");
}

export function approveMaestro(id: number) {
  return request<{ id: number; status: string }>(`/api/users/${id}/approve`, {
    method: "POST",
  });
}

export function rejectMaestro(id: number) {
  return request<{ id: number; status: string }>(`/api/users/${id}/reject`, {
    method: "POST",
  });
}

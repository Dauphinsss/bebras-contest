import { authHeaders, handleUnauthorized } from "@/lib/auth";

export const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type ApiRequestOptions = RequestInit & {
  auth?: boolean;
};

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { auth = true, headers, ...init } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(auth ? authHeaders() : {}),
      ...(headers ?? {}),
    },
    ...init,
  });

  if (auth && (response.status === 401 || response.status === 403)) {
    handleUnauthorized();
    throw new Error("Sesión expirada. Inicia sesión de nuevo.");
  }

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Request failed with status ${response.status}`,
      ),
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function publicRequest<T>(path: string, options: ApiRequestOptions = {}) {
  return apiRequest<T>(path, { ...options, auth: false });
}

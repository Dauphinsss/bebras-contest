import { authHeaders, handleUnauthorized } from "@/lib/auth";

export const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

export type ApiRequestOptions = RequestInit & {
  auth?: boolean;
};

type ApiErrorBody = {
  message?: string;
  code?: string;
  field?: string;
  fields?: string[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly field?: string,
    readonly fields?: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return {
      message: body.message || fallback,
      code: body.code,
      field: body.field,
      fields: body.fields,
    };
  } catch {
    return { message: fallback };
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { auth = true, headers, ...init } = options;
  const requestHeaders = new Headers(auth ? authHeaders() : undefined);

  new Headers(headers).forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  if (typeof init.body === "string" && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: requestHeaders,
    ...init,
  });

  if (auth && response.status === 401) {
    handleUnauthorized();
    throw new ApiError(
      "Sesión expirada. Inicia sesión de nuevo.",
      response.status,
      "UNAUTHORIZED",
    );
  }

  if (!response.ok) {
    const error = await readError(
      response,
      `Request failed with status ${response.status}`,
    );
    throw new ApiError(
      error.message,
      response.status,
      error.code,
      error.field,
      error.fields,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function publicRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
) {
  return apiRequest<T>(path, { ...options, auth: false });
}

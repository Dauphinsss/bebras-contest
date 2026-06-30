const TOKEN_KEY = "bebras_token";
const USER_KEY = "bebras_user";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function setUser(user: AuthUser) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Limpia la sesión y manda al login. Se usa cuando la API responde 401/403. */
export function handleUnauthorized() {
  clearToken();
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

const TOKEN_KEY = "bebras_token";

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
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

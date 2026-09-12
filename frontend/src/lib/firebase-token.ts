/**
 * Lo minimo que hace falta de `Auth` para pedir el ID Token. Se aisla del SDK
 * para poder probar el orden, que es justo donde estaba el error.
 */
export interface TokenSource {
  /** Resuelve cuando Firebase termino de restaurar la sesion persistida. */
  authStateReady(): Promise<void>;
  readonly currentUser: { getIdToken(): Promise<string> } | null;
}

/**
 * `currentUser` es `null` hasta que Firebase termina de leer la sesion guardada,
 * que es asincrono. Leerlo antes devuelve "no hay sesion" en cada carga de
 * pagina: la peticion sale sin cabecera, el backend responde 401 y el frontend
 * cierra una sesion que en realidad estaba viva. Por eso se espera siempre a
 * `authStateReady()` antes de mirar.
 */
export async function idTokenFrom(auth: TokenSource): Promise<string | null> {
  try {
    await auth.authStateReady();
  } catch {
    return null;
  }

  const user = auth.currentUser;
  if (!user) return null;

  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

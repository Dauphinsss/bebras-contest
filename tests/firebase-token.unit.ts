import assert from "node:assert/strict";
import { test } from "node:test";
import {
  idTokenFrom,
  type TokenSource,
} from "../frontend/src/lib/firebase-token";

/**
 * Regresion del bucle de inicio de sesion: al cargar una pagina, Firebase
 * restaura la sesion de forma asincrona y `currentUser` es null hasta que
 * termina. Leerlo antes hacia que la peticion saliera sin cabecera, el backend
 * respondiera 401 y el frontend cerrara una sesion viva; en /login se retomaba
 * sola y volvia a empezar.
 */

/** Simula la restauracion: `currentUser` recien aparece tras `authStateReady`. */
function restoringAuth(token: string | null, calls: string[]): TokenSource {
  let restored = false;
  return {
    async authStateReady() {
      calls.push("authStateReady");
      await Promise.resolve();
      restored = true;
    },
    get currentUser() {
      calls.push("currentUser");
      if (!restored || token === null) return null;
      return { getIdToken: async () => token };
    },
  };
}

test("espera a que Firebase restaure la sesión antes de leer el usuario", async () => {
  const calls: string[] = [];
  assert.equal(await idTokenFrom(restoringAuth("token-123", calls)), "token-123");
  assert.deepEqual(calls, ["authStateReady", "currentUser"]);
});

test("sin sesión devuelve null en lugar de un token vacío", async () => {
  const calls: string[] = [];
  assert.equal(await idTokenFrom(restoringAuth(null, calls)), null);
});

test("un fallo al restaurar no rompe la petición", async () => {
  const auth: TokenSource = {
    authStateReady: () => Promise.reject(new Error("sin IndexedDB")),
    currentUser: null,
  };
  assert.equal(await idTokenFrom(auth), null);
});

test("un fallo al renovar el token devuelve null", async () => {
  const auth: TokenSource = {
    authStateReady: () => Promise.resolve(),
    currentUser: { getIdToken: () => Promise.reject(new Error("sin red")) },
  };
  assert.equal(await idTokenFrom(auth), null);
});

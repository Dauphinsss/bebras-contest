import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

import { FIREBASE_AUTH_LANGUAGE } from "@/lib/email-verification";

// Astro sustituye estas variables al compilar. La configuracion Web de Firebase
// es publica por diseno (las reglas de acceso viven en el proyecto Firebase y en
// el Worker), pero sigue el mismo mecanismo `PUBLIC_*` del resto del frontend.
const config = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID ?? "",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
};

/** Un entorno sin configuracion de Firebase no habilita el login. */
export function isFirebaseConfigured() {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

export const FIREBASE_PROJECT_ID = config.projectId;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function firebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Falta la configuración de Firebase (PUBLIC_FIREBASE_*) en este entorno.",
    );
  }
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function firebaseAuth() {
  if (!auth) {
    auth = getAuth(firebaseApp());
    auth.languageCode = FIREBASE_AUTH_LANGUAGE;
  }
  return auth;
}

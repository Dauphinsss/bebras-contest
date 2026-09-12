declare namespace Cloudflare {
  interface Env {
    /** Proyecto Firebase cuyos ID Token acepta el Worker. Vacio = sin Firebase. */
    FIREBASE_PROJECT_ID: string;
  }
}

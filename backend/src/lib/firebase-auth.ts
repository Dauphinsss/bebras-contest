import { env } from "cloudflare:workers";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";

// Firebase publica las claves publicas de los ID Token como JWKS. Verificar con
// Web Crypto evita el Admin SDK y la Service Account, que no corren en Workers.
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let keys: ReturnType<typeof createRemoteJWKSet> | undefined;

function jwks() {
  // El isolate reutiliza el set entre solicitudes: las claves rotan cada pocas
  // horas y `jose` las revalida solo cuando aparece un `kid` desconocido.
  keys ??= createRemoteJWKSet(new URL(JWKS_URL), {
    cacheMaxAge: 60 * 60 * 1000,
    cooldownDuration: 30 * 1000,
    timeoutDuration: 5 * 1000,
  });
  return keys;
}

export function firebaseProjectId() {
  if (!env.FIREBASE_PROJECT_ID)
    throw new Error("FIREBASE_PROJECT_ID is required");
  return env.FIREBASE_PROJECT_ID;
}

export class FirebaseAuthError extends Error {}

export interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** `password`, `google.com`, etc. tal como lo reporta Firebase. */
  provider: string;
  displayName: string | null;
}

interface FirebaseClaims extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  auth_time?: number;
  firebase?: { sign_in_provider?: string };
}

/**
 * Valida un Firebase ID Token siguiendo el procedimiento oficial: firma RS256
 * contra el JWKS de Google, emisor/audiencia del proyecto, `sub` presente y
 * `auth_time` ya ocurrido.
 */
export async function verifyFirebaseIdToken(
  token: string,
): Promise<FirebaseIdentity> {
  const projectId = firebaseProjectId();
  let claims: FirebaseClaims;

  try {
    const workerEnv = env as unknown as Record<string, string | undefined>;
    if (
      workerEnv.BEBRAS_E2E === "1" &&
      workerEnv.FIREBASE_AUTH_EMULATOR_HOST
    ) {
      claims = decodeJwt(token) as FirebaseClaims;
      if (
        claims.aud !== projectId ||
        claims.iss !== `https://securetoken.google.com/${projectId}`
      ) {
        throw new Error("Wrong emulator project");
      }
    } else {
      const verified = await jwtVerify<FirebaseClaims>(token, jwks(), {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      claims = verified.payload;
    }
  } catch {
    throw new FirebaseAuthError("Sesión inválida o expirada.");
  }

  const uid = typeof claims.sub === "string" ? claims.sub : "";
  if (!uid) throw new FirebaseAuthError("Sesión inválida o expirada.");

  if (
    typeof claims.auth_time === "number" &&
    claims.auth_time > Math.floor(Date.now() / 1000) + 60
  ) {
    throw new FirebaseAuthError("Sesión inválida o expirada.");
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email) throw new FirebaseAuthError("La cuenta no tiene un correo asociado.");

  return {
    uid,
    email,
    emailVerified: claims.email_verified === true,
    provider: claims.firebase?.sign_in_provider ?? "",
    displayName: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null,
  };
}

/**
 * Google verifica el correo por si mismo; solo el proveedor de contraseña puede
 * llegar con un correo sin confirmar.
 */
export function needsEmailVerification(identity: FirebaseIdentity) {
  return identity.provider === "password" && !identity.emailVerified;
}

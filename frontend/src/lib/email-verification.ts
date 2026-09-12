export const FIREBASE_AUTH_LANGUAGE = "es";

export function emailVerificationActionSettings(origin: string) {
  return {
    url: new URL("/login?verified=1", origin).toString(),
  };
}

export interface EmailVerificationUser {
  readonly emailVerified: boolean;
  reload(): Promise<void>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** Refreshes Firebase's cached user and token after the email action completes. */
export async function refreshEmailVerification(
  user: EmailVerificationUser,
): Promise<boolean> {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

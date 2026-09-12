// Astro sustituye esta variable al compilar; staging también debe usar false.
export const REGISTRATION_ONLY =
  import.meta.env?.PUBLIC_REGISTRATION_ONLY === "true";

export function isRegistrationRestrictedPath(
  pathname: string,
  registrationOnly = REGISTRATION_ONLY,
) {
  return (
    registrationOnly &&
    /^\/(grupos|mis-practicas|practica|entrar|rendir)(\/|$)/.test(pathname)
  );
}

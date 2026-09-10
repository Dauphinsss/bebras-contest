/** Valida nuevas claves sin recortar, normalizar ni truncar el secreto. */
export function registrationPasswordError(
  password: string,
): string | undefined {
  if (!password) return "Ingresa una contraseña.";
  if (/\s/u.test(password)) return "La contraseña no puede contener espacios.";
  if ([...password].length < 6)
    return "La contraseña debe tener al menos 6 caracteres.";
  // bcrypt utiliza como máximo 72 bytes, no 72 caracteres.
  if (new TextEncoder().encode(password).length > 72)
    return "La contraseña es muy larga.";
  return undefined;
}

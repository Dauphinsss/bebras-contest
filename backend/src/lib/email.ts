type EmailValidation =
  | { email: string; error?: never }
  | { email?: never; error: string };

// Direcciones convencionales compatibles con input[type=email], con dominio completo.
const LOCAL_PART =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normaliza como el login; no elimina espacios internos, puntos ni alias +. */
export function validateEmail(value: string): EmailValidation {
  const email = value.trim().toLowerCase();
  if (!email) return { error: "Ingresa tu correo." };

  const parts = email.split("@");
  const [local, domain = ""] = parts;
  const labels = domain.split(".");
  if (
    email.length > 254 ||
    parts.length !== 2 ||
    local.length > 64 ||
    !LOCAL_PART.test(local) ||
    labels.length < 2 ||
    !labels.every((label) => DOMAIN_LABEL.test(label))
  ) {
    return { error: "Ingresa un correo válido." };
  }

  return { email };
}

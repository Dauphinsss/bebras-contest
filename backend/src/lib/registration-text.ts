import { formatPersonName } from "./person-name";

type TextValidation =
  | { value: string; error?: never }
  | { value?: never; error: string };

// Comprobar antes de trim/formato para no ocultar controles pegados en el texto.
const CONTROLS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const PERSON_CHARACTERS = /^[\p{L}\p{M} '’ʼ\-‐‑·]+$/u;

export function validateRegistrationText(
  input: string,
  field: "firstName" | "lastName" | "schoolName",
): TextValidation {
  const school = field === "schoolName";
  const verb = school ? "debe" : "deben";
  const label = school
    ? "El nombre del colegio"
    : field === "firstName"
      ? "Los nombres"
      : "Los apellidos";
  if (CONTROLS.test(input)) {
    return { error: `${label} no ${verb} contener caracteres de control.` };
  }
  const normalized = input
    .normalize("NFC")
    .trim()
    .replace(/\p{Zs}+/gu, " ");
  if (!normalized) {
    return {
      error: school
        ? "Ingresa el nombre de tu colegio."
        : field === "firstName"
          ? "Ingresa tus nombres."
          : "Ingresa tus apellidos.",
    };
  }
  const value = school ? normalized : formatPersonName(normalized);
  const max = school ? 200 : 100;
  // Puntos de código tras NFC y formato, sin cortar pares sustitutos ni truncar datos.
  if ([...value].length > max) {
    return { error: `${label} no ${verb} superar los ${max} caracteres.` };
  }
  if (
    school
      ? !/[\p{L}\p{N}]/u.test(value)
      : !/\p{L}/u.test(value) || !PERSON_CHARACTERS.test(value)
  ) {
    return {
      error: school
        ? "Ingresa un nombre de colegio con letras o números."
        : "Usa letras, espacios, guiones o apóstrofos para tu nombre o apellido.",
    };
  }
  return { value };
}

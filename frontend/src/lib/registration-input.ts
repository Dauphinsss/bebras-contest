import type { InputHTMLAttributes } from "react";

// Patrones compatibles con HTML (flag v) y RegExp (flag u).
const NAME_PATTERN = String.raw`[\p{L}\p{M}\p{Zs}'’ʼ\-‐‑·]*`;
const rules = {
  firstName: [
    NAME_PATTERN,
    "Usa letras, espacios, guiones o apóstrofos para tu nombre o apellido.",
  ],
  lastName: [
    NAME_PATTERN,
    "Usa letras, espacios, guiones o apóstrofos para tu nombre o apellido.",
  ],
  phone: [
    String.raw`[+0-9\s\(\).\-]*`,
    "El teléfono no debe contener letras ni otros símbolos.",
  ],
  password: [String.raw`\S*`, "La contraseña no puede contener espacios."],
  confirmPassword: [
    String.raw`\S*`,
    "La contraseña no puede contener espacios.",
  ],
} as const;

export type RestrictedRegistrationField = keyof typeof rules;

export function registrationInputError(
  field: RestrictedRegistrationField,
  value: string,
) {
  const [pattern, message] = rules[field];
  // $ también puede coincidir antes de un salto final: exigir coincidencia completa.
  return new RegExp(`^(?:${pattern})$`, "u").exec(value)?.[0] === value
    ? undefined
    : message;
}

/** Cancela la inserción completa; nunca elimina caracteres de un dato pegado. */
export function registrationInputGuards(
  field: RestrictedRegistrationField,
  reject: (message: string) => void,
): InputHTMLAttributes<HTMLInputElement> {
  const check = (text: string, event: { preventDefault(): void }) => {
    const error = registrationInputError(field, text);
    if (error) {
      event.preventDefault();
      reject(error);
    }
  };
  return {
    pattern: rules[field][0],
    required: true,
    onBeforeInput: (event) => {
      const native = event.nativeEvent as InputEvent;
      if (native.data && !native.isComposing) check(native.data, event);
    },
    onPaste: (event) => check(event.clipboardData.getData("text"), event),
    onDrop: (event) => check(event.dataTransfer.getData("text"), event),
  };
}

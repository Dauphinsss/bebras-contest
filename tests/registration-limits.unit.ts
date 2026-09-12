import assert from "node:assert/strict";
import { test } from "node:test";
import { REGISTRATION_LIMITS } from "../frontend/src/lib/registration-limits";
import { validateRegistrationText } from "../frontend/src/lib/registration-text";
import { validateEmail } from "../frontend/src/lib/email";
import { validatePhone } from "../frontend/src/lib/phone";
import { registrationPasswordError } from "../frontend/src/lib/registration-password";

/**
 * `maxlength` y validacion tienen que decir lo mismo: si se aflojara el atributo
 * el formulario aceptaria escribir algo que el validador va a rechazar, y si se
 * apretara cortaria datos legitimos sin avisar.
 */

const email = (length: number) => {
  const domain = "@example.com";
  return `${"a".repeat(Math.min(length - domain.length, 64))}${"b".repeat(Math.max(length - domain.length - 64, 0))}${domain}`;
};

test("el tope de nombres y apellidos coincide con su validador", () => {
  for (const field of ["firstName", "lastName"] as const) {
    const max = REGISTRATION_LIMITS[field];
    assert.ok(validateRegistrationText("a".repeat(max), field).value, field);
    assert.ok(validateRegistrationText("a".repeat(max + 1), field).error, field);
  }
});

test("el tope del colegio coincide con su validador", () => {
  const max = REGISTRATION_LIMITS.schoolName;
  assert.ok(validateRegistrationText("a".repeat(max), "schoolName").value);
  assert.ok(validateRegistrationText("a".repeat(max + 1), "schoolName").error);
});

test("el tope del correo coincide con su validador", () => {
  const max = REGISTRATION_LIMITS.email;
  const longest = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
  assert.equal(longest.length, max);
  assert.ok(validateEmail(longest).email);
  assert.ok(validateEmail(email(max + 1)).error);
});

test("el tope de la contraseña coincide con su validador", () => {
  const max = REGISTRATION_LIMITS.password;
  assert.equal(registrationPasswordError("a".repeat(max)), undefined);
  assert.equal(
    registrationPasswordError("a".repeat(max + 1)),
    "La contraseña es muy larga.",
  );
});

test("el tope del teléfono no deja escribir más de lo que el validador acepta", () => {
  const max = REGISTRATION_LIMITS.phone;
  // No existe un telefono valido de 100 caracteres: lo que se comprueba es que
  // pasado el tope el validador ya rechaza por longitud.
  assert.ok(validatePhone("7".repeat(max + 1)).error);
  assert.ok(validatePhone("+59171234567").number);
});

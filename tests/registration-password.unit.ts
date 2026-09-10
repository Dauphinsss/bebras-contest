import assert from "node:assert/strict";
import { test } from "node:test";
import { registrationPasswordError as backend } from "../backend/src/lib/registration-password";
import { registrationPasswordError as frontend } from "../frontend/src/lib/registration-password";

const valid = [
  "123456",
  "a-b-c-d",
  "a".repeat(72),
  "é".repeat(36),
  "😀".repeat(18),
  "😀".repeat(6),
  "e\u0301abcd",
];
const invalid = [
  ["", "Ingresa una contraseña."],
  ["      ", "La contraseña no puede contener espacios."],
  [" clave", "La contraseña no puede contener espacios."],
  ["clave ", "La contraseña no puede contener espacios."],
  ["clave con espacios", "La contraseña no puede contener espacios."],
  ["\t\n\u00a0\u2003  ", "La contraseña no puede contener espacios."],
  ["12345", "La contraseña debe tener al menos 6 caracteres."],
  ["😀".repeat(3), "La contraseña debe tener al menos 6 caracteres."],
  ["a".repeat(73), "La contraseña es muy larga."],
  ["é".repeat(36) + "a", "La contraseña es muy larga."],
  ["😀".repeat(18) + "a", "La contraseña es muy larga."],
  ["a".repeat(71) + "  ", "La contraseña no puede contener espacios."],
];

for (const [name, validate] of [
  ["backend", backend],
  ["frontend", frontend],
] as const) {
  test(`${name}: accepts exact minimum and UTF-8 boundaries without normalizing`, () => {
    for (const password of valid) assert.equal(validate(password), undefined);
    // NFC would change both the byte count and the secret; validation must not do it.
    assert.equal(validate("e\u0301".repeat(24)), undefined);
    assert.equal(validate("e\u0301".repeat(25)), "La contraseña es muy larga.");
  });
  test(`${name}: rejects empty, whitespace, short and overlong passwords`, () => {
    for (const [password, error] of invalid)
      assert.equal(validate(password), error);
  });
}

test("registration password errors match in UI and API", () => {
  for (const password of [...valid, ...invalid.map(([value]) => value)]) {
    assert.equal(frontend(password), backend(password));
  }
});

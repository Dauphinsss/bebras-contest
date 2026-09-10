import assert from "node:assert/strict";
import { test } from "node:test";
import { validateEmail as backendEmail } from "../backend/src/lib/email";
import { validateEmail as frontendEmail } from "../frontend/src/lib/email";

const maxEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
const valid = [
  [
    " Maestra+Colegio@Docentes.Example.COM ",
    "maestra+colegio@docentes.example.com",
  ],
  ["nombre.apellido@example.com", "nombre.apellido@example.com"],
  ["o'connor@example.com", "o'connor@example.com"],
  ["maestra_1@mi-colegio.edu.bo", "maestra_1@mi-colegio.edu.bo"],
  ["maestra@xn--espaa-rta.example", "maestra@xn--espaa-rta.example"],
  ["\tMaestra@Example.COM\n", "maestra@example.com"],
  [maxEmail, maxEmail],
];
const invalid = [
  "",
  "   ",
  "sin-arroba",
  "maestra@",
  "@example.com",
  "maestra@colegio",
  "mae stra@example.com",
  "maestra@exa mple.com",
  "mae\nstra@example.com",
  ".maestra@example.com",
  "maestra.@example.com",
  "mae..stra@example.com",
  "maestra@@example.com",
  "maestra@example..com",
  "maestra@-example.com",
  "maestra@example-.com",
  "maestra@example.com.",
  "maestra@mi_colegio.com",
  "Nombre <maestra@example.com>",
  "maestra@example.com,otra@example.com",
  '"maestra"@example.com',
  "maestra@[127.0.0.1]",
  "maestra😀@example.com",
  `${"a".repeat(65)}@example.com`,
  `a@${"b".repeat(64)}.com`,
  `${maxEmail}d`,
];

for (const [name, validate] of [
  ["backend", backendEmail],
  ["frontend", frontendEmail],
] as const) {
  test(`${name}: normalizes conventional emails without losing aliases or dots`, () => {
    assert.equal(maxEmail.length, 254);
    for (const [input, email] of valid) {
      assert.deepEqual(validate(input), { email }, input);
      assert.deepEqual(validate(email), { email }, `idempotent: ${email}`);
    }
  });
  test(`${name}: rejects incomplete emails, invalid labels and length overflows`, () => {
    for (const input of invalid) {
      const result = validate(input);
      assert.ok(result.error, input);
      assert.equal(result.email, undefined, input);
    }
  });
}

test("email validation and error messages match between UI and API", () => {
  for (const input of [...valid.map(([input]) => input), ...invalid]) {
    assert.deepEqual(frontendEmail(input), backendEmail(input), input);
  }
});

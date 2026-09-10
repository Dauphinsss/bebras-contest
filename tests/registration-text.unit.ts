import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRegistrationText as backend } from "../backend/src/lib/registration-text";
import { validateRegistrationText as frontend } from "../frontend/src/lib/registration-text";

for (const [name, validate] of [
  ["backend", backend],
  ["frontend", frontend],
] as const) {
  test(`${name}: preserves Unicode names and normalizes presentation`, () => {
    for (const [input, value] of [
      ["  ana\u00a0  mari\u0301a ", "Ana María"],
      ["jean-luc", "Jean-Luc"],
      ["o’connor", "O’Connor"],
      ["李 小龍", "李 小龍"],
      ["नमस्ते", "नमस्ते"],
      ["محمد", "محمد"],
    ]) {
      for (const field of ["firstName", "lastName"] as const) {
        assert.deepEqual(validate(input, field), { value });
        assert.deepEqual(validate(value, field), { value });
      }
    }
    assert.deepEqual(
      validate("  U.E.  “6 de Agosto” N.º 2 (A-B)  ", "schoolName"),
      { value: "U.E. “6 de Agosto” N.º 2 (A-B)" },
    );
    assert.deepEqual(validate("123", "schoolName"), { value: "123" });
  });
  test(`${name}: checks normalized limits by code point without truncating`, () => {
    for (const field of ["firstName", "lastName", "schoolName"] as const) {
      const max = field === "schoolName" ? 200 : 100;
      for (const letter of ["ñ", "𠮷", "n\u0303"]) {
        assert.ok(validate(`  ${letter.repeat(max)}  `, field).value);
        assert.ok(validate(letter.repeat(max + 1), field).error);
      }
    }
  });
  test(`${name}: rejects meaningless text and controls before normalization`, () => {
    for (const field of ["firstName", "lastName", "schoolName"] as const) {
      for (const input of [
        "",
        "  ",
        "---",
        "😀",
        "\u0301",
        "Ana\tMaría",
        "Ana\n",
        "\u0000Ana",
        "Ana\u200b",
        "Ana\u2028María",
      ]) {
        assert.ok(validate(input, field).error, `${field}: ${input}`);
      }
    }
    for (const input of ["123", "Ana1", "Ana😀", "<Ana>"]) {
      assert.ok(validate(input, "firstName").error);
      assert.ok(validate(input, "lastName").error);
    }
  });
}

test("registration text rules and errors match in UI and API", () => {
  for (const field of ["firstName", "lastName", "schoolName"] as const) {
    for (const input of [
      "",
      "Ana",
      "李",
      "Ana\t",
      "Ana\u0301",
      "U.E. 2",
      "-",
      "a".repeat(100),
      "a".repeat(101),
      "a".repeat(200),
      "a".repeat(201),
    ]) {
      assert.deepEqual(frontend(input, field), backend(input, field));
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  appliedMigrationsFromQuery,
  compareMigrations,
} from "./cloudflare-migrations-check";

const query = JSON.stringify([
  {
    results: [{ name: "0001_initial.sql" }, { name: "0002_users.sql" }],
    success: true,
    meta: { changed_db: false, rows_written: 0 },
  },
]);

test("lee el historial de una consulta D1 de solo lectura", () => {
  assert.deepEqual(appliedMigrationsFromQuery(query), [
    "0001_initial.sql",
    "0002_users.sql",
  ]);
});

test("rechaza JSON inválido o una consulta que escribió", () => {
  assert.throws(() => appliedMigrationsFromQuery("not-json"));
  assert.throws(() =>
    appliedMigrationsFromQuery(
      JSON.stringify([
        {
          results: [],
          success: true,
          meta: { changed_db: true, rows_written: 1 },
        },
      ]),
    ),
  );
});

test("detecta migraciones pendientes", () => {
  assert.deepEqual(
    compareMigrations(
      ["0001_initial.sql", "0002_users.sql", "0003_tasks.sql"],
      ["0001_initial.sql", "0002_users.sql"],
    ),
    { pending: ["0003_tasks.sql"], unknown: [] },
  );
});

test("detecta historial remoto ausente del repositorio", () => {
  assert.deepEqual(
    compareMigrations(
      ["0001_initial.sql"],
      ["0001_initial.sql", "0002_missing.sql"],
    ),
    { pending: [], unknown: ["0002_missing.sql"] },
  );
});

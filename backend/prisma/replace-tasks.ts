import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isScriptMain, parseOptions } from "../../scripts/cloudflare-seed";
import { catalogStatements } from "../../scripts/cloudflare-seed-tasks";
import { withLocalD1, runStatements, type LocalD1, type Statement } from "../../scripts/cloudflare-local-d1";
import { assertIgnored, privateDirectory, protectPath, runWrangler, type CliRunner } from "../../scripts/cloudflare-cli";
import { restoreExport } from "../../scripts/cloudflare-d1-restore";

const GRAPH = ["Result", "AttemptAnswer", "Attempt", "Team", "ContestGroup", "ContestTask", "Contest", "TaskDraft"];
const IDENTITIES = ["School", "User", "TeacherSchool"];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function replacementOptions(args: string[]) {
  let backup: string | undefined;
  let confirmed = false;
  const common: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--confirm-replace" && !confirmed) confirmed = true;
    else if (args[i] === "--backup" && !backup) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("--backup requiere una ruta.");
      backup = resolve(value);
    } else common.push(args[i]);
  }
  const options = parseOptions(common, true);
  if (!confirmed) throw new Error("Operación destructiva no confirmada. Repite con --confirm-replace.");
  return { ...options, backup };
}

export async function verifyDatabase(db: LocalD1) {
  const integrity = (await db.prepare("PRAGMA quick_check").all()).results;
  if (integrity.length !== 1 || integrity[0].quick_check !== "ok") throw new Error("La base no superó quick_check.");
  if ((await db.prepare("PRAGMA foreign_key_check").all()).results.length) throw new Error("La base contiene referencias inválidas.");
}

export async function databaseSnapshot(db: LocalD1): Promise<string> {
  const schema = (await db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name").all()).results;
  const tables: Record<string, string[]> = {};
  for (const row of schema.filter(row => row.type === "table")) {
    tables[String(row.name)] = (await db.prepare(`SELECT * FROM ${quote(String(row.name))}`).all()).results.map(row => JSON.stringify(row)).sort();
  }
  // Include AUTOINCREMENT state, which matters even after rows have been deleted.
  const sequence = (await db.prepare("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'").all()).results;
  if (sequence.length) tables.sqlite_sequence = (await db.prepare("SELECT * FROM sqlite_sequence").all()).results.map(row => JSON.stringify(row)).sort();
  return JSON.stringify({ schema, tables });
}

export async function createVerifiedBackup(config: string, requested?: string, runner: CliRunner = runWrangler) {
  const backup = requested ?? join(privateDirectory("backup-"), "database.sql");
  if (!existsSync(dirname(backup))) throw new Error("El directorio del respaldo no existe.");
  assertIgnored(backup);
  // Reserve exclusively: an existing backup is never overwritten.
  writeFileSync(backup, "", { flag: "wx", mode: 0o600 });
  let exported = false;
  try {
    protectPath(backup);
    const before = await withLocalD1(config, async db => { await verifyDatabase(db); return databaseSnapshot(db); });
    runner(["d1", "export", "DB", "--config", config, "--local", "--output", backup]);
    if (!readFileSync(backup, "utf8").trim()) throw new Error("Respaldo vacío.");
    exported = true;
    // Restore the actual SQL export into isolated D1, never a parallel SQLite runtime.
    const verification = privateDirectory("backup-check-");
    try {
      const verificationConfig = join(verification, "wrangler.jsonc");
      writeFileSync(verificationConfig, JSON.stringify({ name: "backup-check", compatibility_date: "2026-09-11", d1_databases: [{ binding: "DB", database_name: "backup-check", database_id: randomUUID() }] }));
      const restored = await withLocalD1(verificationConfig, async db => { await restoreExport(db, backup); await verifyDatabase(db); return databaseSnapshot(db); }, false);
      if (restored !== before) throw new Error("El respaldo restaurado no coincide con la base original.");
    } finally { rmSync(verification, { recursive: true, force: true }); }
    return { backup, snapshot: before };
  } catch (error) {
    if (!exported) rmSync(backup, { force: true });
    throw error;
  }
}

export async function assertCurrentSchema(db: LocalD1) {
  const required = {
    TaskDraft: ["sourceTaskCode", "answerConfig", "answerKey", "multipleChoiceOrderMode", "explanationBlocks", "isPractice"],
    Contest: ["isPractice", "createdById"],
  };
  for (const [table, columns] of Object.entries(required)) {
    const names = new Set((await db.prepare(`PRAGMA table_info(${quote(table)})`).all()).results.map(row => row.name));
    if (columns.some(column => !names.has(column))) throw new Error(`Esquema desactualizado en ${table}; aplica migraciones D1. El respaldo se conserva.`);
  }
  if ((await db.prepare('PRAGMA table_info("ContestGroup")').all()).results.some(row => row.name === "scheduledAt")) throw new Error("ContestGroup aún tiene scheduledAt; aplica migraciones D1. El respaldo se conserva.");
}

export async function replaceTasks(db: LocalD1, statements = catalogStatements().statements) {
  await assertCurrentSchema(db);
  const suffix = randomUUID().replaceAll("-", "");
  const guard = `ReplaceGuard${suffix}`;
  const batch: Statement[] = [];
  const add = (sql: string, params: Statement["params"] = []) => batch.push({ sql, params });
  // Guards run inside the same batch, so triggers/cascades cannot alter identities.
  for (const table of IDENTITIES) for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    add(`CREATE TRIGGER ${quote(`${guard}${table}${operation}`)} BEFORE ${operation} ON ${quote(table)} BEGIN SELECT RAISE(ABORT, 'Identity modified'); END`);
  }
  add(`CREATE TABLE ${quote(guard)} (ok INTEGER NOT NULL CHECK (ok = 1))`);
  const deleteStart = batch.length;
  for (const table of GRAPH) add(`DELETE FROM ${quote(table)}`);
  batch.push(...statements);
  const ids = statements.map(s => s.params[0]);
  add(`INSERT INTO ${quote(guard)} SELECT COUNT(*) = ? AND SUM(id IN (${ids.map(() => "?").join(",")})) = ? FROM TaskDraft`, [ids.length, ...ids, ids.length]);
  for (const table of GRAPH.filter(table => table !== "TaskDraft")) add(`INSERT INTO ${quote(guard)} SELECT COUNT(*) = 0 FROM ${quote(table)}`);
  add(`INSERT INTO ${quote(guard)} SELECT NOT EXISTS (SELECT * FROM pragma_foreign_key_check)`);
  add(`DROP TABLE ${quote(guard)}`);
  for (const table of IDENTITIES) for (const operation of ["INSERT", "UPDATE", "DELETE"]) add(`DROP TRIGGER ${quote(`${guard}${table}${operation}`)}`);
  const results = await runStatements(db, batch, batch.length);
  await verifyDatabase(db);
  return { inserted: ids.length, deleted: Object.fromEntries(GRAPH.map((table, i) => [table, results[deleteStart + i].meta.changes])) };
}

export async function main(args = process.argv.slice(2)) {
  const options = replacementOptions(args);
  const { statements } = catalogStatements();
  if (options.check) { console.log("Reemplazo local validado: 43 tareas; sin exportar ni escribir."); return; }
  const { backup, snapshot } = await createVerifiedBackup(options.config, options.backup);
  console.log(`Respaldo exportado y verificado: ${backup}`);
  const result = await withLocalD1(options.config, async db => {
    if (await databaseSnapshot(db) !== snapshot) throw new Error("La base cambió después del respaldo; repite con los escritores locales detenidos.");
    return replaceTasks(db, statements);
  });
  console.log(`Reemplazo completo: ${result.inserted} tareas. Eliminados: ${JSON.stringify(result.deleted)}.`);
}

if (isScriptMain("backend/prisma/replace-tasks.ts")) main().catch(() => {
  // SQL/proxy errors may contain database contents; only report a generic failure.
  console.error("Reemplazo local falló. Revisa --confirm-replace, --target local, configuración, ruta ignorada de backup y esquema. El respaldo exportado se conserva.");
  process.exitCode = 1;
});

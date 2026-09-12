import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { replacementOptions, createVerifiedBackup, databaseSnapshot, replaceTasks, main } from "./replace-tasks";
import { privateDirectory } from "../../scripts/cloudflare-cli";
import { withLocalD1, runStatements, type LocalD1 } from "../../scripts/cloudflare-local-d1";
import { catalogStatements } from "../../scripts/cloudflare-seed-tasks";

test("reemplazo requiere confirmación, target local y argumentos válidos", () => {
  for (const args of [[], ["--target", "local"], ["--confirm-replace", "--target", "production"], ["--confirm-replace", "--target", "local", "--backup"], ["--confirm-replace", "--confirm-replace", "--target", "local"]]) assert.throws(() => replacementOptions(args));
});

async function fixture(db: LocalD1) {
  const { statements } = catalogStatements();
  const columns = statements[0].sql.match(/\((.*?)\) VALUES/)![1];
  const sql = [
    'CREATE TABLE School (codUe TEXT PRIMARY KEY, name TEXT)',
    'CREATE TABLE User (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, passwordHash TEXT)',
    'CREATE TABLE TeacherSchool (id TEXT PRIMARY KEY, userId INTEGER REFERENCES User(id), schoolName TEXT)',
    `CREATE TABLE TaskDraft (${columns.split(",").map(c => `${c} ${c === '"id"' ? "TEXT PRIMARY KEY" : ""}`).join(",")})`,
    'CREATE TABLE Contest (id TEXT PRIMARY KEY, isPractice INTEGER, createdById INTEGER REFERENCES User(id))',
    'CREATE TABLE ContestTask (id TEXT PRIMARY KEY, contestId TEXT REFERENCES Contest(id), taskDraftId TEXT REFERENCES TaskDraft(id))',
    'CREATE TABLE ContestGroup (id TEXT PRIMARY KEY, contestId TEXT REFERENCES Contest(id))',
    'CREATE TABLE Team (id TEXT PRIMARY KEY, groupId TEXT REFERENCES ContestGroup(id))',
    'CREATE TABLE Attempt (id TEXT PRIMARY KEY, teamId TEXT REFERENCES Team(id))',
    'CREATE TABLE AttemptAnswer (id TEXT PRIMARY KEY, attemptId TEXT REFERENCES Attempt(id), taskDraftId TEXT REFERENCES TaskDraft(id))',
    'CREATE TABLE Result (id TEXT PRIMARY KEY, attemptId TEXT REFERENCES Attempt(id))',
    "INSERT INTO School VALUES ('001', 'School')",
    "INSERT INTO User VALUES (1, 'admin@example.test', 'original-hash')",
    "INSERT INTO TeacherSchool VALUES ('request', 1, 'School')",
    "INSERT INTO Contest VALUES ('contest', 0, 1)",
    "INSERT INTO ContestGroup VALUES ('group', 'contest')",
    "INSERT INTO Team VALUES ('team', 'group')",
    "INSERT INTO Attempt VALUES ('attempt', 'team')",
    "INSERT INTO Result VALUES ('result', 'attempt')",
  ];
  await runStatements(db, sql.map(sql => ({ sql, params: [] })));
  // Export must also handle the real large image rows, not just tiny fixtures.
  await runStatements(db, statements);
  await db.prepare('INSERT INTO TaskDraft (id, title) VALUES (?, ?)').bind("custom-task", "Preserve in backup").run();
  await db.prepare('INSERT INTO ContestTask VALUES (?, ?, ?)').bind("ct", "contest", statements[0].params[0]).run();
  await db.prepare('INSERT INTO AttemptAnswer VALUES (?, ?, ?)').bind("answer", "attempt", statements[0].params[0]).run();
}

test("reemplazo D1: export restaurable, 43 tareas exactas, identidades y rollback", async () => {
  const dir = privateDirectory("replace-test-");
  const config = join(dir, "wrangler.jsonc");
  const backup = join(dir, "backup.sql");
  writeFileSync(config, JSON.stringify({ name: "replace-test", compatibility_date: "2026-09-11", d1_databases: [{ binding: "DB", database_name: "replace-test", database_id: "00000000-0000-0000-0000-000000000003" }] }));
  try {
    await withLocalD1(config, fixture);
    const before = await withLocalD1(config, databaseSnapshot);
    await assert.rejects(createVerifiedBackup(config, join(dir, "failed.sql"), () => { throw new Error("export failed"); }));
    assert.ok(!existsSync(join(dir, "failed.sql")));
    assert.equal(await withLocalD1(config, databaseSnapshot), before);
    await main(["--target", "local", "--config", config, "--confirm-replace", "--backup", backup]);
    assert.ok(readFileSync(backup, "utf8").includes("custom-task"));
    const originalBackup = readFileSync(backup, "utf8");
    await assert.rejects(createVerifiedBackup(config, backup));
    assert.equal(readFileSync(backup, "utf8"), originalBackup);
    await withLocalD1(config, async db => {
      const rows = (await db.prepare("SELECT * FROM TaskDraft ORDER BY id").all()).results;
      const { statements } = catalogStatements();
      assert.deepEqual(rows.map(row => row.id), statements.map(s => s.params[0]).sort());
      const columns = statements[0].sql.match(/\((.*?)\) VALUES/)![1].split(",").map(c => c.replaceAll('"', ""));
      for (const row of rows) {
        const expected = statements.find(s => s.params[0] === row.id)!;
        for (const [i, name] of columns.entries()) if (!["createdAt", "updatedAt"].includes(name)) assert.equal(row[name], expected.params[i]);
      }
      for (const table of ["Contest", "ContestGroup", "ContestTask", "Team", "Attempt", "AttemptAnswer", "Result"]) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).all()).results[0].n, 0);
      const snapshot = JSON.parse(await databaseSnapshot(db));
      const identities = JSON.parse(before);
      for (const table of ["User", "School", "TeacherSchool", "sqlite_sequence"]) assert.deepEqual(snapshot.tables[table], identities.tables[table]);
      await db.prepare("CREATE TRIGGER AlterIdentity AFTER DELETE ON TaskDraft BEGIN UPDATE User SET passwordHash = 'changed'; END").run();
      const guarded = await databaseSnapshot(db);
      await assert.rejects(replaceTasks(db));
      assert.equal(await databaseSnapshot(db), guarded);
      await db.prepare("DROP TRIGGER AlterIdentity").run();
      const rollback = await databaseSnapshot(db);
      const broken = [...statements, { sql: "INSERT INTO TaskDraft (id) VALUES (?)", params: [statements[0].params[0]] }];
      await assert.rejects(replaceTasks(db, broken));
      assert.equal(await databaseSnapshot(db), rollback);
      await db.prepare("ALTER TABLE ContestGroup ADD COLUMN scheduledAt TEXT").run();
      const outdated = await databaseSnapshot(db);
      await assert.rejects(replaceTasks(db), /scheduledAt/);
      assert.equal(await databaseSnapshot(db), outdated);
    });
    const outdated = await withLocalD1(config, databaseSnapshot);
    const outdatedBackup = join(dir, "outdated.sql");
    await assert.rejects(main(["--target", "local", "--config", config, "--confirm-replace", "--backup", outdatedBackup]), /scheduledAt/);
    assert.ok(readFileSync(outdatedBackup, "utf8").includes("scheduledAt"));
    assert.equal(await withLocalD1(config, databaseSnapshot), outdated);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

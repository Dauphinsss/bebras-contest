import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const backendDirectory = path.resolve(__dirname, "..");

function databaseClient(databasePath: string) {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databasePath }),
  });
}

function runNode(args: string[], databaseUrl: string) {
  return spawnSync(process.execPath, args, {
    cwd: backendDirectory,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
}

test(
  "task seeds preserve edits while replacement backs up and clears the contest graph",
  { timeout: 120_000 },
  async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "bebras-replace-test-"),
    );
    const databasePath = path.join(temporaryDirectory, "catalog.db");
    const backupPath = path.join(temporaryDirectory, "catalog.db.backup-test");
    const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
    let client: PrismaClient | undefined;

    try {
      const push = runNode(
        [
          path.resolve(backendDirectory, "node_modules/prisma/build/index.js"),
          "db",
          "push",
        ],
        databaseUrl,
      );
      assert.equal(push.status, 0, push.stderr);

      client = databaseClient(databasePath);
      const school = await client.school.create({
        data: {
          codUe: "TEST-001",
          name: "Unidad Educativa de prueba",
          dep: "La Paz",
          pro: "Murillo",
          sec: "La Paz",
          dis: "Centro",
        },
      });
      const user = await client.user.create({
        data: {
          email: "pending@example.test",
          name: "Docente pendiente",
          passwordHash: "preserved-hash",
          role: "maestro",
          status: "pending",
          schoolCodUe: school.codUe,
          letterFilename: "letter.pdf",
        },
      });
      await client.teacherSchool.create({
        data: {
          id: "teacher-school-test",
          userId: user.id,
          schoolCodUe: school.codUe,
          schoolName: school.name,
          letterFilename: "second-letter.pdf",
        },
      });
      const customTask = await client.taskDraft.create({
        data: {
          id: "custom-task",
          title: "Tarea local",
          category: "[]",
          difficulties: "{}",
          bodyBlocks: "[]",
          challengeBlocks: "[]",
          answers: "[]",
          correctAnswerId: "",
        },
      });
      const contest = await client.contest.create({
        data: {
          id: "contest-test",
          title: "Concurso histórico",
          category: "Capibara",
          durationMinutes: 40,
          initialScore: 0,
          createdById: user.id,
        },
      });
      await client.contestTask.create({
        data: {
          contestId: contest.id,
          taskDraftId: customTask.id,
          position: 1,
          difficulty: "easy",
          minScore: -2,
          noAnswerScore: 0,
          maxScore: 6,
        },
      });
      const group = await client.contestGroup.create({
        data: {
          contestId: contest.id,
          name: "Grupo histórico",
          accessCode: "REPLACE-TEST",
          recoveryCode: "RECOVERY-TEST",
        },
      });
      const team = await client.team.create({
        data: {
          groupId: group.id,
          memberOneFirstName: "Ada",
          memberOneLastName: "Lovelace",
          personalCode: "PERSONAL-TEST",
        },
      });
      const attempt = await client.attempt.create({
        data: { teamId: team.id },
      });
      await client.attemptAnswer.create({
        data: {
          attemptId: attempt.id,
          taskDraftId: customTask.id,
          responsePayload: "{}",
        },
      });
      await client.result.create({ data: { attemptId: attempt.id } });

      const identitiesBefore = {
        schools: await client.school.findMany(),
        users: await client.user.findMany(),
        teacherSchools: await client.teacherSchool.findMany(),
      };
      await client.$disconnect();
      client = undefined;

      const seedCommand = [
        "--import",
        "tsx",
        path.resolve(__dirname, "seed-tasks.ts"),
      ];
      const firstSeed = runNode(seedCommand, databaseUrl);
      assert.equal(firstSeed.status, 0, firstSeed.stderr);

      client = databaseClient(databasePath);
      assert.equal(await client.taskDraft.count(), 44);
      assert.equal(
        await client.taskDraft.count({
          where: { id: { startsWith: "seed-bebras-" } },
        }),
        0,
      );
      const edited = await client.taskDraft.update({
        where: { id: "bebras-2024-01-caja-de-pulseras" },
        data: { title: "Edición administrativa preservada" },
      });
      await client.$disconnect();
      client = undefined;

      const secondSeed = runNode(seedCommand, databaseUrl);
      assert.equal(secondSeed.status, 0, secondSeed.stderr);
      client = databaseClient(databasePath);
      const preservedEdit = await client.taskDraft.findUniqueOrThrow({
        where: { id: edited.id },
      });
      assert.equal(preservedEdit.title, edited.title);
      assert.deepEqual(preservedEdit.updatedAt, edited.updatedAt);
      assert.equal(await client.taskDraft.count(), 44);
      await client.$disconnect();
      client = undefined;

      const replacement = runNode(
        [
          "--import",
          "tsx",
          path.resolve(__dirname, "replace-tasks.ts"),
          "--confirm-replace",
          "--backup",
          backupPath,
        ],
        databaseUrl,
      );
      assert.equal(replacement.status, 0, replacement.stderr);
      assert.match(replacement.stdout, /Reemplazo completo: 43 tareas/);
      assert.equal(fs.existsSync(backupPath), true);

      client = databaseClient(databasePath);
      assert.deepEqual(
        {
          schools: await client.school.findMany(),
          users: await client.user.findMany(),
          teacherSchools: await client.teacherSchool.findMany(),
        },
        identitiesBefore,
      );
      assert.equal(await client.taskDraft.count(), 43);
      assert.equal(
        await client.taskDraft.count({
          where: { id: { startsWith: "bebras-2024-" } },
        }),
        43,
      );
      assert.equal(
        await client.taskDraft.findUnique({ where: { id: customTask.id } }),
        null,
      );
      const graphCounts = await Promise.all([
        client.result.count(),
        client.attemptAnswer.count(),
        client.attempt.count(),
        client.team.count(),
        client.contestGroup.count(),
        client.contestTask.count(),
        client.contest.count(),
      ]);
      for (const count of graphCounts) {
        assert.equal(count, 0);
      }

      const backup = databaseClient(backupPath);
      try {
        assert.equal(await backup.taskDraft.count(), 44);
        assert.equal(await backup.contest.count(), 1);
        assert.equal(await backup.attemptAnswer.count(), 1);
        assert.deepEqual(await backup.user.findMany(), identitiesBefore.users);
        assert.equal(
          (
            await backup.taskDraft.findUniqueOrThrow({
              where: { id: edited.id },
            })
          ).title,
          edited.title,
        );
      } finally {
        await backup.$disconnect();
      }
    } finally {
      await client?.$disconnect();
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  },
);

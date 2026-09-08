import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { loadCatalogTaskData } from "./task-catalog";

const CONFIRMATION_FLAG = "--confirm-replace";
const REQUIRED_COLUMNS = {
  TaskDraft: [
    "sourceTaskCode",
    "answerConfig",
    "answerKey",
    "multipleChoiceOrderMode",
    "explanationBlocks",
    "isPractice",
  ],
  Contest: ["isPractice", "createdById"],
} as const;

type TableColumn = { name: string };
type IntegrityRow = { integrity_check: string };

export function databaseFilePath(databaseUrl: string, cwd = process.cwd()) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      "db:tasks:replace solo admite DATABASE_URL de SQLite file:",
    );
  }
  const rawPath = decodeURIComponent(
    databaseUrl.slice("file:".length).split("?", 1)[0],
  );
  if (!rawPath) throw new Error("DATABASE_URL no contiene una ruta de archivo");
  return path.resolve(cwd, rawPath);
}

function backupArgument(args: string[]) {
  const index = args.indexOf("--backup");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--backup requiere una ruta de destino");
  }
  return path.resolve(value);
}

function defaultBackupPath(databasePath: string) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  return `${databasePath}.backup-${timestamp}`;
}

async function verifyDatabase(client: PrismaClient, label: string) {
  const integrity = await client.$queryRawUnsafe<IntegrityRow[]>(
    "PRAGMA integrity_check",
  );
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error(`${label} no superó PRAGMA integrity_check`);
  }
  const foreignKeys = await client.$queryRawUnsafe<Record<string, unknown>[]>(
    "PRAGMA foreign_key_check",
  );
  if (foreignKeys.length > 0) {
    throw new Error(`${label} contiene referencias foráneas inválidas`);
  }
}

async function createVerifiedBackup(
  databasePath: string,
  requestedBackupPath?: string,
) {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`La base configurada no existe: ${databasePath}`);
  }
  const backupPath = requestedBackupPath ?? defaultBackupPath(databasePath);
  if (!fs.existsSync(path.dirname(backupPath))) {
    throw new Error(
      `El directorio del respaldo no existe: ${path.dirname(backupPath)}`,
    );
  }
  if (fs.existsSync(backupPath)) {
    throw new Error(
      `El respaldo ya existe y no será sobrescrito: ${backupPath}`,
    );
  }

  const escapedPath = backupPath.replaceAll("'", "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);

  const backupClient = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: backupPath }),
  });
  try {
    await verifyDatabase(backupClient, "El respaldo");
  } catch (error) {
    fs.rmSync(backupPath, { force: true });
    throw error;
  } finally {
    await backupClient.$disconnect();
  }
  return backupPath;
}

async function assertCurrentSchema() {
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const columns = await prisma.$queryRawUnsafe<TableColumn[]>(
      `PRAGMA table_info("${table}")`,
    );
    const names = new Set(columns.map((column) => column.name));
    const missing = requiredColumns.filter((column) => !names.has(column));
    if (missing.length > 0) {
      throw new Error(
        `El esquema está desactualizado: ${table} no tiene ${missing.join(", ")}. El respaldo ya fue creado; ejecuta prisma:push antes de reemplazar.`,
      );
    }
  }

  const groupColumns = await prisma.$queryRawUnsafe<TableColumn[]>(
    'PRAGMA table_info("ContestGroup")',
  );
  if (groupColumns.some((column) => column.name === "scheduledAt")) {
    throw new Error(
      "El esquema está desactualizado: ContestGroup aún tiene scheduledAt. El respaldo ya fue creado; ejecuta prisma:push antes de reemplazar.",
    );
  }
}

async function identitySnapshot(client: PrismaClient) {
  const [schools, users, teacherSchools] = await Promise.all([
    client.school.findMany({ orderBy: { codUe: "asc" } }),
    client.user.findMany({ orderBy: { id: "asc" } }),
    client.teacherSchool.findMany({ orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ schools, users, teacherSchools });
}

async function replaceTasks() {
  const tasks = loadCatalogTaskData();
  const identitiesBefore = await identitySnapshot(prisma);

  const deleted = await prisma.$transaction(
    async (tx) => {
      const counts = {
        results: (await tx.result.deleteMany()).count,
        answers: (await tx.attemptAnswer.deleteMany()).count,
        attempts: (await tx.attempt.deleteMany()).count,
        teams: (await tx.team.deleteMany()).count,
        groups: (await tx.contestGroup.deleteMany()).count,
        contestTasks: (await tx.contestTask.deleteMany()).count,
        contests: (await tx.contest.deleteMany()).count,
        tasks: (await tx.taskDraft.deleteMany()).count,
      };

      for (const task of tasks) {
        await tx.taskDraft.create({ data: task });
      }

      const [savedTasks, graphRows, identitiesAfter] = await Promise.all([
        tx.taskDraft.findMany({ select: { id: true }, orderBy: { id: "asc" } }),
        Promise.all([
          tx.result.count(),
          tx.attemptAnswer.count(),
          tx.attempt.count(),
          tx.team.count(),
          tx.contestGroup.count(),
          tx.contestTask.count(),
          tx.contest.count(),
        ]),
        identitySnapshot(tx as PrismaClient),
      ]);
      const expectedIds = tasks.map((task) => task.id).sort();
      if (
        savedTasks.length !== tasks.length ||
        JSON.stringify(savedTasks.map((task) => task.id)) !==
          JSON.stringify(expectedIds)
      ) {
        throw new Error("La transacción no produjo el catálogo oficial exacto");
      }
      if (graphRows.some((count) => count !== 0)) {
        throw new Error("La transacción dejó filas del grafo de concursos");
      }
      if (identitiesAfter !== identitiesBefore) {
        throw new Error(
          "La transacción alteró colegios, usuarios o solicitudes",
        );
      }
      return counts;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  await verifyDatabase(prisma, "La base reemplazada");
  return { deleted, inserted: tasks.length };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes(CONFIRMATION_FLAG)) {
    throw new Error(
      `Operación destructiva no confirmada. Repite con ${CONFIRMATION_FLAG}`,
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not defined");

  loadCatalogTaskData();
  const databasePath = databaseFilePath(databaseUrl);
  const backupPath = await createVerifiedBackup(
    databasePath,
    backupArgument(args),
  );
  console.log(`Respaldo verificado: ${backupPath}`);

  await assertCurrentSchema();
  const result = await replaceTasks();
  console.log(
    `Reemplazo completo: ${result.inserted} tareas oficiales insertadas. Eliminado: ${JSON.stringify(result.deleted)}.`,
  );
  console.log("Colegios, usuarios y solicitudes permanecen sin cambios.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error al reemplazar el catálogo:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

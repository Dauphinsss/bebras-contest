import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseTaskAnswerConfig } from "../src/lib/task-answers/config";

const ids = [
  "bebras-2024-09-tubo-de-canicas",
  "bebras-2024-31-secuencia-de-pelotas",
  "bebras-2024-19-dias-soleados-huecos",
  "bebras-2024-37-dias-soleados-2",
  "bebras-2024-40-explorando",
];

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Crea solo cinco tareas; nunca actualiza tareas existentes ni sus respuestas. */
async function main() {
  const tasks = JSON.parse(
    readFileSync(
      resolve(__dirname, "../prisma/seed/bebras-tasks.json"),
      "utf8",
    ),
  ) as Array<Record<string, unknown> & { id: string; title: string }>;

  // Validar todas las semillas antes de cualquier escritura.
  const candidates = ids.map((id) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error(`Falta la semilla ${id}`);
    return { task, answers: parseTaskAnswerConfig(task) };
  });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL no está definida.");
  const databasePath = resolve(databaseUrl.replace(/^file:/, ""));
  if (!existsSync(databasePath)) {
    throw new Error(`No existe la base de trabajo: ${databasePath}`);
  }

  const before = await prisma.taskDraft.findMany({ orderBy: { id: "asc" } });
  const beforeIds = before.map((task) => task.id);
  const missing = candidates.filter(({ task }) => !beforeIds.includes(task.id));
  if (!missing.length) {
    console.log(
      `Las cinco tareas ya existen. Conservadas las ${before.length} tareas sin cambios.`,
    );
    return;
  }

  const backupPath = `${databasePath}.backup-assignments-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  // VACUUM INTO crea una copia SQLite consistente, incluido el contenido del WAL.
  await prisma.$executeRawUnsafe("VACUUM INTO ?", backupPath);
  console.log(`Respaldo SQLite: ${backupPath}`);

  const result = await prisma.$transaction(
    async (tx) => {
      const [attemptsBefore, answersBefore] = await Promise.all([
        tx.attempt.count(),
        tx.attemptAnswer.count(),
      ]);
      for (const { task, answers } of missing) {
        await tx.taskDraft.create({
          data: {
            id: task.id,
            title: task.title,
            country: String(task.country),
            year: Number(task.year),
            category: JSON.stringify(task.categories),
            difficulties: JSON.stringify(task.difficulties),
            bodyBlocks: JSON.stringify(task.bodyBlocks),
            challengeBlocks: JSON.stringify(task.challengeBlocks),
            explanationBlocks: JSON.stringify(task.explanationBlocks),
            isPractice: true,
            ...answers,
          },
        });
      }
      const preserved = await tx.taskDraft.findMany({
        where: { id: { in: beforeIds } },
        orderBy: { id: "asc" },
      });
      if (fingerprint(before) !== fingerprint(preserved)) {
        throw new Error(
          "Una tarea anterior cambió. Se revierte la instalación.",
        );
      }
      const [total, attemptsAfter, answersAfter] = await Promise.all([
        tx.taskDraft.count(),
        tx.attempt.count(),
        tx.attemptAnswer.count(),
      ]);
      if (
        total !== before.length + missing.length ||
        attemptsBefore !== attemptsAfter ||
        answersBefore !== answersAfter
      ) {
        throw new Error(
          "Cambió un conteo inesperado. Se revierte la instalación.",
        );
      }
      return { total, attempts: attemptsAfter, answers: answersAfter };
    },
    { timeout: 60_000 },
  );

  for (const { task } of missing) console.log(`Incorporada: ${task.id}`);
  console.log(
    `Tareas: ${before.length} → ${result.total}. Las ${before.length} anteriores conservan exactamente todos sus campos.`,
  );
  console.log(
    `Intentos conservados: ${result.attempts}. Respuestas conservadas: ${result.answers}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

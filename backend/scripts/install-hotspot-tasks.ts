import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseTaskAnswerConfig } from "../src/lib/task-answers/config";

/** Instala únicamente 04/11; una tarea existente conserva las ediciones locales. */
async function main() {
  const tasks = JSON.parse(
    readFileSync(
      resolve(__dirname, "../prisma/seed/bebras-tasks.json"),
      "utf8",
    ),
  ) as Array<Record<string, unknown> & { id: string; title: string }>;
  const ids = [
    "bebras-2024-04-caminando-por-el-bosque",
    "bebras-2024-11-dibujando-barquitos",
  ];
  for (const id of ids) {
    const task = tasks.find((task) => task.id === id);
    if (!task) throw new Error(`Falta la semilla ${id}`);
    const answers = parseTaskAnswerConfig(task);
    if (await prisma.taskDraft.findUnique({ where: { id } })) {
      console.log(`Conservada sin cambios: ${task.title}`);
      continue;
    }
    await prisma.taskDraft.create({
      data: {
        id,
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
    console.log(`Incorporada: ${task.title}`);
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

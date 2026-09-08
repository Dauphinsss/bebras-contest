import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { loadCatalogTaskData } from "./task-catalog";

async function main() {
  const tasks = loadCatalogTaskData();
  const inserted = await prisma.$transaction(async (tx) => {
    const existing = new Set(
      (
        await tx.taskDraft.findMany({
          where: { id: { in: tasks.map((task) => task.id) } },
          select: { id: true },
        })
      ).map((task) => task.id),
    );
    const missing = tasks.filter((task) => !existing.has(task.id));

    for (const task of missing) {
      await tx.taskDraft.create({ data: task });
    }
    return missing.length;
  });

  console.log(
    `Catálogo Bebras validado: ${inserted} tareas nuevas, ${tasks.length - inserted} existentes sin cambios.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en el seed de tareas:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

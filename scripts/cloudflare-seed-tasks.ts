import { loadCatalogTaskData } from "../backend/prisma/task-catalog";
import { executeStatements, insert, parseOptions, prismaDate, isScriptMain } from "./cloudflare-seed";

export function catalogStatements() {
  const tasks = loadCatalogTaskData();
  if (tasks.length !== 43) throw new Error("Se esperaban 43 tareas.");
  const date = prismaDate();
  const sizes: { id: string; rowBytes: number; sqlBytes: number }[] = [];
  const statements = tasks.map(task => {
    const row = { ...task, createdAt: date, updatedAt: date };
    const statement = insert("TaskDraft", "id", row);
    const rowBytes = Object.values(row).reduce<number>((size, value) => size + (typeof value === "string" ? Buffer.byteLength(value) : 8) + 9, 16);
    sizes.push({ id: task.id, rowBytes, sqlBytes: Buffer.byteLength(statement.sql) });
    if (rowBytes > 2_000_000) throw new Error(`Tarea ${task.id}: fila estimada ${rowBytes} bytes excede 2 MB.`);
    return statement;
  });
  return { statements, sizes };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("bun scripts/cloudflare-seed-tasks.ts --target local [--config ruta] [--check]");
    return;
  }
  const options = parseOptions(args, true);
  const { statements, sizes } = catalogStatements();
  console.log(`Catálogo: ${sizes.length} tareas; fila máxima ${Math.max(...sizes.map(s => s.rowBytes))} bytes; SQL máximo ${Math.max(...sizes.map(s => s.sqlBytes))} bytes.`);
  await executeStatements(options, statements);
}

if (isScriptMain("scripts/cloudflare-seed-tasks.ts")) main().catch(() => {
  console.error("Catálogo local falló; revisa límites con --check, configuración y esquema.");
  process.exitCode = 1;
});

import { main } from "../../scripts/cloudflare-seed-tasks";
import { isScriptMain } from "../../scripts/cloudflare-seed";

if (isScriptMain("backend/prisma/seed-tasks.ts")) main().catch(() => {
  console.error("Seed de tareas falló. Usa --target local y --config con la configuración del Worker.");
  process.exitCode = 1;
});

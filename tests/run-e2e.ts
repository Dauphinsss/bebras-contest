import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const backend = resolve(root, "backend");
const databaseFiles = [
  "test.db",
  "test.db-journal",
  "test.db-shm",
  "test.db-wal",
].map((name) => resolve(backend, name));
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "bebras2026";
const testEnv = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "marko@bebras.bo",
  E2E_ADMIN_PASSWORD: adminPassword,
  SEED_ADMIN_PASSWORD: adminPassword,
};

function cleanupDatabase() {
  for (const file of databaseFiles) {
    rmSync(file, { force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function run(command: string[], cwd: string) {
  const process = Bun.spawn(command, {
    cwd,
    env: testEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`Falló el comando: ${command.join(" ")}`);
  }
}

async function main() {
  cleanupDatabase();

  try {
    await run(["bun", "run", "prisma:push"], backend);
    await run(["bun", "run", "db:admins"], backend);
    await run(["bun", "run", "db:tasks"], backend);
    await run(["bun", "x", "playwright", "test"], root);
  } finally {
    cleanupDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

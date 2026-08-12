import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const backend = resolve(root, "backend");
const testArtifacts = [
  "test.db",
  "test.db-journal",
  "test.db-shm",
  "test.db-wal",
  "test-clock.txt",
].map((name) => resolve(backend, name));
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "bebras2026";
const testEnv = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "marko@bebras.bo",
  E2E_ADMIN_PASSWORD: adminPassword,
  SEED_ADMIN_PASSWORD: adminPassword,
  E2E_CLOCK_FILE: resolve(backend, "test-clock.txt"),
};

function cleanupTestArtifacts() {
  for (const file of testArtifacts) {
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
  cleanupTestArtifacts();

  try {
    await run(["bun", "run", "prisma:push"], backend);
    await run(["bun", "run", "db:admins"], backend);
    await run(["bun", "run", "db:tasks"], backend);
    await run(["bun", "x", "playwright", "test"], root);
  } finally {
    cleanupTestArtifacts();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

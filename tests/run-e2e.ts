import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

type Env = Record<string, string>;

const root = resolve(import.meta.dir, "..");
const backend = resolve(root, "backend");
const frontend = resolve(root, "frontend");
const backendUrl = "http://localhost:3100";
const frontendUrl = "http://localhost:4421";
const database = resolve(backend, "test.db");
const clockFile = resolve(backend, "test-clock.txt");
const testArtifacts = [
  "test.db",
  "test.db-journal",
  "test.db-shm",
  "test.db-wal",
  "test-clock.txt",
].map((name) => resolve(backend, name));
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "bebras2026";

/**
 * Modo rápido: reaprovecha la base sembrada y los servidores que ya estén
 * escuchando. Sirve mientras se itera sobre un módulo; la corrida completa y
 * reproducible sigue siendo la de siempre, sin la bandera.
 */
const fast = process.argv.includes("--rapido");
const serversOnly = process.argv.includes("--servidores");
const testEnv = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  JWT_SECRET: "bebras-isolated-e2e-session-secret",
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "marko@bebras.bo",
  E2E_ADMIN_PASSWORD: adminPassword,
  SEED_ADMIN_PASSWORD: adminPassword,
  E2E_CLOCK_FILE: clockFile,
  E2E_REUSE_SERVERS: fast || serversOnly ? "1" : "0",
};

function cleanupTestArtifacts() {
  for (const file of testArtifacts) {
    rmSync(file, { force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function run(command: string[], cwd: string, extraEnv: Env = {}) {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...testEnv, ...extraEnv },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`Falló el comando: ${command.join(" ")}`);
  }
}

/** Deja backend y frontend de prueba levantados para las corridas rápidas. */
async function startServers() {
  console.log(
    "Servidores de prueba en http://localhost:3100 y http://localhost:4421.\n" +
      "Déjalos abiertos y corre las pruebas con: bun run test:e2e:rapido\n",
  );

  if (!existsSync(database)) {
    await run(["bun", "run", "prisma:push"], backend);
    await run(["bun", "run", "db:admins"], backend);
    await run(["bun", "run", "db:tasks"], backend);
  }

  // Los mismos puertos y variables que usa playwright.config.ts al levantarlos.
  await Promise.all([
    run(["bun", "run", "dev"], backend, {
      PORT: "3100",
      FRONTEND_ORIGIN: frontendUrl,
    }),
    run(["bun", "run", "dev", "--", "--port", "4421"], frontend, {
      PUBLIC_API_BASE_URL: backendUrl,
    }),
  ]);
}

async function main() {
  if (serversOnly) {
    await startServers();
    return;
  }

  const playwrightArgs = process.argv
    .slice(2)
    .filter((argument) => argument !== "--" && argument !== "--rapido");

  // La base sembrada se conserva entre corridas rápidas; el reloj de pruebas
  // no, porque una hora vieja rompe cualquier ventana de desafío.
  if (fast) {
    rmSync(clockFile, { force: true, maxRetries: 5, retryDelay: 200 });
  } else {
    cleanupTestArtifacts();
  }

  try {
    if (!fast || !existsSync(database)) {
      await run(["bun", "run", "prisma:push"], backend);
      await run(["bun", "run", "db:admins"], backend);
      await run(["bun", "run", "db:tasks"], backend);
    }

    await run(["bun", "x", "playwright", "test", ...playwrightArgs], root);
  } finally {
    if (fast) {
      rmSync(clockFile, { force: true, maxRetries: 5, retryDelay: 200 });
    } else {
      cleanupTestArtifacts();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

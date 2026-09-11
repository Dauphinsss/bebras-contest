import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
if (!["local", "staging", "production"].includes(target ?? "")) {
  throw new Error("Uso: bun scripts/cloudflare-build.ts local|staging|production");
}
const branch = process.env.WORKERS_CI_BRANCH;
if (branch && branch !== (target === "production" ? "master" : "staging")) {
  throw new Error(`La rama ${branch} no puede publicar el entorno ${target}.`);
}
const env = {
  ...process.env,
  PUBLIC_REGISTRATION_ONLY: target === "production" ? "true" : "false",
  PUBLIC_API_BASE_URL: "",
};
for (const command of [
  ["bun", "run", "--cwd", "backend", "prisma:generate"],
  ["bun", "run", "--cwd", "frontend", "build"],
]) {
  const child = Bun.spawn(command, { cwd: root, env, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code) process.exit(code);
}

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
// Configuracion Web de Firebase: identificadores publicos que viajan en el
// bundle del navegador, no secretos. Cada entorno usa su propio proyecto para
// no compartir usuarios: production -> bebras-bo, staging -> bebras-bo-staging.
// Cualquiera de estos valores se puede sobreescribir desde el entorno.
const firebase: Record<string, Record<string, string>> = {
  local: {},
  staging: {
    PUBLIC_FIREBASE_API_KEY: "AIzaSyBHXAM0ixV2iCWD_dE2rN-SHKS2W2Ay2z0",
    PUBLIC_FIREBASE_AUTH_DOMAIN: "bebras-bo-staging.firebaseapp.com",
    PUBLIC_FIREBASE_PROJECT_ID: "bebras-bo-staging",
    PUBLIC_FIREBASE_APP_ID: "1:88239195646:web:044edbc9ca41c429286caf",
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "88239195646",
  },
  production: {
    PUBLIC_FIREBASE_API_KEY: "AIzaSyCgEF_MekXH2WfuRVkwcWex__IfafBAGKs",
    PUBLIC_FIREBASE_AUTH_DOMAIN: "bebras-bo.firebaseapp.com",
    PUBLIC_FIREBASE_PROJECT_ID: "bebras-bo",
    PUBLIC_FIREBASE_APP_ID: "1:1026208753397:web:652dd936ef213b6bab87bc",
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1026208753397",
  },
};
const firebaseEnv = Object.fromEntries(
  Object.entries(firebase[target!]!).filter(([key]) => !process.env[key]),
);
const env = {
  ...process.env,
  ...firebaseEnv,
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

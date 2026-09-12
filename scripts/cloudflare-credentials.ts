import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { assertIgnored, protectPath } from "./cloudflare-cli";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
const action = process.argv[3] ?? "prepare";
if (!["local", "staging", "production"].includes(target ?? "") || !["prepare", "seed", "upload"].includes(action)) {
  throw new Error("Uso: bun scripts/cloudflare-credentials.ts local|staging|production prepare|seed|upload");
}
if (target === "local" && action === "upload") throw new Error("Local utiliza .dev.vars.");
const folder = resolve(root, ".wrangler", "credentials");
const path = resolve(folder, `${target}.json`);
assertIgnored(path);
if (target !== "local" && action !== "prepare") {
  try { await access(path); }
  catch {
    throw new Error("Faltan las credenciales originales del entorno remoto. Recupéralas del respaldo privado; no generes otras para un entorno existente.");
  }
}
await mkdir(folder, { recursive: true, mode: 0o700 });
protectPath(folder, true);
try {
  await writeFile(path, JSON.stringify({
    JWT_SECRET: randomBytes(48).toString("base64url"),
    SEED_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  }, null, 2), { flag: "wx", mode: 0o600 });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
}
protectPath(path);
let secrets: { JWT_SECRET: string; SEED_ADMIN_PASSWORD: string };
try { secrets = JSON.parse(await readFile(path, "utf8")); }
catch { throw new Error("No se pudo leer el archivo de credenciales JSON."); }
if (!secrets || typeof secrets.JWT_SECRET !== "string" || !secrets.JWT_SECRET.trim() || /[\r\n]/.test(secrets.JWT_SECRET) || typeof secrets.SEED_ADMIN_PASSWORD !== "string" || !secrets.SEED_ADMIN_PASSWORD.trim()) throw new Error("Archivo de credenciales incompleto o inválido.");
if (target === "local") {
  const devVars = resolve(root, ".dev.vars");
  assertIgnored(devVars);
  try {
    await writeFile(devVars, `JWT_SECRET=${secrets.JWT_SECRET}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  protectPath(devVars);
}
if (action === "seed") {
  const child = Bun.spawn(["bun", "scripts/cloudflare-seed.ts", "--target", target!], {
    cwd: root,
    env: { ...process.env, SEED_ADMIN_PASSWORD: secrets.SEED_ADMIN_PASSWORD },
    stdout: "inherit", stderr: "inherit",
  });
  if (await child.exited) throw new Error("Falló el bootstrap; las credenciales se conservaron.");
} else if (action === "upload") {
  const require = createRequire(resolve(root, "package.json"));
  const cli = resolve(require.resolve("wrangler/package.json"), "../bin/wrangler.js");
  const env: NodeJS.ProcessEnv = { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" };
  delete env.SEED_ADMIN_PASSWORD;
  const child = Bun.spawn(["node", cli, "secret", "bulk", "--config", resolve(root, "wrangler.jsonc"), "--env", target!], {
    cwd: root, env,
    stdin: "pipe", stdout: "inherit", stderr: "inherit",
  });
  child.stdin.write(JSON.stringify({ JWT_SECRET: secrets.JWT_SECRET }));
  child.stdin.end();
  if (await child.exited) throw new Error("Falló la carga de secrets.");
}
console.log(`Credenciales ${target} conservadas en .wrangler/credentials/${target}.json (excluido de Git).`);

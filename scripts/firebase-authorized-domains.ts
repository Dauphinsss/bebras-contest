/**
 * Lista y agrega dominios autorizados de Firebase Authentication.
 *
 * Sin este permiso el inicio de sesion con Google falla desde el dominio del
 * Worker (`auth/unauthorized-domain`). `firebase-tools` no expone un comando
 * para esto, pero si el modulo que usa internamente `hosting:channel:deploy`,
 * con la misma sesion de `firebase login`.
 *
 *   bun scripts/firebase-authorized-domains.ts
 *   bun scripts/firebase-authorized-domains.ts --add bebras-contest.bebrasbolivia.workers.dev
 */
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));

const { requireAuth } = require("firebase-tools/lib/requireAuth");
const { getGlobalDefaultAccount, setActiveAccount } = require("firebase-tools/lib/auth");
const { getAuthDomains, updateAuthDomains } = require("firebase-tools/lib/gcp/auth");

const args = process.argv.slice(2);
const projectIndex = args.indexOf("--project");
const project = projectIndex >= 0 ? args[projectIndex + 1] : "bebras-bo";
const added = args
  .flatMap((value, index) => (args[index - 1] === "--add" ? [value] : []))
  .map((domain) => domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));

const options = { project, projectId: project };
setActiveAccount(options, getGlobalDefaultAccount());
await requireAuth(options);

const current: string[] = await getAuthDomains(project);
console.log(`Dominios autorizados de ${project}:`);
for (const domain of current) console.log(`  ${domain}`);

if (!added.length) {
  console.log("\nSin --add no se cambia nada.");
  process.exit(0);
}

const missing = added.filter((domain) => !current.includes(domain));

if (!missing.length) {
  console.log("\nNada que agregar: ya estaban autorizados.");
  process.exit(0);
}

const updated: string[] = await updateAuthDomains(project, [...current, ...missing]);
console.log(`\nAgregados: ${missing.join(", ")}`);
console.log(`Ahora: ${updated.join(", ")}`);

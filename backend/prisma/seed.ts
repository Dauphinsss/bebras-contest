import { parseOptions, schoolStatements, isScriptMain } from "../../scripts/cloudflare-seed";
import { withLocalD1, runStatements, type LocalD1 } from "../../scripts/cloudflare-local-d1";

export async function seedSchools(db: LocalD1, force: boolean) {
  const statements = schoolStatements();
  const { results } = await db.prepare('SELECT COUNT(*) AS count FROM "School"').all<{ count: number }>();
  if (results[0].count === statements.length && !force) return;
  // Preserve the legacy replacement semantics and all-or-nothing behavior.
  const replacement = [{ sql: 'DELETE FROM "School"', params: [] }, ...statements];
  await runStatements(db, replacement, replacement.length);
  console.log(`Colegios: ${statements.length} guardados.`);
}

export async function main(args = process.argv.slice(2)) {
  const force = args.includes("--force");
  const options = parseOptions(args.filter(arg => arg !== "--force"), true);
  if (options.check) { schoolStatements(); return; }
  await withLocalD1(options.config, db => seedSchools(db, force));
}

if (isScriptMain("backend/prisma/seed.ts")) main().catch(() => {
  console.error("Seed colegios falló; revisa target, configuración y esquema D1.");
  process.exitCode = 1;
});

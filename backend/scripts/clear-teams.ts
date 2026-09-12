import { parseOptions, isScriptMain } from "../../scripts/cloudflare-seed";
import { withLocalD1, runStatements, type LocalD1 } from "../../scripts/cloudflare-local-d1";

export async function clearTeams(db: LocalD1) {
  // One D1 batch is atomic, including all dependent deletes.
  const results = await runStatements(db, ["AttemptAnswer", "Result", "Attempt", "Team"].map(table => ({ sql: `DELETE FROM "${table}"`, params: [] })));
  return results[3].meta.changes;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args, true);
  if (options.check) return;
  const count = await withLocalD1(options.config, clearTeams);
  console.log("Equipos eliminados:", count);
}

if (isScriptMain("backend/scripts/clear-teams.ts")) main().catch(() => {
  console.error("Limpieza local falló; revisa target, configuración y esquema D1.");
  process.exitCode = 1;
});

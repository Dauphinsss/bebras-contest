import fs from "node:fs";
import path from "node:path";
import { migrateCatalogFiles, validateCatalog } from "./catalog-migration";

const rawArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const checkOnly = rawArguments.includes("--check");
const argumentsWithoutFlags = rawArguments.filter(
  (argument) => argument !== "--check",
);

if (checkOnly && argumentsWithoutFlags.length <= 1) {
  try {
    const catalogPath = argumentsWithoutFlags[0]
      ? path.resolve(argumentsWithoutFlags[0])
      : path.resolve(__dirname, "seed/bebras-tasks.json");
    const catalog: unknown = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    validateCatalog(catalog);
    console.log(`Validated ${catalog.length} tasks; no file was written.`);
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (argumentsWithoutFlags.length !== 3) {
  console.error(
    "Usage: migrate-catalog --check [catalog-json] | [--check] <legacy-json> <current-json> <output-json>",
  );
  process.exit(1);
}

const [legacyPath, currentPath, outputPath] = argumentsWithoutFlags.map(
  (value) => path.resolve(value),
);

try {
  const { catalog } = migrateCatalogFiles(legacyPath, currentPath, outputPath, {
    write: !checkOnly,
  });
  if (checkOnly) {
    console.log(`Validated ${catalog.length} tasks; no file was written.`);
  } else {
    console.log(`Wrote ${catalog.length} validated tasks to ${outputPath}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

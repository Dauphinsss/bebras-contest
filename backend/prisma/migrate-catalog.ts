import path from "node:path";
import { migrateCatalogFiles } from "./catalog-migration";

const rawArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const checkOnly = rawArguments.includes("--check");
const argumentsWithoutFlags = rawArguments.filter(
  (argument) => argument !== "--check",
);

if (argumentsWithoutFlags.length !== 3) {
  console.error(
    "Usage: migrate-catalog [--check] <legacy-json> <current-json> <output-json>",
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

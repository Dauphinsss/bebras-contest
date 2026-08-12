import { constants, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const environmentFiles = ["backend/.env", "frontend/.env"];

for (const relativePath of environmentFiles) {
  const destination = resolve(root, relativePath);

  if (existsSync(destination)) {
    console.log(`Conservado: ${relativePath}`);
    continue;
  }

  copyFileSync(`${destination}.example`, destination, constants.COPYFILE_EXCL);
  console.log(`Creado: ${relativePath}`);
}

import "dotenv/config";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

const SNAPSHOT = resolve(__dirname, "seed", "schools.ndjson.gz");
const BATCH_SIZE = 500;

type SchoolRow = {
  codUe: string;
  codLe: string | null;
  name: string;
  dep: string;
  pro: string;
  sec: string;
  dis: string;
  depend: string | null;
  nivel: string | null;
  area: string | null;
  latitud: number | null;
  longitud: number | null;
  matricula: number | null;
};

function readSnapshot(): SchoolRow[] {
  let raw: Buffer;

  try {
    raw = readFileSync(SNAPSHOT);
  } catch {
    throw new Error(
      `No se encontró ${SNAPSHOT}. Ejecuta "bun run db:schools:fetch" para descargarlo del MINEDU.`,
    );
  }

  return gunzipSync(raw)
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SchoolRow);
}

async function seedSchools(force: boolean) {
  const existing = await prisma.school.count();

  if (existing > 0 && !force) {
    console.log(
      `Colegios: ya hay ${existing} en la base, no se toca nada. Usa --force para reemplazarlos.`,
    );
    return;
  }

  const rows = readSnapshot();
  console.log(`Colegios: cargando ${rows.length} desde el snapshot...`);

  await prisma.school.deleteMany();

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await prisma.school.createMany({
      data: rows.slice(index, index + BATCH_SIZE),
    });
  }

  console.log(`Colegios: ${await prisma.school.count()} guardados.`);
}

async function main() {
  const force = process.argv.includes("--force");
  await seedSchools(force);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en el seed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

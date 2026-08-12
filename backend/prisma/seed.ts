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

  const rows = gunzipSync(raw)
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SchoolRow);

  if (rows.length === 0) {
    throw new Error("El snapshot de colegios está vacío.");
  }

  const codes = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!row.codUe?.trim() || !row.name?.trim() || !row.dep?.trim()) {
      throw new Error(
        `El colegio de la línea ${index + 1} no tiene código, nombre o departamento.`,
      );
    }
    if (codes.has(row.codUe)) {
      throw new Error(`El código de unidad educativa ${row.codUe} está duplicado.`);
    }
    codes.add(row.codUe);
  }

  return rows;
}

async function seedSchools(force: boolean) {
  const rows = readSnapshot();
  const existing = await prisma.school.count();

  if (existing === rows.length && !force) {
    console.log(
      `Colegios: los ${existing} registros del snapshot ya están cargados. Usa --force para reemplazarlos.`,
    );
    return;
  }

  if (existing > 0 && !force) {
    console.log(
      `Colegios: la carga está incompleta (${existing} de ${rows.length}); se reemplazará.`,
    );
  }
  console.log(`Colegios: cargando ${rows.length} desde el snapshot...`);

  await prisma.$transaction(
    async (tx) => {
      await tx.school.deleteMany();

      for (let index = 0; index < rows.length; index += BATCH_SIZE) {
        await tx.school.createMany({
          data: rows.slice(index, index + BATCH_SIZE),
        });
      }
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const saved = await prisma.school.count();
  if (saved !== rows.length) {
    throw new Error(
      `La carga terminó con ${saved} colegios, pero el snapshot contiene ${rows.length}.`,
    );
  }

  console.log(`Colegios: ${saved} guardados.`);
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

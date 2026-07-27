import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const BASE =
  "https://seie.minedu.gob.bo/geoserver/minedu/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=minedu:vw_unidad_geo7&outputFormat=application/json&sortBy=cod_ue";
const PAGE_SIZE = 2000;
const SNAPSHOT = resolve(__dirname, "..", "prisma", "seed", "schools.ndjson.gz");

type Feature = {
  properties: {
    cod_ue?: string;
    cod_le?: string;
    des_ue?: string;
    des_dep?: string;
    des_pro?: string;
    des_sec?: string;
    des_dis?: string;
    depend?: string;
    nivel?: number | string;
    area?: string;
    latitud?: number;
    longitud?: number;
    matricula?: number;
  };
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchPage(startIndex: number) {
  const url = `${BASE}&count=${PAGE_SIZE}&startIndex=${startIndex}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `El servicio respondió ${response.status}. ${body.slice(0, 300)}`,
      );
    }

    let data: { features?: Feature[] };
    try {
      data = JSON.parse(body) as { features?: Feature[] };
    } catch {
      throw new Error(
        `Respuesta no es JSON (¿error del servidor?): ${body.slice(0, 300)}`,
      );
    }

    return data.features ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log("Descargando unidades educativas del MINEDU (por lotes)...");

  const seen = new Set<string>();
  const rows = [];
  let startIndex = 0;

  for (;;) {
    const features = await fetchPage(startIndex);
    if (features.length === 0) {
      break;
    }

    for (const feature of features) {
      const props = feature.properties ?? {};
      const codUe = clean(props.cod_ue);
      const name = clean(props.des_ue);
      if (!codUe || !name || seen.has(codUe)) {
        continue;
      }
      seen.add(codUe);
      rows.push({
        codUe,
        codLe: clean(props.cod_le) || null,
        name,
        dep: clean(props.des_dep),
        pro: clean(props.des_pro),
        sec: clean(props.des_sec),
        dis: clean(props.des_dis),
        depend: clean(props.depend) || null,
        nivel: props.nivel != null ? String(props.nivel) : null,
        area: clean(props.area) || null,
        latitud: typeof props.latitud === "number" ? props.latitud : null,
        longitud: typeof props.longitud === "number" ? props.longitud : null,
        matricula: typeof props.matricula === "number" ? props.matricula : null,
      });
    }

    console.log(`  descargados ${startIndex + features.length}...`);

    if (features.length < PAGE_SIZE) {
      break;
    }
    startIndex += PAGE_SIZE;
  }

  if (rows.length === 0) {
    throw new Error("El servicio no devolvió ningún colegio; no se sobrescribe el snapshot.");
  }

  rows.sort((left, right) => left.codUe.localeCompare(right.codUe));

  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  const ndjson = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(SNAPSHOT, gzipSync(Buffer.from(ndjson, "utf8"), { level: 9 }));

  console.log(`Listo. ${rows.length} colegios guardados en ${SNAPSHOT}.`);
  console.log('Ejecuta "bun run db:seed --force" para cargarlos en la base.');
}

main().catch((error) => {
  console.error("Error en la descarga:", error);
  process.exit(1);
});

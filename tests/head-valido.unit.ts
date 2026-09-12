import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

/**
 * Regresion del parpadeo sin estilos al cambiar de seccion.
 *
 * `<head>` solo admite unas pocas etiquetas. Al colarse una que no lo es (era un
 * `<span>` del guard de sesion), el parser cierra `<head>` ahi mismo y manda al
 * `<body>` todo lo que venga despues, incluida la hoja de estilos. Ahi cada
 * navegacion del ClientRouter la destruye al reemplazar el body y hay que volver
 * a descargar y parsear el CSS: la pagina se ve sin estilos unos cientos de
 * milisegundos.
 */

const dist = resolve(import.meta.dirname, "../frontend/dist");

const PERMITIDAS = new Set([
  "base",
  "basefont",
  "bgsound",
  "link",
  "meta",
  "noscript",
  "script",
  "style",
  "template",
  "title",
]);

function paginas(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) return paginas(ruta);
    return entrada.name.endsWith(".html") ? [ruta] : [];
  });
}

test("el <head> de cada página solo contiene etiquetas válidas", (t) => {
  if (!existsSync(dist)) {
    t.skip("sin frontend/dist: ejecutar bun run build:production antes");
    return;
  }

  const archivos = paginas(dist);
  assert.ok(archivos.length > 0, "no se encontró ninguna página construida");

  for (const archivo of archivos) {
    const html = readFileSync(archivo, "utf8");
    const fin = html.indexOf("</head>");
    if (fin < 0) continue;
    const head = html.slice(html.indexOf("<head>") + "<head>".length, fin);

    const invalidas = [...head.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)]
      .map((coincidencia) => coincidencia[1].toLowerCase())
      // Los componentes personalizados llevan guion y el parser los deja pasar.
      .filter((etiqueta) => !PERMITIDAS.has(etiqueta) && !etiqueta.includes("-"));

    assert.deepEqual(
      [...new Set(invalidas)],
      [],
      `${archivo.slice(dist.length + 1)} tiene etiquetas no permitidas en <head>; el navegador cerraría <head> ahí y la hoja de estilos caería al <body>`,
    );
  }
});

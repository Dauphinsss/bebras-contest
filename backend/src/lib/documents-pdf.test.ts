import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createAuthorizationLetter } from "./documents-pdf";

const fields = {
  city: "La Paz",
  day: "11",
  month: "septiembre",
  year: "2026",
  school: "Unidad Educativa Simón Bolívar",
  teacher: "María Pérez",
  id: "1234567",
  director: "José Muñoz",
  schoolSign: "Unidad Educativa Simón Bolívar",
};

test("la carta produce un PDF A4 legible con los metadatos originales", async () => {
  const bytes = await createAuthorizationLetter(fields);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getAuthor(), fields.director);
  assert.equal(doc.getTitle(), "Carta de autorización — Desafío Bebras Bolivia");
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.28) < 0.1);
  assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.89) < 0.1);
});

test("la entrada Unicode fuera de WinAnsi no aborta la carta", async () => {
  const bytes = await createAuthorizationLetter({
    ...fields,
    school: "Colegio 🦫 — Educación",
    teacher: "María 李",
  });
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test("el contenido extenso crea páginas adicionales", async () => {
  const bytes = await createAuthorizationLetter({
    ...fields,
    school: "Nombre de colegio extenso ".repeat(300),
  });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
});

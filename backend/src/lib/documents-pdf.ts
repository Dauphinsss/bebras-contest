import { PDFDocument, PageSizes, StandardFonts } from "pdf-lib";

type LetterFields = Record<
  "city" | "day" | "month" | "year" | "school" | "teacher" | "id" | "director" | "schoolSign",
  string
>;
type Segment = [text: string, bold: boolean];

/** Standard fonts are embedded by pdf-lib without filesystem access. */
export async function createAuthorizationLetter(fields: LetterFields) {
  const doc = await PDFDocument.create();
  doc.setTitle("Carta de autorización — Desafío Bebras Bolivia");
  doc.setAuthor(fields.director);
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  let page = doc.addPage(PageSizes.A4);
  const margin = 68;
  const size = 12;
  const lineHeight = 16;
  const right = page.getWidth() - margin;
  let y = page.getHeight() - 74;

  const ensureSpace = () => {
    if (y < 62) {
      page = doc.addPage(PageSizes.A4);
      y = page.getHeight() - 74;
    }
  };
  const paragraph = (segments: Segment[], alignRight = false, underline = false) => {
    // WinAnsi covers Spanish. Unsupported code points become '?' instead of
    // making a user-entered emoji abort generation of the entire document.
    const tokens = segments.flatMap(([text, strong]) => {
      const font = strong ? bold : regular;
      const supported = new Set(font.getCharacterSet());
      const safe = Array.from(text.normalize("NFC"), (char) =>
        /\s/u.test(char) ? " " : supported.has(char.codePointAt(0)!) ? char : "?",
      ).join("");
      return (safe.match(/\s+|\S+/g) ?? []).map((text) => ({ text, font }));
    });
    let line: typeof tokens = [];
    let width = 0;
    const flush = () => {
      ensureSpace();
      let x = alignRight ? right - width : margin;
      const start = x;
      for (const token of line) {
        page.drawText(token.text, { x, y, size, font: token.font });
        x += token.font.widthOfTextAtSize(token.text, size);
      }
      if (underline) page.drawLine({ start: { x: start, y: y - 2 }, end: { x, y: y - 2 }, thickness: 0.6 });
      y -= lineHeight;
      line = [];
      width = 0;
    };
    for (const token of tokens) {
      const wordWidth = token.font.widthOfTextAtSize(token.text, size);
      if (!/^\s+$/.test(token.text) && width > 0 && wordWidth <= right - margin && width + wordWidth > right - margin) flush();
      // Split unusually long words too, so arbitrary form input cannot overflow.
      for (const char of token.text) {
        const charWidth = token.font.widthOfTextAtSize(char, size);
        if (width + charWidth > right - margin) flush();
        if (width === 0 && char === " ") continue;
        const previous = line[line.length - 1];
        if (previous?.font === token.font) previous.text += char;
        else line.push({ text: char, font: token.font });
        width += charWidth;
      }
    }
    if (line.length) flush();
  };
  const text = (value: string, strong = false) => paragraph([[value, strong]]);

  paragraph([[fields.city, true], [", ", false], [fields.day, true], [" de ", false],
    [fields.month, true], [" de ", false], [fields.year, true]], true);
  y -= 24;
  text("Señores", true);
  text("Comité Organizador del Desafío Bebras Bolivia");
  text("Presente.—");
  y -= 16;
  paragraph([["Ref.: Autorización para participar como maestro", true]], true, true);
  y -= 16;
  text("De mi mayor consideración:");
  y -= 16;
  paragraph([
    ["Por medio de la presente, en mi calidad de director(a) de la unidad educativa ", false],
    [fields.school, true], [", autorizo al/a la maestro(a) ", false], [fields.teacher, true],
    [", con cédula de identidad ", false], [fields.id, true],
    [", a representar a nuestra unidad educativa en el Desafío Bebras Bolivia.", false],
  ]);
  y -= 16;
  text("En esa condición podrá registrar a nuestros estudiantes, organizar los grupos de participación y acompañarlos durante el desafío, en las fechas que el comité organizador establezca.");
  y -= 16;
  text("Sin otro particular, saludo a ustedes con las consideraciones más distinguidas.");
  y -= 128;
  if (y < 110) { page = doc.addPage(PageSizes.A4); y = page.getHeight() - 202; }
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 240, y }, thickness: 0.8 });
  y -= 20;
  text(fields.director, true);
  paragraph([["Director(a) de ", false], [fields.schoolSign, true]]);
  return doc.save();
}

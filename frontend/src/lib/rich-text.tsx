import type { ReactNode } from "react";

/**
 * Formato en línea mínimo, al estilo de WhatsApp. No es Markdown completo a
 * propósito: solo lo que hace falta para redactar un enunciado.
 *
 *   *negrita*  **negrita**   _cursiva_   __subrayado__   ~tachado~   `código`
 *
 * Se devuelven nodos de React, nunca HTML: no hay forma de inyectar marcado.
 */
const RULES = [
  { mark: "**", tag: "strong", wordSafe: false },
  { mark: "__", tag: "u", wordSafe: true },
  { mark: "~~", tag: "s", wordSafe: false },
  { mark: "*", tag: "strong", wordSafe: false },
  { mark: "_", tag: "em", wordSafe: true },
  { mark: "~", tag: "s", wordSafe: false },
  { mark: "`", tag: "code", wordSafe: false },
] as const;

const MAX_DEPTH = 4;

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Los delimitadores tienen que abrazar texto: " * " suelto no es negrita. Los
 * guiones bajos además exigen borde de palabra, para no partir nombres como
 * guion_bajo_suelto. Ese borde va en el primer grupo, que existe siempre, así
 * los índices se leen igual en ambos casos (sin lookbehind, que no todos los
 * navegadores admiten).
 */
const MATCHERS = RULES.map((rule) => {
  const mark = escapeForRegExp(rule.mark);
  return {
    ...rule,
    pattern: new RegExp(
      rule.wordSafe
        ? `(^|[^\\w])${mark}(?=\\S)([\\s\\S]*?\\S)${mark}(?!\\w)`
        : `()${mark}(?=\\S)([\\s\\S]*?\\S)${mark}`,
    ),
  };
});

function parse(
  text: string,
  depth: number,
  keyPrefix: string,
  keepMarks: boolean,
): ReactNode[] {
  if (depth >= MAX_DEPTH || !text) {
    return [text];
  }

  let best: {
    index: number;
    length: number;
    inner: string;
    tag: string;
  } | null = null;

  for (const matcher of MATCHERS) {
    const match = matcher.pattern.exec(text);

    // Estrictamente menor: ante el mismo inicio gana el delimitador más largo,
    // que va primero en la lista. Así "**x**" es negrita y no "*" con "*x*".
    if (!match) {
      continue;
    }

    const start = match.index + match[1].length;

    if (best === null || start < best.index) {
      best = {
        index: start,
        length: match[0].length - match[1].length,
        inner: match[2],
        tag: matcher.tag,
      };
    }
  }

  if (!best) {
    return [text];
  }

  const before = text.slice(0, best.index);
  const after = text.slice(best.index + best.length);
  const Tag = best.tag as "strong" | "em" | "u" | "s" | "code";
  // Con los marcadores a la vista el texto conserva su longitud exacta, que es
  // lo que permite superponerlo sobre el textarea sin que se desalinee.
  const mark = keepMarks ? (best.length - best.inner.length) / 2 : 0;
  const marker = keepMarks ? (
    <span className="opacity-40">
      {text.slice(best.index, best.index + mark)}
    </span>
  ) : null;

  // El límite es de anidamiento, no de cantidad: lo que va antes y después son
  // hermanos y siguen al mismo nivel. Terminan igual porque cada trozo es más
  // corto que el anterior.
  return [
    ...(before ? parse(before, depth, `${keyPrefix}b`, keepMarks) : []),
    <Tag key={`${keyPrefix}-${best.index}`}>
      {marker}
      {parse(best.inner, depth + 1, `${keyPrefix}i`, keepMarks)}
      {marker}
    </Tag>,
    ...(after ? parse(after, depth, `${keyPrefix}a`, keepMarks) : []),
  ];
}

export function renderInlineText(text: string): ReactNode {
  return parse(text, 0, "t", false);
}

/**
 * Igual que `renderInlineText`, pero dejando los marcadores a la vista y
 * atenuados. Se usa para el espejo que va detrás del área de edición: al no
 * quitar ningún carácter, cada letra cae en la misma posición que en el
 * textarea y el cursor sigue coincidiendo.
 */
export function renderInlineTextWithMarks(text: string): ReactNode {
  return parse(text, 0, "m", true);
}

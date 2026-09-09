import type { JSONContent } from "@tiptap/core";

/** Document order, including duplicates so author validation can report them. */
export function getTaskBlankIds(document: JSONContent | undefined): string[] {
  const ids: string[] = [];
  function visit(node: JSONContent, depth: number) {
    if (depth > 20) return;
    if (node.type === "taskBlank" && typeof node.attrs?.blankId === "string") {
      ids.push(node.attrs.blankId);
    }
    for (const child of node.content ?? []) visit(child, depth + 1);
  }
  if (document) visit(document, 0);
  return ids;
}

export function hasTaskBlanks(document: JSONContent | undefined): boolean {
  return getTaskBlankIds(document).length > 0;
}

export function clampTaskIndent(value: unknown): number {
  const indent = typeof value === "number" ? value : Number(value);
  return Number.isFinite(indent)
    ? Math.min(8, Math.max(0, Math.trunc(indent)))
    : 0;
}

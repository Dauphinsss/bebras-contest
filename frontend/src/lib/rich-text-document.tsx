import { Fragment, isValidElement, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { renderInlineText } from "@/lib/rich-text";

const legacyMarks: Record<string, string> = {
  strong: "bold",
  em: "italic",
  u: "underline",
  s: "strike",
  code: "code",
};

/** Import existing task text without interpreting arbitrary HTML. */
export function legacyTextToDocument(text: string): JSONContent {
  function convert(
    value: ReactNode,
    marks: { type: string }[] = [],
  ): JSONContent[] {
    if (Array.isArray(value))
      return value.flatMap((node) => convert(node, marks));
    if (typeof value === "string") {
      return value
        .split("\n")
        .flatMap((line, index) => [
          ...(index ? [{ type: "hardBreak" }] : []),
          ...(line ? [{ type: "text", text: line, marks }] : []),
        ]);
    }
    if (isValidElement<{ children?: ReactNode }>(value)) {
      const mark = typeof value.type === "string" && legacyMarks[value.type];
      return convert(
        value.props.children,
        mark ? [...marks, { type: mark }] : marks,
      );
    }
    return [];
  }
  return {
    type: "doc",
    content: [{ type: "paragraph", content: convert(renderInlineText(text)) }],
  };
}

/** Whitelist the supported inline marks; never render stored HTML or attributes. */
export function renderRichTextDocument(document: JSONContent): ReactNode {
  function render(node: JSONContent, key: string, depth = 0): ReactNode {
    if (depth > 20) return null;
    if (node.type === "text") {
      let result: ReactNode = typeof node.text === "string" ? node.text : "";
      for (const mark of node.marks ?? []) {
        switch (mark.type) {
          case "bold":
            result = <strong>{result}</strong>;
            break;
          case "italic":
            result = <em>{result}</em>;
            break;
          case "underline":
            result = <u>{result}</u>;
            break;
          case "strike":
            result = <s>{result}</s>;
            break;
          case "code":
            result = <code>{result}</code>;
            break;
        }
      }
      return <Fragment key={key}>{result}</Fragment>;
    }
    if (node.type === "hardBreak") return <br key={key} />;
    const children = (node.content ?? []).map((child, index) =>
      render(child, `${key}-${index}`, depth + 1),
    );
    return node.type === "paragraph" ? (
      <p key={key}>{children.length ? children : <br />}</p>
    ) : (
      <Fragment key={key}>{children}</Fragment>
    );
  }
  return render(document, "doc");
}

import assert from "node:assert/strict";
import test from "node:test";
import * as backend from "../backend/src/lib/task-answers/assignment-answers";
import * as frontend from "../frontend/src/lib/assignment-answers";

const blank = { type: "taskBlank", attrs: { blankId: "slot" } };
const paragraph = { type: "paragraph", content: [blank] };
const block = {
  type: "text",
  content: "",
  richText: { type: "doc", content: [paragraph] },
};
const config = {
  version: 1,
  options: [{ id: "option", label: "Option", image: null, limit: null }],
  blanks: [{ id: "slot", allowedOptionIds: ["option"] }],
};

test("frontend and backend accept the same visible cloze documents at depth 20", () => {
  let nested: unknown = paragraph;
  for (let i = 0; i < 9; i++) {
    nested = {
      type: i % 2 ? "bulletList" : "orderedList",
      content: [{ type: "listItem", content: [nested] }],
    };
  }
  for (const blocks of [
    [block],
    [{ ...block, type: "challenge" }],
    [{ ...block, richText: { type: "doc", content: [nested] } }],
    [block, { type: "image", content: "", image: { url: "/image.png" } }],
    [block, { metadata: block.richText }],
  ]) {
    for (const contract of [backend, frontend]) {
      assert.deepEqual(contract.collectTaskBlankIds(blocks), ["slot"]);
      assert.deepEqual(contract.parseClozeConfig(config, blocks), config);
    }
  }
});

test("frontend and backend reject hidden and incompatible cloze structures identically", () => {
  let tooDeep: unknown = paragraph;
  for (let i = 0; i < 10; i++) {
    tooDeep = {
      type: "bulletList",
      content: [{ type: "listItem", content: [tooDeep] }],
    };
  }
  const invalidDocuments = [
    [],
    null,
    "document",
    { type: "paragraph", content: [blank] },
    { type: "doc", content: "invalid" },
    { type: "doc", content: [null] },
    { type: "doc", content: [tooDeep] },
    ...["unknown", "image", "text", "hardBreak", "taskBlank"].map((type) => ({
      type: "doc",
      content: [
        {
          type,
          text: "Hidden",
          attrs: { blankId: "slot" },
          content: [paragraph],
        },
      ],
    })),
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [null] }, blank],
        },
      ],
    },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "taskBlank", attrs: { blankId: "__proto__" } }],
        },
      ],
    },
  ];
  const cases = [
    [],
    [block, block],
    ...["image", "unknown", undefined].map((type) => [{ ...block, type }]),
    [{ ...block, content: null }],
    ...invalidDocuments.map((richText) => [{ ...block, richText }]),
  ];
  for (const blocks of cases) {
    let expected: string | undefined;
    for (const contract of [backend, frontend]) {
      assert.throws(
        () => contract.parseClozeConfig(config, blocks),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          expected ??= error.message;
          assert.equal(error.message, expected);
          return true;
        },
      );
    }
  }
});

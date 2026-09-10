import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assignmentAnswerIsCorrect,
  collectTaskBlankIds,
  parseAssignmentKey,
  parseClozeConfig,
  parseGridConfig,
  validateAssignmentAnswer,
} from "./assignment-answers";
import { countFilledBlocks, parseTaskAnswerConfig } from "./config";
import { answerHasResponse } from "./presence";
import { answerIsCorrect } from "./grading";
import { validateTaskAnswer } from "./validation";
import { renderSafeTask } from "./public-task";
import type { PlayTask } from "./types";

const states = [
  { id: "white", label: "Blanca", image: null, limit: null },
  { id: "black", label: "Negra", image: null, limit: null },
];
const grid = parseGridConfig({
  version: 1,
  rows: 1,
  columns: 3,
  cells: ["a", "b", "c"].map((id) => ({ id, label: id })),
  states,
});
const gridKey = {
  version: 1,
  acceptedAssignments: [
    { a: "white", b: "white", c: "black" },
    { a: "black", b: "black", c: "white" },
  ],
};
const blanks = ["first", "second"].map((id) => ({
  id,
  allowedOptionIds: ["white", "black"],
}));
const document = [
  {
    type: "text",
    content: "",
    richText: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: blanks.map(({ id }) => ({
            type: "taskBlank",
            attrs: { blankId: id },
          })),
        },
      ],
    },
  },
];
const cloze = parseClozeConfig(
  { version: 1, options: states, blanks },
  document,
);
const clozeKey = {
  version: 1,
  acceptedAssignments: [
    { first: "white", second: "black" },
    { first: "black", second: "white" },
  ],
};

function task(answerType = "state_grid"): PlayTask {
  return {
    id: "constructed",
    title: "Constructed",
    answerType,
    answerConfig: answerType === "state_grid" ? grid : cloze,
    answerKey: answerType === "state_grid" ? gridKey : clozeKey,
    bodyBlocks: document,
    challengeBlocks: [],
    multipleChoiceOrderMode: "fixed",
    answers: [],
    correctAnswerId: "",
    shortAnswer: "",
    dragDropBackground: null,
    dragDropItems: [],
    dragDropTargets: [],
    dragDropSolutions: [],
    dragDropVersion: 2,
  };
}

test("grid compares the entire ordered configuration and distinguishes white from empty", () => {
  const check = (cells: Record<string, string>) =>
    answerIsCorrect(task(), { version: 1, cells });
  assert.equal(check(gridKey.acceptedAssignments[0]), true);
  assert.equal(check(gridKey.acceptedAssignments[1]), true);
  assert.equal(check({ a: "white", b: "black", c: "black" }), false);
  assert.equal(check({ a: "black", b: "white", c: "white" }), false);
  assert.equal(check({ a: "white", b: "white" }), false);
  assert.equal(check({}), false);
  assert.equal(
    answerHasResponse("state_grid", { version: 1, cells: { a: "white" } }),
    true,
  );
  assert.equal(
    answerHasResponse("state_grid", { version: 1, cells: {} }),
    false,
  );
});

test("partial answers persist while malformed or extra assignments are rejected", () => {
  for (const payload of [
    {},
    { version: 1, cells: {} },
    { version: 1, cells: { a: "white" } },
  ])
    assert.equal(validateTaskAnswer(task(), payload), null);
  for (const payload of [
    null,
    [],
    { version: 2, cells: {} },
    { cells: {} },
    { version: 1, cells: [] },
    { version: 1, cells: { a: null } },
    { version: 1, cells: { extra: "white" } },
    { version: 1, cells: { a: "unknown" } },
    { version: 1, cells: { a: "" } },
    { version: 1, cells: {}, extra: true },
  ]) {
    assert.ok(validateTaskAnswer(task(), payload));
    assert.equal(answerIsCorrect(task(), payload), false);
  }
});

test("inventory limits count repeated states and allow unlimited states", () => {
  const limited = parseGridConfig({
    ...grid,
    states: [{ ...states[0], limit: 1 }, states[1]],
  });
  assert.equal(
    validateAssignmentAnswer(limited, {
      version: 1,
      cells: { a: "white", b: "white" },
    }),
    false,
  );
  assert.equal(
    validateAssignmentAnswer(limited, {
      version: 1,
      cells: { a: "white", b: "black", c: "black" },
    }),
    true,
  );
  assert.throws(() => parseAssignmentKey(gridKey, limited));
  const unavailable = parseGridConfig({
    ...grid,
    states: [{ ...states[0], limit: 0 }, states[1]],
  });
  assert.equal(
    validateAssignmentAnswer(unavailable, {
      version: 1,
      cells: { a: "white" },
    }),
    false,
  );
});

test("cloze accepts alternatives as whole maps, not mixed answers", () => {
  for (const blanks of clozeKey.acceptedAssignments)
    assert.equal(
      answerIsCorrect(task("text_cloze"), { version: 1, blanks }),
      true,
    );
  assert.equal(
    answerIsCorrect(task("text_cloze"), {
      version: 1,
      blanks: { first: "white", second: "white" },
    }),
    false,
  );
  assert.equal(
    validateTaskAnswer(task("text_cloze"), {
      version: 1,
      blanks: { first: "white" },
    }),
    null,
  );
  assert.equal(
    answerHasResponse("text_cloze", { version: 1, blanks: { first: "white" } }),
    true,
  );
  assert.equal(
    answerHasResponse("text_cloze", { version: 1, blanks: {} }),
    false,
  );
  const restricted = parseClozeConfig({
    ...cloze,
    blanks: [
      { id: "first", allowedOptionIds: ["white"] },
      { id: "second", allowedOptionIds: ["black"] },
    ],
  });
  assert.equal(
    validateAssignmentAnswer(restricted, {
      version: 1,
      blanks: { first: "black" },
    }),
    false,
  );
  assert.throws(() => parseAssignmentKey(clozeKey, restricted));
});

test("cloze locations come solely from document nodes and survive blank-only blocks", () => {
  assert.deepEqual(collectTaskBlankIds(document), ["first", "second"]);
  assert.equal(countFilledBlocks(document), 1);
  assert.deepEqual(parseClozeConfig(cloze, document), cloze);
  assert.throws(() => parseClozeConfig(cloze, []));
  assert.throws(() => parseClozeConfig(cloze, [...document, ...document]));
  assert.throws(() =>
    parseClozeConfig({ ...cloze, blanks: [blanks[0]] }, document),
  );
  assert.deepEqual(
    collectTaskBlankIds([
      { content: "taskBlank", metadata: document[0].richText },
    ]),
    [],
  );
});

test("configuration rejects ambiguous IDs, dimensions, options, and quantities", () => {
  for (const change of [
    { version: 2 },
    { rows: 0 },
    { columns: 1.5 },
    { cells: [grid.cells[0]] },
    { cells: [grid.cells[0], grid.cells[0], grid.cells[2]] },
    { states: [states[0], states[0]] },
    { states: [{ ...states[0], limit: -1 }] },
    { states: [{ ...states[0], limit: 1.5 }] },
    { states: [{ ...states[0], limit: "2" }] },
    { states: [{ ...states[0], id: "__proto__" }] },
    {
      states: [
        { ...states[0], image: { id: "image", name: "image", url: "" } },
      ],
    },
  ])
    assert.throws(() => parseGridConfig({ ...grid, ...change }));
  for (const change of [
    { blanks: [blanks[0], blanks[0]] },
    { blanks: [{ id: "first", allowedOptionIds: [] }] },
    { blanks: [{ id: "first", allowedOptionIds: ["unknown"] }] },
    { blanks: [{ id: "first", allowedOptionIds: ["white", "white"] }] },
  ])
    assert.throws(() => parseClozeConfig({ ...cloze, ...change }));
});

test("private solutions must be complete, unique, and use known slots", () => {
  for (const assignments of [
    [],
    [{ a: "white" }],
    [{ ...gridKey.acceptedAssignments[0], extra: "white" }],
    [gridKey.acceptedAssignments[0], { c: "black", b: "white", a: "white" }],
  ])
    assert.throws(() =>
      parseAssignmentKey(
        { version: 1, acceptedAssignments: assignments },
        grid,
      ),
    );
  assert.equal(
    assignmentAnswerIsCorrect(
      grid,
      { version: 1, acceptedAssignments: [{}] },
      { version: 1, cells: gridKey.acceptedAssignments[0] },
    ),
    false,
  );
});

test("author configuration and public projection preserve content but never expose solution metadata", () => {
  for (const answerType of ["state_grid", "text_cloze"]) {
    const authored = task(answerType);
    const parsed = parseTaskAnswerConfig(
      authored as unknown as Record<string, unknown>,
    );
    assert.deepEqual(JSON.parse(parsed.answerConfig), authored.answerConfig);
    assert.deepEqual(JSON.parse(parsed.answerKey), authored.answerKey);
    const publicTask = renderSafeTask(
      { position: 1 },
      {
        ...authored,
        answerConfig: {
          ...authored.answerConfig,
          answerKey: "secret",
          acceptedAssignments: "secret",
        },
      },
    );
    assert.deepEqual(publicTask.answerConfig, authored.answerConfig);
    assert.equal(Object.hasOwn(publicTask, "answerKey"), false);
    assert.equal(JSON.stringify(publicTask).includes("secret"), false);
  }
});

test("public rich text preserves indent and strips answer metadata from inline blanks", () => {
  const richText = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { indent: 2 },
        content: [
          {
            type: "taskBlank",
            attrs: { blankId: "first", correctOptionId: "secret" },
            text: "secret",
            content: [{ type: "text", text: "secret" }],
          },
        ],
      },
      { type: "paragraph", attrs: { indent: 999 }, content: [] },
    ],
  };
  const safe = renderSafeTask(
    { position: 1 },
    { ...task("text_cloze"), bodyBlocks: [{ richText }] },
  );
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.deepEqual(safe.bodyBlocks, [
    {
      richText: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { indent: 2 },
            content: [{ type: "taskBlank", attrs: { blankId: "first" } }],
          },
          { type: "paragraph", attrs: { indent: 8 }, content: [] },
        ],
      },
    },
  ]);
  assert.equal(richText.content[0].content[0].attrs.correctOptionId, "secret");
});

test("cloze rejects hidden, malformed and over-depth documents before saving", () => {
  const block = document[0];
  for (const change of [
    { type: "image", image: { url: "/image.png" } },
    { type: "unknown" },
    { type: undefined },
    { content: null },
    { richText: [] },
    { richText: { type: "paragraph", content: block.richText.content } },
    { richText: { type: "doc", content: "invalid" } },
    { richText: { type: "doc", content: [null] } },
    {
      richText: {
        type: "doc",
        content: [{ type: "unknown", content: block.richText.content }],
      },
    },
    {
      richText: {
        type: "doc",
        content: [
          { type: "text", text: "hidden", content: block.richText.content },
        ],
      },
    },
    {
      richText: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [null] }],
          },
        ],
      },
    },
  ])
    assert.throws(() => parseClozeConfig(cloze, [{ ...block, ...change }]));

  // Root is depth 0, matching renderRichTextDocument.
  let nested: unknown = block.richText.content[0];
  for (let i = 0; i < 6; i++)
    nested = {
      type: "bulletList",
      content: [{ type: "listItem", content: [nested] }],
    };
  // Each list adds two levels: add three more to reach depth 20.
  for (let i = 0; i < 3; i++)
    nested = {
      type: "orderedList",
      content: [{ type: "listItem", content: [nested] }],
    };
  const atLimit = { ...block, richText: { type: "doc", content: [nested] } };
  assert.deepEqual(collectTaskBlankIds([atLimit]), ["first", "second"]);
  assert.throws(() =>
    collectTaskBlankIds([
      {
        ...block,
        richText: {
          type: "doc",
          content: [
            {
              type: "bulletList",
              content: [{ type: "listItem", content: [nested] }],
            },
          ],
        },
      },
    ]),
  );
  assert.deepEqual(
    collectTaskBlankIds([
      { type: "image", content: "", image: { url: "/x.png" } },
    ]),
    [],
  );
});

test("public documents whitelist metadata at every level without mutating rich content", () => {
  const secret = {
    answerKey: "PRIVATE_SENTINEL",
    correctOptionId: "PRIVATE_SENTINEL",
  };
  const richText = {
    type: "doc",
    ...secret,
    attrs: secret,
    content: [
      {
        type: "paragraph",
        ...secret,
        attrs: { indent: 3, ...secret },
        content: [
          {
            type: "text",
            text: "Visible",
            ...secret,
            attrs: secret,
            marks: [
              ...["bold", "italic", "underline", "strike", "code"].map(
                (type) => ({ type, ...secret, attrs: secret }),
              ),
              {
                type: "link",
                ...secret,
                attrs: {
                  href: "https://example.org",
                  target: "_blank",
                  rel: "noopener",
                  title: "Link",
                  ...secret,
                },
              },
              { type: "private", attrs: secret },
            ],
          },
          { type: "hardBreak", ...secret },
          {
            type: "image",
            attrs: { src: "/image.png", alt: "Image", width: 120, ...secret },
            ...secret,
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 4, ...secret },
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      },
      {
        type: "table",
        attrs: secret,
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: {
                  colspan: 2,
                  rowspan: 1,
                  colwidth: [100, 120],
                  ...secret,
                },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
      { type: "private", text: "PRIVATE_SENTINEL" },
    ],
  };
  const blocks = [{ type: "text", content: "Visible", richText }];
  const safe = renderSafeTask(
    { position: 1 },
    {
      ...task(),
      bodyBlocks: blocks,
      challengeBlocks: blocks,
      answers: [{ id: "A", blocks }],
    },
  );
  const json = JSON.stringify(safe);
  assert.equal(json.includes("PRIVATE_SENTINEL"), false);
  for (const expected of [
    "Visible",
    "https://example.org",
    "/image.png",
    '"colwidth":[100,120]',
    '"start":4',
    '"indent":3',
    '"type":"bold"',
    '"type":"table"',
  ])
    assert.ok(json.includes(expected), expected);
  assert.ok(JSON.stringify(richText).includes("PRIVATE_SENTINEL"));
});

test("drag-drop authoring requires real image records for both background and pieces", () => {
  const image = { id: "image", name: "Image", url: "/uploads/image.png" };
  const item = {
    id: "piece",
    label: "Piece",
    image,
    correctTargetId: "target",
    widthPercent: 12,
  };
  const body = {
    answerType: "drag_drop",
    dragDropBackground: image,
    dragDropItems: [item],
    dragDropTargets: [{ id: "target", x: 50, y: 50, snapRadius: 10 }],
  };
  for (const invalid of [
    null,
    {},
    [],
    true,
    "text",
    { ...image, id: "" },
    { ...image, name: 1 },
    { ...image, url: "" },
    { ...image, url: "not a URL" },
    { ...image, url: "javascript:alert(1)" },
    { ...image, url: "data:text/html;base64,WA==" },
    { ...image, url: "//evil.example/x" },
  ]) {
    assert.throws(() =>
      parseTaskAnswerConfig({ ...body, dragDropBackground: invalid }),
    );
    assert.throws(() =>
      parseTaskAnswerConfig({
        ...body,
        dragDropItems: [{ ...item, image: invalid }],
      }),
    );
  }
  for (const url of [
    image.url,
    "https://example.org/image.png",
    "http://localhost:3001/image.png",
    "data:image/png;base64,aGVsbG8=",
  ])
    assert.doesNotThrow(() =>
      parseTaskAnswerConfig({
        ...body,
        dragDropBackground: { ...image, url },
        dragDropItems: [{ ...item, image: { ...image, url } }],
      }),
    );
});

test("drag-drop accepts percent-encoded SVG fixtures and preserves their public URLs", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#ef4444"/></svg>';
  const urls = [
    `data:image/svg+xml,${encodeURIComponent(svg)}`,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60' viewBox='0 0 80 60'%3E%3Crect width='80' height='60' fill='%23ef4444'/%3E%3C/svg%3E",
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    "https://example.org/image%20name.svg?size=80&color=%23ef4444",
    "/uploads/image%20name.svg",
  ];
  for (const url of urls) {
    const image = { id: "image", name: "Image", url };
    const item = {
      id: "piece",
      label: "Piece",
      image,
      widthPercent: 12,
      correctTargetId: "target",
    };
    const body = {
      answerType: "drag_drop",
      dragDropBackground: image,
      dragDropItems: [item],
      dragDropTargets: [{ id: "target", x: 50, y: 50, snapRadius: 10 }],
    };
    const parsed = parseTaskAnswerConfig(body);
    assert.deepEqual(JSON.parse(parsed.dragDropBackground), image);
    assert.deepEqual(JSON.parse(parsed.dragDropItems).items[0].image, image);
    const safe = renderSafeTask(
      { position: 1 },
      {
        ...task("drag_drop"),
        answerConfig: {},
        dragDropBackground: { ...image, answerKey: "PRIVATE_SENTINEL" },
        dragDropItems: [
          { ...item, image: { ...image, answerKey: "PRIVATE_SENTINEL" } },
        ],
      },
    );
    assert.deepEqual(safe.dragDropBackground, image);
    assert.deepEqual(safe.dragDropItems[0].image, image);
    assert.equal(JSON.stringify(safe).includes("PRIVATE_SENTINEL"), false);
    for (const invalid of [
      {},
      { ...image, id: "" },
      { ...image, name: "" },
      { ...image, url: "data:image/svg+xml," },
      { ...image, url: "data:image/svg+xml,%ZZ" },
      { ...image, url: "data:image/svg+xml,%20" },
      { ...image, url: "data:text/html,%3Csvg/%3E" },
      { ...image, url: "javascript:alert(1)" },
    ]) {
      assert.throws(() =>
        parseTaskAnswerConfig({ ...body, dragDropBackground: invalid }),
      );
      assert.throws(() =>
        parseTaskAnswerConfig({
          ...body,
          dragDropItems: [{ ...item, image: invalid }],
        }),
      );
    }
  }
});

test("public blocks and image records cannot carry private metadata", () => {
  const image = { id: "image", name: "Image", url: "/image.png" };
  const privateImage = { ...image, answerKey: "PRIVATE_SENTINEL" };
  const block = {
    id: "block",
    type: "image",
    content: "",
    widthPercent: 75,
    image: privateImage,
    acceptedAssignments: "PRIVATE_SENTINEL",
  };
  const safe = renderSafeTask(
    { position: 1 },
    {
      ...task(),
      bodyBlocks: [block],
      challengeBlocks: [block],
      answers: [{ id: "A", blocks: [block] }],
      dragDropBackground: privateImage,
      dragDropItems: [
        {
          id: "piece",
          label: "Piece",
          widthPercent: 12,
          image: privateImage,
          correctTargetId: "PRIVATE_SENTINEL",
          equivalenceKey: "PRIVATE_SENTINEL",
        },
      ],
    },
  );
  assert.equal(JSON.stringify(safe).includes("PRIVATE_SENTINEL"), false);
  assert.deepEqual(safe.bodyBlocks, [
    { id: "block", type: "image", content: "", widthPercent: 75, image },
  ]);
  assert.deepEqual(safe.dragDropBackground, image);
  assert.deepEqual(safe.dragDropItems[0].image, image);
});

test("public projection stops at renderer depth and discards malformed nodes and marks", () => {
  let nested: unknown = { type: "text", text: "PRIVATE_SENTINEL" };
  for (let i = 0; i < 21; i++)
    nested = { type: "paragraph", content: [nested] };
  const safe = renderSafeTask(
    { position: 1 },
    {
      ...task(),
      bodyBlocks: [
        {
          richText: {
            type: "doc",
            content: [
              nested,
              null,
              [],
              "PRIVATE_SENTINEL",
              {
                type: "text",
                text: "Visible",
                marks: [
                  null,
                  [],
                  "PRIVATE_SENTINEL",
                  { type: "bold", attrs: { answer: "PRIVATE_SENTINEL" } },
                ],
              },
              {
                type: "orderedList",
                attrs: { start: { answer: "PRIVATE_SENTINEL" } },
              },
            ],
          },
        },
      ],
    },
  );
  assert.equal(JSON.stringify(safe).includes("PRIVATE_SENTINEL"), false);
  assert.ok(JSON.stringify(safe).includes("Visible"));
});

test("public practice route rejects invalid payloads with 400 before grading or explanations", async () => {
  // Exercise the actual route without booting the application, database or a server.
  const source = readFileSync(resolve(__dirname, "../../index.ts"), "utf8");
  const route = source.slice(
    source.indexOf('app.post("/api/practice/tasks/:id/check"'),
    source.indexOf("// Banco de tareas, desafíos"),
  );
  type Response = {
    status: (code: number) => Response;
    json: (body: unknown) => void;
  };
  let handler!: (req: unknown, res: Response) => Promise<void>;
  let graded = 0;
  let found = true;
  new Function(
    "app",
    "prisma",
    "deserializeTask",
    "validateTaskAnswer",
    "answerIsCorrect",
    route,
  )(
    {
      post: (_path: string, callback: typeof handler) => {
        handler = callback;
      },
    },
    { taskDraft: { findFirst: async () => (found ? task() : null) } },
    (value: unknown) => value,
    validateTaskAnswer,
    (value: PlayTask, payload: unknown) => {
      graded++;
      return answerIsCorrect(value, payload);
    },
  );
  for (const payload of [
    undefined,
    null,
    [],
    { version: 2, cells: {} },
    { version: 1, cells: { unknown: "white" } },
  ]) {
    let status = 200;
    let body: unknown;
    const res: Response = {
      status: (code) => {
        status = code;
        return res;
      },
      json: (value) => {
        body = value;
      },
    };
    await handler({ params: { id: "constructed" }, body: { payload } }, res);
    assert.equal(status, 400);
    assert.deepEqual(body, { message: validateTaskAnswer(task(), payload) });
  }
  assert.equal(graded, 0);
  for (const payload of [
    {},
    { version: 1, cells: { a: "white" } },
    { version: 1, cells: gridKey.acceptedAssignments[0] },
  ]) {
    const res: Response = {
      status: () => {
        assert.fail("Expected 200");
      },
      json: (value) => {
        assert.equal(
          (value as { correct: boolean }).correct,
          answerIsCorrect(task(), payload),
        );
      },
    };
    await handler({ params: { id: "constructed" }, body: { payload } }, res);
  }
  assert.equal(graded, 3);
  found = false;
  const res: Response = {
    status: (code) => {
      assert.equal(code, 404);
      return res;
    },
    json: () => {},
  };
  await handler({ params: { id: "missing" }, body: {} }, res);
  assert.equal(graded, 3);
});

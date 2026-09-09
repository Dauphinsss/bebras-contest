import assert from "node:assert/strict";
import test from "node:test";
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
    rangeMin: null,
    rangeMax: null,
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

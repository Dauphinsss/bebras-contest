import assert from "node:assert/strict";
import { test } from "node:test";
import { answerHasResponse } from "../backend/src/lib/task-answers/presence";
import { answerHasResponse as clientPresence } from "../frontend/src/lib/answer-presence";
import { answerIsCorrect } from "../backend/src/lib/task-answers/grading";
import { validateTaskAnswer } from "../backend/src/lib/task-answers/validation";
import { renderSafeTask } from "../backend/src/lib/task-answers/public-task";
import {
  normalizeDragDropConfig,
  parseTaskAnswerConfig,
} from "../backend/src/lib/task-answers/config";
import type { PlayTask } from "../backend/src/lib/task-answers/types";

const base: PlayTask = {
  id: "task",
  title: "Task",
  bodyBlocks: [],
  challengeBlocks: [],
  answerType: "multiple_choice",
  multipleChoiceOrderMode: "fixed",
  answers: [
    { id: "A", blocks: [] },
    { id: "B", blocks: [] },
  ],
  correctAnswerId: "single:B",
  shortAnswer: "Bebras",
  dragDropBackground: null,
  dragDropItems: [],
  dragDropTargets: [],
  dragDropSolutions: [],
  dragDropVersion: 2,
};

test("client and server agree about absent, partial and started responses", () => {
  const cases: [string, unknown, boolean][] = [
    ["multiple_choice", {}, false],
    ["multiple_choice", { selected: [] }, false],
    ["multiple_choice", { selected: ["B"] }, true],
    ["short_text", { text: "   " }, false],
    ["short_text", { text: " A " }, true],
    ["drag_drop", { placements: {} }, false],
    ["drag_drop", { placements: [] }, false],
    ["drag_drop", { placements: { a: "one" } }, true],
    ["future_type", {}, false],
  ];
  for (const type of ["multiple_choice", "short_text", "drag_drop"]) {
    for (const payload of [null, undefined, [], "value"])
      cases.push([type, payload, false]);
  }
  for (const [type, payload, expected] of cases) {
    assert.equal(answerHasResponse(type, payload), expected);
    assert.equal(clientPresence(type, payload), expected);
  }
});

test("existing single/any/all and text correction stay consistent", () => {
  assert.equal(answerIsCorrect(base, { selected: ["B"] }), true);
  assert.equal(answerIsCorrect(base, { selected: ["A", "B"] }), false);
  assert.equal(
    answerIsCorrect(
      { ...base, correctAnswerId: "any:A,B" },
      { selected: ["A"] },
    ),
    true,
  );
  const all = { ...base, correctAnswerId: "all:A,B" };
  assert.equal(answerIsCorrect(all, { selected: ["B", "A"] }), true);
  assert.equal(answerIsCorrect(all, { selected: ["B"] }), false);
  assert.equal(answerIsCorrect(all, { selected: ["A", "A"] }), false);
  assert.equal(
    answerIsCorrect(
      { ...base, answerType: "short_text" },
      { text: " BEBRAS " },
    ),
    true,
  );
});

test("payload validation allows empty/partial answers and rejects invalid shapes and IDs", () => {
  assert.equal(validateTaskAnswer(base, { selected: [] }), null);
  assert.equal(validateTaskAnswer(base, { selected: ["A"] }), null);
  for (const payload of [
    [],
    null,
    { selected: ["X"] },
    { selected: ["A", "A"] },
    { selected: "A" },
  ])
    assert.ok(validateTaskAnswer(base, payload));
  assert.equal(
    validateTaskAnswer({ ...base, answerType: "short_text" }, { text: "" }),
    null,
  );
  assert.ok(
    validateTaskAnswer({ ...base, answerType: "short_text" }, { text: 2 }),
  );
});

test("legacy coordinate responses still grade while v2 requires destination IDs", () => {
  const config = normalizeDragDropConfig([
    { id: "piece", label: "A", targetX: 20, targetY: 40, tolerance: 8 },
  ]);
  const task = {
    ...base,
    answerType: "drag_drop",
    dragDropVersion: config.version,
    dragDropItems: config.items,
    dragDropTargets: config.targets,
  };
  const coordinates = { placements: { piece: { x: 21, y: 40 } } };
  assert.equal(answerIsCorrect(task, coordinates), true);
  assert.equal(
    answerIsCorrect({ ...task, dragDropVersion: 2 }, coordinates),
    false,
  );
  assert.equal(validateTaskAnswer(task, { placements: {} }), null);
  assert.equal(answerIsCorrect(task, { placements: {} }), false);
});

test("public task is an allowlist; private keys and author fields cannot escape", () => {
  const task = {
    ...base,
    answerConfig: { correctAnswer: "SECRET" },
    answerKey: { solution: "SECRET" },
    answers: [{ id: "B", blocks: [], isCorrect: true }],
    dragDropItems: [
      {
        id: "piece",
        label: "A",
        image: null,
        widthPercent: 12,
        correctTargetId: "SECRET",
        equivalenceKey: "SECRET",
      },
    ],
  };
  const safe = renderSafeTask({ position: 1 }, task);
  for (const key of [
    "answerKey",
    "correctAnswerId",
    "shortAnswer",
    "dragDropSolutions",
  ])
    assert.equal(key in safe, false);
  assert.equal(JSON.stringify(safe).includes("SECRET"), false);
  assert.deepEqual(safe.answerConfig, { multipleChoiceLayout: "vertical" });
  assert.equal("isCorrect" in safe.answers[0], false);
});

test("new storage fields default to empty objects and unsupported configs are rejected", () => {
  const input = { answerType: "short_text", shortAnswer: "Bebras" };
  const parsed = parseTaskAnswerConfig(input);
  assert.equal(parsed.answerConfig, "{}");
  assert.equal(parsed.answerKey, "{}");
  assert.deepEqual(
    parseTaskAnswerConfig({ ...input, answerConfig: {}, answerKey: {} }),
    parsed,
  );
  for (const value of [null, [], "{}", { version: 1 }]) {
    assert.throws(() =>
      parseTaskAnswerConfig({ ...input, answerConfig: value }),
    );
    assert.throws(() => parseTaskAnswerConfig({ ...input, answerKey: value }));
  }
});

test("multiple choice keeps its layout in answerConfig and rejects anything else", () => {
  const input = {
    answerType: "multiple_choice",
    answers: [
      { id: "A", blocks: [{ id: "a", type: "text", content: "Sí" }] },
      { id: "B", blocks: [{ id: "b", type: "text", content: "No" }] },
    ],
    correctAnswerId: "single:B",
  };
  assert.equal(
    parseTaskAnswerConfig(input).answerConfig,
    JSON.stringify({ multipleChoiceLayout: "vertical" }),
  );
  assert.equal(
    parseTaskAnswerConfig({
      ...input,
      answerConfig: { multipleChoiceLayout: "horizontal" },
    }).answerConfig,
    JSON.stringify({ multipleChoiceLayout: "horizontal" }),
  );
  for (const value of [null, [], "{}", { secret: "solution" }]) {
    assert.throws(() =>
      parseTaskAnswerConfig({ ...input, answerConfig: value }),
    );
  }
  assert.deepEqual(
    renderSafeTask(
      { position: 1 },
      { ...base, answerConfig: { multipleChoiceLayout: "horizontal" } },
    ).answerConfig,
    { multipleChoiceLayout: "horizontal" },
  );
});

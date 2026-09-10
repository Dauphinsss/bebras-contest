import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import {
  blankRemovalImpact,
  dragRemovalImpact,
  duplicateSolutions,
  editingSolutions,
  intersectingTargets,
  nextTargetPosition,
  pieceGeometryWarnings,
  summarizeAuthoringWarnings,
  targetSizeWarnings,
} from "../frontend/src/lib/authoring";

test("piece geometry measures tall images and checks the selected solution, not only width", () => {
  const piece = {
    id: "a",
    label: "A",
    image: { id: "image", name: "tall.png", url: "/tall.png" },
    widthPercent: 10,
    correctTargetId: "edge",
  };
  const targets = [
    { id: "edge", x: 50, y: 10, snapRadius: 1 },
    { id: "center", x: 50, y: 50, snapRadius: 1 },
  ];
  const sizes = { "/tall.png": { width: 100, height: 400 } };
  expectWarnings({ a: "edge" }, ["Pieza 1: sobrepasa el fondo"]);
  expectWarnings({ a: "center" }, []);
  function expectWarnings(
    placements: Record<string, string>,
    expected: string[],
  ) {
    assert.deepEqual(
      pieceGeometryWarnings(
        [piece],
        targets,
        placements,
        { width: 800, height: 500 },
        sizes,
      ).warnings,
      expected,
    );
  }
});

test("piece geometry distinguishes touching from overlapping and excludes its own target", () => {
  const pieces = ["a", "b"].map((id) => ({
    id,
    label: id,
    image: { id, name: id, url: `/${id}` },
    widthPercent: 20,
    correctTargetId: id,
  }));
  const targets = [
    { id: "a", x: 30, y: 50, snapRadius: 1 },
    { id: "b", x: 50, y: 50, snapRadius: 1 },
  ];
  const sizes = {
    "/a": { width: 100, height: 100 },
    "/b": { width: 100, height: 100 },
  };
  const placements = { a: "a", b: "b" };
  assert.deepEqual(
    pieceGeometryWarnings(
      pieces,
      targets,
      placements,
      { width: 1000, height: 500 },
      sizes,
    ).warnings,
    [],
  );
  const overlapping = targets.map((t) => (t.id === "b" ? { ...t, x: 35 } : t));
  assert.deepEqual(
    pieceGeometryWarnings(
      pieces,
      overlapping,
      placements,
      { width: 1000, height: 500 },
      sizes,
    ).warnings,
    [
      "Piezas 1 y 2: se superponen",
      "Pieza 1: cubre el centro del destino 2",
      "Pieza 2: cubre el centro del destino 1",
    ],
  );
});

test("unknown, failed and replaced image dimensions never invent piece bounds", () => {
  const piece = {
    id: "a",
    label: "A",
    image: { id: "a", name: "new.png", url: "/new" },
    widthPercent: 90,
    correctTargetId: "a",
  };
  const targets = [{ id: "a", x: 0, y: 0, snapRadius: 1 }];
  const background = { width: 800, height: 500 };
  assert.deepEqual(
    pieceGeometryWarnings([piece], targets, { a: "a" }, background, {
      "/old": background,
    }),
    { warnings: [], unmeasured: 1 },
  );
  assert.deepEqual(
    pieceGeometryWarnings([piece], targets, { a: "a" }, undefined, {
      "/new": background,
    }),
    { warnings: [], unmeasured: 1 },
  );
  assert.deepEqual(
    pieceGeometryWarnings([piece], targets, {}, background, {}),
    { warnings: [], unmeasured: 0 },
  );
  assert.deepEqual(
    pieceGeometryWarnings([piece], targets, { a: "a" }, background, {
      "/new": { width: 0, height: 100 },
    }),
    { warnings: [], unmeasured: 1 },
  );
});

test("administrative warnings cap their detail while preserving the remaining count", () => {
  assert.equal(
    summarizeAuthoringWarnings(["a", "b", "c", "d", "e"]),
    "a; b; c; y 2 avisos más",
  );
  assert.equal(summarizeAuthoringWarnings([]), "");
});
import {
  blankGuard,
  blankGuardKey,
} from "../frontend/src/lib/authoring-blank-guard";
import { TaskBlank } from "../frontend/src/lib/task-blank-extension";
import { getTaskBlankIds } from "../frontend/src/lib/task-blank";

const items = [
  {
    id: "a",
    label: "A",
    image: null,
    widthPercent: 10,
    correctTargetId: "one",
  },
  {
    id: "b",
    label: "B",
    image: null,
    widthPercent: 10,
    correctTargetId: "two",
  },
];
test("uniform editing solutions preserve persistence and detect equivalent copies", () => {
  const alternative = { id: "alt", placements: { a: "two", b: "one" } };
  const model = editingSolutions(items, [alternative]);
  assert.deepEqual(
    model.map((s) => s.name),
    ["Principal", "Alterna 1"],
  );
  assert.deepEqual(duplicateSolutions(items, model), []);
  const copy = { id: "copy", placements: { ...model[1].placements } };
  assert.deepEqual(
    duplicateSolutions(items, editingSolutions(items, [alternative, copy])),
    ["Alterna 2: igual a Alterna 1"],
  );
  copy.placements.a = "three";
  assert.equal(alternative.placements.a, "two");
  assert.equal(items[0].correctTargetId, "one");
  const equivalent = items.map((item) => ({ ...item, equivalenceKey: "same" }));
  assert.equal(
    duplicateSolutions(equivalent, editingSolutions(equivalent, [alternative]))
      .length,
    1,
  );
});

test("new targets do not stack, including beyond the initial grid", () => {
  const targets = [{ x: 50, y: 50 }];
  for (let i = 0; i < 70; i++) {
    const next = nextTargetPosition(targets);
    assert.ok(!targets.some((t) => t.x === next.x && t.y === next.y));
    assert.ok(next.x >= 10 && next.x <= 90 && next.y >= 10 && next.y <= 90);
    targets.push(next);
  }
});

test("intersection uses the smaller image dimension, not the touch handle or percentage distance", () => {
  const targets = [
    { id: "a", x: 10, y: 50, snapRadius: 5 },
    { id: "b", x: 19, y: 50, snapRadius: 5 },
  ];
  assert.deepEqual(intersectingTargets(targets, 1000, 100), []);
  assert.deepEqual(intersectingTargets(targets, 100, 1000), ["1 y 2"]);
  assert.deepEqual(intersectingTargets(targets, 0, 0), []);
  assert.deepEqual(
    intersectingTargets(
      targets.map((t) => ({ ...t, snapRadius: 0.1 })),
      100,
      100,
    ),
    [],
  );
});

test("blank impact counts each affected solution once and ignores unused blanks", () => {
  assert.deepEqual(
    blankRemovalImpact(
      ["a", "b"],
      [{ a: "x", b: "y" }, { c: "x" }, { a: "z" }],
    ),
    [1, 3],
  );
  assert.deepEqual(blankRemovalImpact(["unused"], [{ a: "x" }]), []);
});

test("drag removal impact includes principal and alternatives but ignores unused targets", () => {
  const model = editingSolutions(items, [
    { id: "alt", placements: { a: "three" } },
  ]);
  assert.deepEqual(
    dragRemovalImpact(model, "pieza", "a").map((s) => s.id),
    ["primary", "alt"],
  );
  assert.deepEqual(
    dragRemovalImpact(model, "destino", "one").map((s) => s.id),
    ["primary"],
  );
  assert.deepEqual(dragRemovalImpact(model, "destino", "unused"), []);
});

test("size warnings use real radius and remain advisory", () => {
  assert.deepEqual(
    targetSizeWarnings([{ id: "a", x: 50, y: 50, snapRadius: 10 }], 1000, 200),
    [],
  );
  assert.equal(
    targetSizeWarnings([{ id: "a", x: 50, y: 50, snapRadius: 10 }], 100, 200)
      .length,
    1,
  );
  const oversized = [{ id: "a", x: 99, y: 50, snapRadius: 40 }];
  assert.equal(targetSizeWarnings(oversized, 1000, 200).length, 2);
  assert.equal(oversized[0].snapRadius, 40);
});

const requireFrontend = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { getSchema } = requireFrontend("@tiptap/core");
const { default: StarterKit } = requireFrontend("@tiptap/starter-kit");
const { EditorState } = requireFrontend("@tiptap/pm/state");
const { history, undo, redo } = requireFrontend("@tiptap/pm/history");

test("blank deletion cancels without editing, confirms as one native undo step, and redo needs no confirmation", () => {
  const schema = getSchema([StarterKit, TaskBlank]);
  let requests = 0;
  let pending;
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(null, [
        schema.nodes.taskBlank.create({ blankId: "used" }),
        schema.nodes.taskBlank.create({ blankId: "unused" }),
      ]),
    ),
    plugins: [
      history(),
      blankGuard((ids, transaction) => {
        if (!ids.includes("used")) return false;
        requests++;
        pending = transaction;
        return true;
      }),
    ],
  });
  const dispatch = (transaction) => {
    state = state.applyTransaction(transaction).state;
  };
  dispatch(state.tr.delete(1, 2));
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ["used", "unused"]);
  assert.equal(undo(state, dispatch), false);
  dispatch(pending.setMeta(blankGuardKey, true));
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ["unused"]);
  assert.equal(undo(state, dispatch), true);
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ["used", "unused"]);
  assert.equal(redo(state, dispatch), true);
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), ["unused"]);
  assert.equal(requests, 1);
  dispatch(state.tr.delete(1, 2));
  assert.deepEqual(getTaskBlankIds(state.doc.toJSON()), []);
  assert.equal(requests, 1);
});

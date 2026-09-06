import assert from "node:assert/strict";
import { test } from "node:test";
import { seedDragDropConfig } from "./seed-drag-drop";

test("repeated seed serialization retains alternatives, equivalent pieces and unused targets", () => {
  const task = {
    dragDropItems: [{ id: "b", equivalenceKey: "B", correctTargetId: "first" }],
    dragDropTargets: [{ id: "first" }, { id: "second" }, { id: "unused" }],
    dragDropSolutions: [{ id: "alternate", placements: { b: "second" } }],
  };
  const expected = {
    version: 2,
    items: task.dragDropItems,
    targets: task.dragDropTargets,
    solutions: task.dragDropSolutions,
  };
  for (let execution = 0; execution < 2; execution++) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(seedDragDropConfig(task))),
      expected,
    );
  }
  assert.deepEqual(seedDragDropConfig({ dragDropItems: expected }), expected);
  const legacy = [{ id: "legacy", targetX: 15, targetY: 20 }];
  assert.deepEqual(seedDragDropConfig({ dragDropItems: legacy }), legacy);
});

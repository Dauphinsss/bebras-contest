import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findTargetAtPoint,
  getSnapCircleStyle,
  getSnapRadius,
  isPointOutsideStage,
} from "../frontend/src/components/drag-drop-player-geometry";

for (const [size, width, height] of [
  ["mobile", 320, 180],
  ["desktop", 768, 432],
  ["portrait", 320, 560],
] as const) {
  const stage = { left: 37, top: 113, width, height };

  for (const [edge, x, y, dx, dy] of [
    ["left", 0, 50, -1, 0],
    ["right", 100, 50, 1, 0],
    ["top", 50, 0, 0, -1],
    ["bottom", 50, 100, 0, 1],
  ] as const) {
    test(`${size}: outside ${edge} takes precedence over an overlapping snap radius`, () => {
      const target = { id: edge, x, y, snapRadius: 8 };
      const clientX = stage.left + (x / 100) * width;
      const clientY = stage.top + (y / 100) * height;

      // The edge itself is inside; one pixel beyond it still hits the circle
      // but must be handled as a return to the tray, not a placement.
      assert.equal(isPointOutsideStage(clientX, clientY, stage), false);
      assert.equal(
        findTargetAtPoint(clientX, clientY, stage, [target]),
        target,
      );
      assert.equal(
        findTargetAtPoint(clientX + dx, clientY + dy, stage, [target]),
        target,
      );
      assert.equal(
        isPointOutsideStage(clientX + dx, clientY + dy, stage),
        true,
      );
    });
  }

  test(`${size}: inside but away from destinations neither returns nor snaps`, () => {
    const x = stage.left + width / 2;
    const y = stage.top + height / 2;
    assert.equal(isPointOutsideStage(x, y, stage), false);
    assert.equal(
      findTargetAtPoint(x, y, stage, [
        { id: "corner", x: 0, y: 0, snapRadius: 8 },
      ]),
      undefined,
    );
  });

  test(`${size}: small circles use the real radius, without a 24px minimum`, () => {
    const target = { id: "small", x: 50, y: 50, snapRadius: 1 };
    const radius = getSnapRadius(target.snapRadius, stage);
    const circle = getSnapCircleStyle(target.snapRadius, stage);
    assert.equal(radius, Math.min(width, height) / 100);
    assert.equal(circle.width, 2 * radius);
    assert.equal(circle.height, 2 * radius);
    assert.ok(2 * circle.borderWidth <= circle.width);
    assert.ok(2 * radius < 24);
    const x = stage.left + width / 2;
    const y = stage.top + height / 2;
    assert.equal(
      findTargetAtPoint(x + radius - 0.001, y, stage, [target]),
      target,
    );
    assert.equal(
      findTargetAtPoint(x + radius + 0.001, y, stage, [target]),
      undefined,
    );
    assert.equal(findTargetAtPoint(x + 11, y, stage, [target]), undefined);
  });
}

test("unmeasured stage does not draw a minimum-size circle", () => {
  assert.deepEqual(getSnapCircleStyle(8, { width: 0, height: 0 }), {
    width: 0,
    height: 0,
    borderWidth: 0,
  });
});

test("overlapping targets preserve normalized distance and deterministic ID ordering", () => {
  const stage = { left: 0, top: 0, width: 1000, height: 500 };
  const a = { id: "a", x: 50, y: 50, snapRadius: 4 };
  const b = { ...a, id: "b", snapRadius: 8 };
  assert.equal(findTargetAtPoint(510, 250, stage, [a, b]), b);
  assert.equal(findTargetAtPoint(500, 250, stage, [b, a]), a);
  assert.equal(
    findTargetAtPoint(500, 250, stage, [{ ...a, snapRadius: 0 }]),
    undefined,
  );
});

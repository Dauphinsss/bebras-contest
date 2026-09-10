import type { StoredTaskDragDropTarget } from "../lib/task-schema";

export type StageBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isPointOutsideStage(
  clientX: number,
  clientY: number,
  stage: StageBounds,
) {
  return (
    clientX < stage.left ||
    clientX > stage.left + stage.width ||
    clientY < stage.top ||
    clientY > stage.top + stage.height
  );
}

export function getSnapRadius(
  snapRadius: number,
  stage: Pick<StageBounds, "width" | "height">,
) {
  return (snapRadius / 100) * Math.min(stage.width, stage.height);
}

export function getSnapCircleStyle(
  snapRadius: number,
  stage: Pick<StageBounds, "width" | "height">,
) {
  const radius = getSnapRadius(snapRadius, stage);
  return {
    width: 2 * radius,
    height: 2 * radius,
    // A border must not force tiny circles beyond their actual diameter.
    borderWidth: Math.min(2, radius),
  };
}

export function findTargetAtPoint(
  clientX: number,
  clientY: number,
  stage: StageBounds,
  targets: StoredTaskDragDropTarget[],
) {
  return targets
    .map((target) => {
      const radius = getSnapRadius(target.snapRadius, stage);
      const x = stage.left + (target.x / 100) * stage.width;
      const y = stage.top + (target.y / 100) * stage.height;
      const distance = Math.hypot(clientX - x, clientY - y);

      return { target, radius, distance };
    })
    .filter(({ radius, distance }) => radius > 0 && distance <= radius)
    .sort(
      (left, right) =>
        left.distance / left.radius - right.distance / right.radius ||
        (left.target.id === right.target.id
          ? 0
          : left.target.id < right.target.id
            ? -1
            : 1),
    )[0]?.target;
}

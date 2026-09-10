import {
  dragDropPrimaryPlacements,
  dragDropSignature,
} from "./drag-drop-grading";
import type {
  StoredTaskDragDropItem,
  StoredTaskDragDropSolution,
  StoredTaskDragDropTarget,
} from "./task-schema";
import type { AuthoringImageSize } from "./authoring-image-sizes";

export function summarizeAuthoringWarnings(warnings: string[], limit = 3) {
  return (
    warnings.slice(0, limit).join("; ") +
    (warnings.length > limit ? `; y ${warnings.length - limit} avisos más` : "")
  );
}

/** Image rectangles scale with the background. Transparent pixels are not inferred. */
export function pieceGeometryWarnings(
  items: StoredTaskDragDropItem[],
  targets: StoredTaskDragDropTarget[],
  placements: Record<string, string>,
  background: AuthoringImageSize | undefined,
  imageSizes: Record<string, AuthoringImageSize>,
) {
  const warnings: string[] = [];
  let unmeasured = 0;
  const validSize = (
    size: AuthoringImageSize | undefined,
  ): size is AuthoringImageSize =>
    Boolean(
      size &&
      Number.isFinite(size.width) &&
      size.width > 0 &&
      Number.isFinite(size.height) &&
      size.height > 0,
    );
  const rectangles = items.flatMap((item, index) => {
    const target = targets.find((entry) => entry.id === placements[item.id]);
    if (!target) return [];
    const image = item.image ? imageSizes[item.image.url] : undefined;
    if (!validSize(background) || !validSize(image)) {
      unmeasured++;
      return [];
    }
    const width = (item.widthPercent * background.width) / 100;
    const height = (width * image.height) / image.width;
    const x = (target.x * background.width) / 100;
    const y = (target.y * background.height) / 100;
    const rectangle = {
      index: index + 1,
      targetId: target.id,
      left: x - width / 2,
      right: x + width / 2,
      top: y - height / 2,
      bottom: y + height / 2,
    };
    if (
      rectangle.left < 0 ||
      rectangle.top < 0 ||
      rectangle.right > background.width ||
      rectangle.bottom > background.height
    )
      warnings.push(`Pieza ${index + 1}: sobrepasa el fondo`);
    return [rectangle];
  });
  for (const [index, rectangle] of rectangles.entries()) {
    for (const other of rectangles.slice(index + 1)) {
      if (
        rectangle.left < other.right &&
        rectangle.right > other.left &&
        rectangle.top < other.bottom &&
        rectangle.bottom > other.top
      )
        warnings.push(
          `Piezas ${rectangle.index} y ${other.index}: se superponen`,
        );
    }
    if (!validSize(background)) continue;
    for (const [targetIndex, target] of targets.entries()) {
      if (target.id === rectangle.targetId) continue;
      const x = (target.x * background.width) / 100;
      const y = (target.y * background.height) / 100;
      if (
        x > rectangle.left &&
        x < rectangle.right &&
        y > rectangle.top &&
        y < rectangle.bottom
      )
        warnings.push(
          `Pieza ${rectangle.index}: cubre el centro del destino ${targetIndex + 1}`,
        );
    }
  }
  return { warnings, unmeasured };
}

export function editingSolutions(
  items: StoredTaskDragDropItem[],
  alternatives: StoredTaskDragDropSolution[],
) {
  return [
    {
      id: "primary",
      name: "Principal",
      placements: dragDropPrimaryPlacements(items),
    },
    ...alternatives.map((solution, i) => ({
      ...solution,
      name: `Alterna ${i + 1}`,
    })),
  ];
}

export function duplicateSolutions(
  items: StoredTaskDragDropItem[],
  solutions: ReturnType<typeof editingSolutions>,
) {
  const seen = new Map<string, string>();
  return solutions.flatMap((solution) => {
    const signature = dragDropSignature(items, solution.placements);
    if (!signature) return [];
    const previous = seen.get(signature);
    if (previous) return [`${solution.name}: igual a ${previous}`];
    seen.set(signature, solution.name);
    return [];
  });
}

export function nextTargetPosition(
  targets: Pick<StoredTaskDragDropTarget, "x" | "y">[],
) {
  const side = Math.max(5, Math.ceil(Math.sqrt(targets.length + 1)));
  const candidates = Array.from({ length: side * side }, (_, i) => ({
    x: 10 + ((i % side) * 80) / (side - 1),
    y: 10 + (Math.floor(i / side) * 80) / (side - 1),
  }));
  return candidates.reduce((best, candidate) => {
    const distance = (point: typeof candidate) =>
      Math.min(
        ...targets.map((target) =>
          Math.hypot(target.x - point.x, target.y - point.y),
        ),
      );
    return distance(candidate) > distance(best) ? candidate : best;
  });
}

export function intersectingTargets(
  targets: StoredTaskDragDropTarget[],
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return [];
  return targets.flatMap((target, i) =>
    targets
      .slice(i + 1)
      .flatMap((other, j) =>
        Math.hypot(
          ((target.x - other.x) * width) / 100,
          ((target.y - other.y) * height) / 100,
        ) <
        ((target.snapRadius + other.snapRadius) * Math.min(width, height)) / 100
          ? [`${i + 1} y ${i + j + 2}`]
          : [],
      ),
  );
}

export function blankRemovalImpact(
  ids: string[],
  assignments: Record<string, string>[],
) {
  return assignments.flatMap((assignment, i) =>
    ids.some((id) => Boolean(assignment[id])) ? [i + 1] : [],
  );
}

export function dragRemovalImpact(
  solutions: ReturnType<typeof editingSolutions>,
  kind: "pieza" | "destino",
  id: string,
) {
  return solutions.filter((solution) =>
    kind === "pieza"
      ? Boolean(solution.placements[id])
      : Object.values(solution.placements).includes(id),
  );
}

export function targetSizeWarnings(
  targets: StoredTaskDragDropTarget[],
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return [];
  return targets.flatMap((target, i) => {
    const radius = (target.snapRadius * Math.min(width, height)) / 100;
    const x = (target.x * width) / 100;
    const y = (target.y * height) / 100;
    const warnings: string[] = [];
    if (radius * 2 < 24)
      warnings.push(
        `Destino ${i + 1}: área de encaje pequeña en esta pantalla`,
      );
    if (radius * 2 > Math.min(width, height) / 2)
      warnings.push(`Destino ${i + 1}: área de encaje muy grande`);
    if (x < radius || y < radius || x + radius > width || y + radius > height)
      warnings.push(`Destino ${i + 1}: el radio sobrepasa el fondo`);
    return warnings;
  });
}

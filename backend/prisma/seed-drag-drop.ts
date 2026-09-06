/** Conserva los formatos históricos y los campos privados de la autoría. */
export function seedDragDropConfig(task: {
  dragDropItems?: unknown;
  dragDropTargets?: unknown[];
  dragDropSolutions?: unknown[];
}) {
  return task.dragDropTargets
    ? {
        version: 2,
        items: Array.isArray(task.dragDropItems) ? task.dragDropItems : [],
        targets: task.dragDropTargets,
        solutions: task.dragDropSolutions ?? [],
      }
    : (task.dragDropItems ?? []);
}

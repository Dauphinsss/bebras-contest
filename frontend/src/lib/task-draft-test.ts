/**
 * El probador vive en otra página, así que el borrador sin guardar viaja por
 * sessionStorage: el editor lo deja antes de navegar, el probador lo corrige y
 * el editor lo recupera al volver para no perder lo que no estaba guardado.
 */
const TASK_DRAFT_TEST_KEY = "bebras:task-draft-test";

export type StoredTaskDraftTest = {
  /** Identificador de la tarea que se estaba editando; `null` si es nueva. */
  taskId: string | null;
  task: unknown;
};

export function storeTaskDraftForTest(draft: StoredTaskDraftTest) {
  try {
    window.sessionStorage.setItem(TASK_DRAFT_TEST_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readTaskDraftForTest(): StoredTaskDraftTest | null {
  try {
    const stored = window.sessionStorage.getItem(TASK_DRAFT_TEST_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;

    if (!parsed || typeof parsed !== "object" || !("task" in parsed)) {
      return null;
    }

    const draft = parsed as Record<string, unknown>;
    return {
      taskId: typeof draft.taskId === "string" ? draft.taskId : null,
      task: draft.task,
    };
  } catch {
    return null;
  }
}

export function clearTaskDraftForTest() {
  try {
    window.sessionStorage.removeItem(TASK_DRAFT_TEST_KEY);
  } catch {
    // Sin sessionStorage no hay nada que limpiar.
  }
}

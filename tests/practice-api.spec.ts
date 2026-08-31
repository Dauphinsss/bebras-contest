import { test, expect, request } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  API,
  SEEDED_TASK,
  loginAdmin,
  createContest,
  joinContest,
  taskBlock,
  DRAG_DROP_TARGETS,
  DRAG_DROP_ITEMS,
  DRAG_DROP_CORRECT_PLACEMENTS,
  createPracticeTask,
} from "./support/helpers";

test("allows practice updates through CORS", async () => {
  const api = await request.newContext();
  const preflight = await api.fetch(
    `${API}/api/tasks/${SEEDED_TASK.taskId}/practice`,
    {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:4421",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type",
      },
    },
  );

  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-methods"]).toContain(
    "PATCH",
  );

  const headers = await loginAdmin(api);
  const update = await api.patch(
    `${API}/api/tasks/${SEEDED_TASK.taskId}/practice`,
    {
      headers,
      data: { isPractice: true },
    },
  );

  expect(update.ok()).toBe(true);
  expect(await update.json()).toEqual({
    id: SEEDED_TASK.taskId,
    isPractice: true,
  });

  await api.dispose();
});

test("serves and checks all four public practice answer types", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const tasks = await Promise.all(
    (["multiple_choice", "short_text", "range", "drag_drop"] as const).map(
      (answerType) => createPracticeTask(api, headers, answerType),
    ),
  );
  const dragDropTask = tasks.find((task) => task.answerType === "drag_drop");
  expect(dragDropTask).toBeTruthy();

  const categoriesResponse = await api.get(`${API}/api/practice/categories`);
  expect(categoriesResponse.ok(), await categoriesResponse.text()).toBe(true);
  const categories = await categoriesResponse.json();
  const titiCategory = categories.find(
    (category: { name: string }) => category.name === "Titi",
  );
  expect(titiCategory).toMatchObject({
    name: "Titi",
    age: "10-12 años",
  });
  expect(titiCategory.count).toBeGreaterThanOrEqual(tasks.length);

  const listResponse = await api.get(`${API}/api/practice/tasks?category=Titi`);
  expect(listResponse.ok(), await listResponse.text()).toBe(true);
  const list = await listResponse.json();
  const createdIds = new Set(tasks.map((task) => task.id));
  const createdTasks = list.tasks.filter((task: { id: string }) =>
    createdIds.has(task.id),
  );
  expect(createdTasks).toHaveLength(tasks.length);
  expect(
    createdTasks.map((task: { answerType: string }) => task.answerType).sort(),
  ).toEqual(["drag_drop", "multiple_choice", "range", "short_text"]);

  const cases = [
    {
      task: tasks.find((task) => task.answerType === "multiple_choice"),
      correct: { selected: ["B"] },
      incorrect: { selected: ["A"] },
    },
    {
      task: tasks.find((task) => task.answerType === "short_text"),
      correct: { text: " bebras " },
      incorrect: { text: "castor" },
    },
    {
      task: tasks.find((task) => task.answerType === "range"),
      correct: { value: 15 },
      incorrect: { value: 21 },
    },
    {
      task: dragDropTask,
      correct: { placements: DRAG_DROP_CORRECT_PLACEMENTS },
      incorrect: {
        placements: {
          [DRAG_DROP_ITEMS[0].id]: DRAG_DROP_ITEMS[1].correctTargetId,
          [DRAG_DROP_ITEMS[1].id]: DRAG_DROP_ITEMS[0].correctTargetId,
        },
      },
    },
  ];

  for (const practiceCase of cases) {
    const detailResponse = await api.get(
      `${API}/api/practice/tasks/${practiceCase.task.id}`,
    );
    expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
    const detail = await detailResponse.json();
    expect(detail.answerType).toBe(practiceCase.task.answerType);
    expect(detail).not.toHaveProperty("correctAnswerId");
    expect(detail).not.toHaveProperty("shortAnswer");
    expect(detail).not.toHaveProperty("rangeAnswers");
    expect(detail).not.toHaveProperty("explanation");
    if (detail.answerType === "drag_drop") {
      expect(detail.dragDropTargets).toHaveLength(DRAG_DROP_TARGETS.length);
      expect(detail.dragDropTargets).toEqual(
        expect.arrayContaining(DRAG_DROP_TARGETS),
      );
      expect(detail.dragDropItems).toHaveLength(DRAG_DROP_ITEMS.length);
      expect(detail.dragDropItems).toEqual(
        expect.arrayContaining(
          DRAG_DROP_ITEMS.map(
            ({ correctTargetId: _correctTargetId, ...item }) => item,
          ),
        ),
      );
      for (const item of detail.dragDropItems) {
        expect(item).not.toHaveProperty("correctTargetId");
        expect(item).not.toHaveProperty("targetX");
        expect(item).not.toHaveProperty("targetY");
        expect(item).not.toHaveProperty("tolerance");
      }
      const publicItems = JSON.stringify(detail.dragDropItems);
      for (const target of DRAG_DROP_TARGETS) {
        expect(publicItems).not.toContain(target.id);
      }
    }

    const correctResponse = await api.post(
      `${API}/api/practice/tasks/${practiceCase.task.id}/check`,
      { data: { payload: practiceCase.correct } },
    );
    expect(correctResponse.ok(), await correctResponse.text()).toBe(true);
    expect(await correctResponse.json()).toMatchObject({ correct: true });

    const incorrectResponse = await api.post(
      `${API}/api/practice/tasks/${practiceCase.task.id}/check`,
      { data: { payload: practiceCase.incorrect } },
    );
    expect(incorrectResponse.ok(), await incorrectResponse.text()).toBe(true);
    expect(await incorrectResponse.json()).toMatchObject({ correct: false });
  }

  const checkDragDrop = async (placements: Record<string, unknown>) => {
    const response = await api.post(
      `${API}/api/practice/tasks/${dragDropTask.id}/check`,
      {
        data: { payload: { placements } },
      },
    );
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };

  expect(
    await checkDragDrop({
      [DRAG_DROP_ITEMS[0].id]: { x: 85, y: 75 },
      [DRAG_DROP_ITEMS[1].id]: { x: 15, y: 25 },
    }),
  ).toMatchObject({ correct: false });
  expect(
    await checkDragDrop({
      "nonexistent-item": DRAG_DROP_TARGETS[0].id,
    }),
  ).toMatchObject({ correct: false });
  expect(
    await checkDragDrop({
      [DRAG_DROP_ITEMS[0].id]: DRAG_DROP_TARGETS[0].id,
      [DRAG_DROP_ITEMS[1].id]: DRAG_DROP_TARGETS[0].id,
    }),
  ).toMatchObject({ correct: false });

  await api.dispose();
});

test("uses a circular radius for legacy drag-drop coordinates", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "drag_drop");
  const backendRequire = createRequire(
    resolve(process.cwd(), "backend/package.json"),
  );
  const Database = backendRequire("better-sqlite3") as new (path: string) => {
    prepare: (sql: string) => {
      run: (...parameters: unknown[]) => unknown;
    };
    close: () => void;
  };
  const database = new Database(resolve(process.cwd(), "backend/test.db"));
  try {
    database
      .prepare('UPDATE "TaskDraft" SET "dragDropItems" = ? WHERE "id" = ?')
      .run(
        JSON.stringify({
          version: 1,
          items: DRAG_DROP_ITEMS,
          targets: DRAG_DROP_TARGETS,
        }),
        task.id,
      );
  } finally {
    database.close();
  }

  const check = async (firstPlacement: { x: number; y: number }) => {
    const response = await api.post(
      `${API}/api/practice/tasks/${task.id}/check`,
      {
        data: {
          payload: {
            placements: {
              [DRAG_DROP_ITEMS[0].id]: firstPlacement,
              [DRAG_DROP_ITEMS[1].id]: {
                x: DRAG_DROP_TARGETS[1].x,
                y: DRAG_DROP_TARGETS[1].y,
              },
            },
          },
        },
      },
    );
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };

  expect(
    await check({
      x: DRAG_DROP_TARGETS[0].x + DRAG_DROP_TARGETS[0].snapRadius,
      y: DRAG_DROP_TARGETS[0].y,
    }),
  ).toMatchObject({ correct: true });
  expect(
    await check({
      x: DRAG_DROP_TARGETS[0].x + 8,
      y: DRAG_DROP_TARGETS[0].y + 8,
    }),
  ).toMatchObject({ correct: false });

  await api.dispose();
});

test("enforces every multiple-choice correctness criterion", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const answers = ["A", "B", "C"].map((id) => ({
    id,
    blocks: [taskBlock(`criterion-${id}-${Date.now()}`, `Respuesta ${id}`)],
  }));
  const criteria = [
    {
      mode: "single",
      correctAnswerId: "B",
      accepted: [["B"]],
      rejected: [[], ["A"], ["B", "C"], ["B", "B"]],
    },
    {
      mode: "any",
      correctAnswerId: "any:B,C",
      accepted: [["B"], ["C"]],
      rejected: [[], ["A"], ["B", "C"], ["B", "B"]],
    },
    {
      mode: "all",
      correctAnswerId: "all:B,C",
      accepted: [
        ["B", "C"],
        ["C", "B"],
      ],
      rejected: [[], ["B"], ["C"], ["B", "A"], ["B", "C", "A"], ["B", "B"]],
    },
  ] as const;

  const tasks = [];
  for (const criterion of criteria) {
    const task = await createPracticeTask(api, headers, "multiple_choice", {
      title: `Criterio ${criterion.mode}`,
      answers,
      correctAnswerId: criterion.correctAnswerId,
    });
    tasks.push(task);

    const detailResponse = await api.get(
      `${API}/api/practice/tasks/${task.id}`,
    );
    expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
    expect(await detailResponse.json()).toMatchObject({
      multipleChoiceMode: criterion.mode,
    });

    for (const selected of criterion.accepted) {
      const response = await api.post(
        `${API}/api/practice/tasks/${task.id}/check`,
        {
          data: { payload: { selected } },
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
      expect(await response.json()).toMatchObject({ correct: true });
    }

    for (const selected of criterion.rejected) {
      const response = await api.post(
        `${API}/api/practice/tasks/${task.id}/check`,
        {
          data: { payload: { selected } },
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
      expect(await response.json()).toMatchObject({ correct: false });
    }
  }

  const allTask = tasks.find((task) => task.correctAnswerId === "all:B,C");
  expect(allTask).toBeTruthy();
  const duplicateConfiguration = await api.put(
    `${API}/api/tasks/${allTask.id}`,
    {
      headers,
      data: { ...allTask, correctAnswerId: "all:B,B" },
    },
  );
  expect(duplicateConfiguration.status()).toBe(400);
  expect(await duplicateConfiguration.json()).toMatchObject({
    message: "Debes marcar al menos dos respuestas correctas.",
  });

  await api.dispose();
});

test("validates v2 drag-drop answers within their contest", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "drag_drop");
  const contest = await createContest(api, headers, {
    category: "Titi",
    tasks: [{ taskId: task.id }],
  });
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    "P5",
    "Arrastre API",
  );
  const start = await api.post(`${API}/api/play/start`, {
    data: { personalCode },
  });
  expect(start.ok(), await start.text()).toBe(true);

  const invalidPlacements = [
    { "nonexistent-item": DRAG_DROP_TARGETS[0].id },
    { [DRAG_DROP_ITEMS[0].id]: "nonexistent-target" },
    {
      [DRAG_DROP_ITEMS[0].id]: { x: 85, y: 75 },
      [DRAG_DROP_ITEMS[1].id]: { x: 15, y: 25 },
    },
    {
      [DRAG_DROP_ITEMS[0].id]: DRAG_DROP_TARGETS[0].id,
      [DRAG_DROP_ITEMS[1].id]: DRAG_DROP_TARGETS[0].id,
    },
  ];
  for (const placements of invalidPlacements) {
    const answer = await api.post(`${API}/api/play/answer`, {
      data: { personalCode, taskId: task.id, payload: { placements } },
    });
    expect(answer.status(), await answer.text()).toBe(400);
  }

  const unrelatedTask = await api.post(`${API}/api/play/answer`, {
    data: {
      personalCode,
      taskId: SEEDED_TASK.taskId,
      payload: { selected: ["B"] },
    },
  });
  expect(unrelatedTask.status(), await unrelatedTask.text()).toBe(404);
  expect((await unrelatedTask.json()).message).toContain(
    "no pertenece a esta competencia",
  );

  const valid = await api.post(`${API}/api/play/answer`, {
    data: {
      personalCode,
      taskId: task.id,
      payload: { placements: DRAG_DROP_CORRECT_PLACEMENTS },
    },
  });
  expect(valid.status(), await valid.text()).toBe(204);
  await api.dispose();
});

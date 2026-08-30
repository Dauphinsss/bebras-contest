import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canAccessSiteNav } from "../frontend/src/lib/site-navigation";

const API = "http://localhost:3100";
const UPLOADS_DIR = resolve(process.cwd(), "backend/uploads/letters");
const E2E_CLOCK_FILE = resolve(process.cwd(), "backend/test-clock.txt");

test.afterEach(() => {
  rmSync(E2E_CLOCK_FILE, { force: true });
});

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "marko@bebras.bo",
  password: process.env.E2E_ADMIN_PASSWORD ?? "bebras2026",
};

async function loginAdmin(api: APIRequestContext) {
  const login = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((r) => r.json());
  return { authorization: `Bearer ${login.token}` };
}

const SEEDED_TASK = {
  taskId: "seed-bebras-easy",
  category: "Capibara",
  grade: "P3",
};

const SCORING_TASKS = [
  {
    taskId: "seed-bebras-easy",
    difficulty: "easy",
    minScore: -2,
    noAnswerScore: 0,
    maxScore: 6,
  },
  {
    taskId: "seed-bebras-medium",
    difficulty: "medium",
    minScore: -3,
    noAnswerScore: 0,
    maxScore: 9,
  },
  {
    taskId: "seed-bebras-hard",
    difficulty: "hard",
    minScore: -4,
    noAnswerScore: 0,
    maxScore: 12,
  },
] as const;

async function createContest(
  api: APIRequestContext,
  headers: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  const picked = SEEDED_TASK;

  const contest = await api
    .post(`${API}/api/contests`, {
      headers,
      data: {
        title: "PW Eval " + Date.now(),
        category: picked.category,
        durationMinutes: 60,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        allowPairs: false,
        showFeedback: true,
        showSolutions: true,
        showTotalScore: true,
        tasks: [{ taskId: picked.taskId }],
        ...overrides,
      },
    })
    .then((r) => r.json());

  await api.post(`${API}/api/contests/${contest.id}/publish`, { headers });
  return { ...contest, picked };
}

async function joinContest(
  api: APIRequestContext,
  headers: Record<string, string>,
  contestId: string,
  grade: string,
  firstName = "Playwright",
) {
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId, name: "PW Group" },
    })
    .then((r) => r.json());

  const response = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade,
      memberOneFirstName: firstName,
      memberOneLastName: "Tester",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const join = await response.json();

  return join.personalCode as string;
}

async function createScoringTask(
  api: APIRequestContext,
  headers: Record<string, string>,
  difficulty: (typeof SCORING_TASKS)[number]["difficulty"],
  index: number,
) {
  const block = (id: string, content: string) => ({
    id,
    type: "text",
    content,
    image: null,
    widthPercent: 100,
  });
  const response = await api.post(`${API}/api/tasks`, {
    headers,
    data: {
      title: `PW ${difficulty} ${index} ${Date.now()}`,
      categories: ["Algoritmos y programación"],
      difficulties: { "8–10": difficulty },
      bodyBlocks: [block(`body-${difficulty}-${index}`, "Contenido")],
      challengeBlocks: [
        block(`challenge-${difficulty}-${index}`, "Selecciona B"),
      ],
      answerType: "multiple_choice",
      multipleChoiceOrderMode: "fixed",
      answers: [
        {
          id: "A",
          blocks: [block(`answer-a-${difficulty}-${index}`, "Incorrecta")],
        },
        {
          id: "B",
          blocks: [block(`answer-b-${difficulty}-${index}`, "Correcta")],
        },
      ],
      correctAnswerId: "B",
      explanation: "B es la respuesta correcta.",
      status: "Borrador",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const task = await response.json();
  const scoring = SCORING_TASKS.find(
    (candidate) => candidate.difficulty === difficulty,
  )!;

  return { ...scoring, taskId: task.id as string };
}

async function submitScoringAttempt(
  api: APIRequestContext,
  headers: Record<string, string>,
  contestId: string,
  tasks: ReadonlyArray<{ taskId: string }>,
  firstName: string,
  selectedForTask: (index: number) => "A" | "B" | null,
) {
  const personalCode = await joinContest(
    api,
    headers,
    contestId,
    SEEDED_TASK.grade,
    firstName,
  );
  const start = await api.post(`${API}/api/play/start`, {
    data: { personalCode },
  });
  expect(start.ok(), await start.text()).toBe(true);

  for (const [index, task] of tasks.entries()) {
    const selected = selectedForTask(index);
    if (!selected) {
      continue;
    }

    const answer = await api.post(`${API}/api/play/answer`, {
      data: {
        personalCode,
        taskId: task.taskId,
        payload: { selected: [selected] },
      },
    });
    expect(answer.status(), await answer.text()).toBe(204);
  }

  const submit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode },
  });
  expect(submit.ok(), await submit.text()).toBe(true);
}

function uploadedDocuments() {
  return readdirSync(UPLOADS_DIR).filter((name) => name !== ".gitkeep");
}

function removeNewUploads(previous: string[]) {
  const existing = new Set(previous);
  for (const filename of uploadedDocuments()) {
    if (!existing.has(filename)) {
      rmSync(resolve(UPLOADS_DIR, filename), { force: true });
    }
  }
}

function registrationFields(
  email: string,
  institutionType: "school" | "homeschool",
) {
  return {
    firstName: "Registro",
    lastName: "Documentado",
    email,
    password: "segura123",
    schoolName:
      institutionType === "school" ? "Colegio manual" : "Educación en casa",
    institutionType,
    phone: "70000000",
  };
}

const VALID_PDF = {
  name: "carta.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n"),
};
const VALID_JPG = {
  name: "anverso.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
};
const VALID_PNG = {
  name: "reverso.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

function taskBlock(id: string, content: string) {
  return { id, type: "text", content, image: null, widthPercent: 100 };
}

const DRAG_DROP_BACKGROUND = {
  id: "drag-background",
  name: "escenario.svg",
  url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%23e2e8f0'/%3E%3C/svg%3E",
};
const DRAG_DROP_INPUT_TARGETS = [
  {
    id: "drop-zone-two",
    x: 75.123456789,
    y: 65.234567891,
    snapRadius: 10,
  },
  {
    id: "drop-zone-one",
    x: 24.876543211,
    y: 34.765432109,
    snapRadius: 10,
  },
];
const DRAG_DROP_TARGETS = DRAG_DROP_INPUT_TARGETS.map((target) => ({
  ...target,
  x: Math.round(target.x * 1000) / 1000,
  y: Math.round(target.y * 1000) / 1000,
}));
const DRAG_DROP_ITEMS = [
  {
    id: "drag-item-a",
    label: "Objeto alfa",
    image: {
      id: "drag-image-a",
      name: "objeto-alfa.svg",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60' viewBox='0 0 80 60'%3E%3Crect width='80' height='60' fill='%23ef4444'/%3E%3C/svg%3E",
    },
    widthPercent: 12,
    correctTargetId: "drop-zone-two",
  },
  {
    id: "drag-item-b",
    label: "Objeto beta",
    image: {
      id: "drag-image-b",
      name: "objeto-beta.svg",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60' viewBox='0 0 80 60'%3E%3Ccircle cx='40' cy='30' r='28' fill='%233b82f6'/%3E%3C/svg%3E",
    },
    widthPercent: 16,
    correctTargetId: "drop-zone-one",
  },
];

const DRAG_DROP_CORRECT_PLACEMENTS = Object.fromEntries(
  DRAG_DROP_ITEMS.map((item) => [item.id, item.correctTargetId]),
);

async function createPracticeTask(
  api: APIRequestContext,
  headers: Record<string, string>,
  answerType: "multiple_choice" | "short_text" | "range" | "drag_drop",
) {
  const suffix = `${answerType}-${Date.now()}`;
  const response = await api.post(`${API}/api/tasks`, {
    headers,
    data: {
      title: `Práctica ${answerType}`,
      categories: ["Algoritmos y programación"],
      difficulties: { "10–12": "medium" },
      bodyBlocks: [taskBlock(`body-${suffix}`, "Contenido")],
      challengeBlocks: [taskBlock(`challenge-${suffix}`, "Resuelve")],
      answerType,
      multipleChoiceOrderMode: "fixed",
      answers:
        answerType === "multiple_choice"
          ? [
              { id: "A", blocks: [taskBlock(`a-${suffix}`, "Incorrecta")] },
              { id: "B", blocks: [taskBlock(`b-${suffix}`, "Correcta")] },
            ]
          : [],
      correctAnswerId: answerType === "multiple_choice" ? "B" : "",
      shortAnswer: answerType === "short_text" ? "Bebras" : "",
      rangeAnswers:
        answerType === "range"
          ? [{ id: `range-${suffix}`, label: "Válido", min: 10, max: 20 }]
          : [],
      dragDropBackground:
        answerType === "drag_drop" ? DRAG_DROP_BACKGROUND : null,
      dragDropItems: answerType === "drag_drop" ? DRAG_DROP_ITEMS : [],
      dragDropTargets:
        answerType === "drag_drop" ? DRAG_DROP_INPUT_TARGETS : [],
      explanation: `Explicación ${answerType}`,
      status: "Borrador",
      isPractice: true,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const task = await response.json();
  if (answerType === "drag_drop") {
    expect(task.dragDropTargets).toEqual(DRAG_DROP_TARGETS);
  }
  return task;
}

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
    { headers, data: { isPractice: true } },
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
  expect(await categoriesResponse.json()).toContainEqual({
    name: "Titi",
    age: "10-12 años",
    count: 4,
  });

  const listResponse = await api.get(`${API}/api/practice/tasks?category=Titi`);
  expect(listResponse.ok(), await listResponse.text()).toBe(true);
  const list = await listResponse.json();
  expect(list.tasks).toHaveLength(4);
  expect(
    list.tasks.map((task: { answerType: string }) => task.answerType).sort(),
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
          DRAG_DROP_ITEMS.map(({ correctTargetId: _correctTargetId, ...item }) =>
            item,
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
      { data: { payload: { placements } } },
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

test("solves a v2 drag-drop practice task with pointer and touch input", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createPracticeTask(api, headers, "drag_drop");
  await api.dispose();

  await page.goto(`/practica/tarea?id=${task.id}&nombre=Titi`);
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();

  const stage = page.locator('[aria-label^="Escenario de la tarea."]');
  const itemButton = (imageName: string) =>
    page.getByRole("img", { name: imageName }).locator("..");
  const targetPoint = async (target: (typeof DRAG_DROP_TARGETS)[number]) => {
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    return {
      x: box!.x + (target.x / 100) * box!.width,
      y: box!.y + (target.y / 100) * box!.height,
    };
  };
  const expectAtTarget = async (
    imageName: string,
    target: (typeof DRAG_DROP_TARGETS)[number],
  ) => {
    const [buttonBox, point] = await Promise.all([
      itemButton(imageName).boundingBox(),
      targetPoint(target),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(
      Math.abs(buttonBox!.x + buttonBox!.width / 2 - point.x),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(buttonBox!.y + buttonBox!.height / 2 - point.y),
    ).toBeLessThanOrEqual(1);
  };
  const expectScaledWidth = async (
    imageName: string,
    widthPercent: number,
    activeStage = stage,
    activeItemButton = itemButton(imageName),
  ) => {
    const [buttonBox, stageBox] = await Promise.all([
      activeItemButton.boundingBox(),
      activeStage.boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(
      Math.abs(buttonBox!.width - (stageBox!.width * widthPercent) / 100),
    ).toBeLessThanOrEqual(1);
  };

  await expect(stage).toHaveText("");
  await expect(stage.getByRole("button")).toHaveCount(0);
  const initialHtml = await stage.evaluate((element) => element.outerHTML);
  expect(initialHtml).not.toContain("snapRadius");
  for (const target of DRAG_DROP_TARGETS) {
    await expect(page.getByText(target.id, { exact: true })).toHaveCount(0);
  }

  const alpha = itemButton(DRAG_DROP_ITEMS[0].image.name);
  await alpha.click();
  await expect(alpha).toHaveAttribute("aria-pressed", "true");
  await stage.click({ position: { x: 400, y: 20 } });
  await expect(stage.getByRole("button")).toHaveCount(0);
  await expect(alpha).toHaveAttribute("aria-pressed", "true");

  const targetTwoPoint = await targetPoint(DRAG_DROP_TARGETS[0]);
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.width).toBeLessThanOrEqual(769);
  const outsideCircleOffset = Math.min(stageBox!.width, stageBox!.height) * 0.08;
  await page.mouse.click(
    targetTwoPoint.x + outsideCircleOffset,
    targetTwoPoint.y + outsideCircleOffset,
  );
  await expect(stage.getByRole("button")).toHaveCount(0);
  await expect(alpha).toHaveAttribute("aria-pressed", "true");

  await page.mouse.click(targetTwoPoint.x, targetTwoPoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[0]);
  await expectScaledWidth(
    DRAG_DROP_ITEMS[0].image.name,
    DRAG_DROP_ITEMS[0].widthPercent,
  );

  const beta = itemButton(DRAG_DROP_ITEMS[1].image.name);
  const betaBox = await beta.boundingBox();
  expect(betaBox).not.toBeNull();
  await page.mouse.move(
    betaBox!.x + betaBox!.width / 2,
    betaBox!.y + betaBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(targetTwoPoint.x, targetTwoPoint.y, { steps: 8 });
  await page.mouse.up();
  await expectAtTarget(DRAG_DROP_ITEMS[1].image.name, DRAG_DROP_TARGETS[0]);
  await expectScaledWidth(
    DRAG_DROP_ITEMS[1].image.name,
    DRAG_DROP_ITEMS[1].widthPercent,
  );
  await expect(stage.getByRole("button")).toHaveCount(1);
  await expect(itemButton(DRAG_DROP_ITEMS[0].image.name)).toContainText(
    DRAG_DROP_ITEMS[0].label,
  );

  await itemButton(DRAG_DROP_ITEMS[0].image.name).click();
  const targetOnePoint = await targetPoint(DRAG_DROP_TARGETS[1]);
  await page.mouse.click(targetOnePoint.x, targetOnePoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[1]);

  await itemButton(DRAG_DROP_ITEMS[0].image.name).click();
  const occupiedTargetPoint = await targetPoint(DRAG_DROP_TARGETS[0]);
  await page.mouse.click(occupiedTargetPoint.x, occupiedTargetPoint.y);
  await expectAtTarget(DRAG_DROP_ITEMS[0].image.name, DRAG_DROP_TARGETS[0]);
  await expectAtTarget(DRAG_DROP_ITEMS[1].image.name, DRAG_DROP_TARGETS[1]);

  const checkRequest = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/practice/tasks/${task.id}/check` &&
      candidate.method() === "POST",
  );
  await page.getByRole("button", { name: "Comprobar" }).click();
  expect((await checkRequest).postDataJSON()).toEqual({
    payload: { placements: DRAG_DROP_CORRECT_PLACEMENTS },
  });
  await expect(page.getByText("¡Correcto!", { exact: true })).toBeVisible();

  const touchContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const touchPage = await touchContext.newPage();
    await touchPage.goto(`/practica/tarea?id=${task.id}&nombre=Titi`);
    await expect(
      touchPage.getByRole("heading", { name: task.title }),
    ).toBeVisible();
    const touchStage = touchPage.locator(
      '[aria-label^="Escenario de la tarea."]',
    );
    const touchBeta = touchPage
      .getByRole("img", { name: DRAG_DROP_ITEMS[1].image.name })
      .locator("..");
    await touchBeta.tap();
    await expect(touchBeta).toHaveAttribute("aria-pressed", "true");
    const touchStageBox = await touchStage.boundingBox();
    expect(touchStageBox).not.toBeNull();
    const touchTarget = DRAG_DROP_TARGETS[1];
    await touchPage.touchscreen.tap(
      touchStageBox!.x + (touchTarget.x / 100) * touchStageBox!.width,
      touchStageBox!.y + (touchTarget.y / 100) * touchStageBox!.height,
    );
    const placedBeta = await touchBeta.boundingBox();
    expect(placedBeta).not.toBeNull();
    expect(
      Math.abs(
        placedBeta!.x +
          placedBeta!.width / 2 -
          (touchStageBox!.x + (touchTarget.x / 100) * touchStageBox!.width),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        placedBeta!.y +
          placedBeta!.height / 2 -
          (touchStageBox!.y + (touchTarget.y / 100) * touchStageBox!.height),
      ),
    ).toBeLessThanOrEqual(1);
    await expectScaledWidth(
      DRAG_DROP_ITEMS[1].image.name,
      DRAG_DROP_ITEMS[1].widthPercent,
      touchStage,
      touchBeta,
    );
  } finally {
    await touchContext.close();
  }
});

test("keeps task authoring fields compact and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const api = await request.newContext();
  const session = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((response) => response.json());
  const task = await createPracticeTask(
    api,
    { authorization: `Bearer ${session.token}` },
    "drag_drop",
  );

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto(`/tareas/editar?id=${task.id}`);
  await api.dispose();

  const generalCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Información general" })
    .first();
  await expect(generalCard).toBeVisible();
  await expect(
    page.getByText(
      "Define la identidad y la clasificación principal de la tarea.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText("Debe permitir identificar la tarea rápidamente."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Define en qué grupos aplica la tarea y con qué dificultad."),
  ).toHaveCount(1);
  await expect(
    page.getByText(
      "Activa los rangos de edad donde aplica la tarea y luego define su dificultad.",
    ),
  ).toHaveCount(0);

  const generalHeader = generalCard.locator('[data-slot="card-header"]');
  const titleLabel = page.locator('label[for="title"]');
  const firstCategory = page.getByRole("checkbox", {
    name: "Algoritmos y programación",
  });
  const secondCategory = page.getByRole("checkbox", {
    name: "Estructuras de datos y representaciones",
  });
  const [headerBox, titleLabelBox, desktopCategoryOne, desktopCategoryTwo] =
    await Promise.all([
      generalHeader.boundingBox(),
      titleLabel.boundingBox(),
      firstCategory.boundingBox(),
      secondCategory.boundingBox(),
    ]);
  expect(headerBox).not.toBeNull();
  expect(titleLabelBox).not.toBeNull();
  expect(desktopCategoryOne).not.toBeNull();
  expect(desktopCategoryTwo).not.toBeNull();
  expect(
    titleLabelBox!.y - (headerBox!.y + headerBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(
    Math.abs(desktopCategoryOne!.y - desktopCategoryTwo!.y),
  ).toBeLessThanOrEqual(1);

  const difficultyCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Dificultad por rango de edad" })
    .first();
  const difficultyHeader = difficultyCard.locator('[data-slot="card-header"]');
  const difficultyHeaderContent = difficultyHeader.locator(":scope > div");
  const firstAgeCheckbox = page.getByRole("checkbox", { name: "5–8" });
  const secondAgeCheckbox = page.getByRole("checkbox", { name: "8–10" });
  const thirdAgeCheckbox = page.getByRole("checkbox", { name: "10–12" });
  const firstAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: firstAgeCheckbox });
  const secondAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: secondAgeCheckbox });
  const thirdAgeField = difficultyCard
    .locator('[data-slot="field"]')
    .filter({ has: thirdAgeCheckbox });
  const thirdAgeLabel = page.locator('label[for="age-range-10–12"]');
  const firstDifficulty = firstAgeField.getByRole("combobox", {
    name: "Dificultad para 5–8",
  });
  const secondDifficulty = secondAgeField.getByRole("combobox", {
    name: "Dificultad para 8–10",
  });
  const [
    difficultyCardBox,
    difficultyHeaderBox,
    difficultyHeaderContentBox,
    desktopFirstAgeField,
    desktopSecondAgeField,
    desktopThirdAgeField,
    desktopFirstDifficulty,
    desktopSecondDifficulty,
    desktopThirdAgeLabel,
  ] = await Promise.all([
    difficultyCard.boundingBox(),
    difficultyHeader.boundingBox(),
    difficultyHeaderContent.boundingBox(),
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    thirdAgeField.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
    thirdAgeLabel.boundingBox(),
  ]);
  expect(difficultyCardBox).not.toBeNull();
  expect(difficultyHeaderBox).not.toBeNull();
  expect(difficultyHeaderContentBox).not.toBeNull();
  expect(desktopFirstAgeField).not.toBeNull();
  expect(desktopSecondAgeField).not.toBeNull();
  expect(desktopThirdAgeField).not.toBeNull();
  expect(desktopFirstDifficulty).not.toBeNull();
  expect(desktopSecondDifficulty).not.toBeNull();
  expect(desktopThirdAgeLabel).not.toBeNull();
  const difficultyHeaderTopSpace =
    difficultyHeaderContentBox!.y - difficultyCardBox!.y;
  const difficultyHeaderBottomSpace =
    difficultyHeaderBox!.y +
    difficultyHeaderBox!.height -
    (difficultyHeaderContentBox!.y + difficultyHeaderContentBox!.height);
  expect(
    Math.abs(difficultyHeaderTopSpace - difficultyHeaderBottomSpace),
  ).toBeLessThanOrEqual(1);
  expect(
    desktopFirstAgeField!.y -
      (difficultyHeaderBox!.y + difficultyHeaderBox!.height),
  ).toBeLessThanOrEqual(20);
  expect(desktopSecondAgeField!.y).toBe(desktopFirstAgeField!.y);
  expect(desktopSecondAgeField!.x).toBeGreaterThan(desktopFirstAgeField!.x);
  expect(desktopThirdAgeField!.y).toBeGreaterThan(desktopFirstAgeField!.y);
  expect(desktopThirdAgeLabel!.height).toBeLessThanOrEqual(20);
  expect(desktopFirstDifficulty!.width).toBeLessThanOrEqual(145);
  expect(desktopSecondDifficulty!.width).toBe(desktopFirstDifficulty!.width);
  expect(
    desktopFirstAgeField!.x +
      desktopFirstAgeField!.width -
      (desktopFirstDifficulty!.x + desktopFirstDifficulty!.width),
  ).toBeLessThanOrEqual(1);
  expect(
    desktopSecondAgeField!.x +
      desktopSecondAgeField!.width -
      (desktopSecondDifficulty!.x + desktopSecondDifficulty!.width),
  ).toBeLessThanOrEqual(1);

  const nameInput = page.locator('input[id^="drag-item-label-"]').first();
  const widthInput = page.locator('input[id^="drag-item-width-"]').first();
  const radiusInput = page.locator('input[id^="drag-target-radius-"]').first();
  await expect(nameInput).toBeVisible();
  await expect(widthInput).toBeVisible();
  await expect(radiusInput).toBeVisible();
  await expect(page.locator('input[id^="drag-target-x-"]')).toHaveCount(0);
  await expect(page.locator('input[id^="drag-target-y-"]')).toHaveCount(0);

  const [desktopName, desktopWidth, desktopRadius] = await Promise.all([
    nameInput.boundingBox(),
    widthInput.boundingBox(),
    radiusInput.boundingBox(),
  ]);
  expect(desktopName).not.toBeNull();
  expect(desktopWidth).not.toBeNull();
  expect(desktopRadius).not.toBeNull();
  expect(Math.abs(desktopName!.y - desktopWidth!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(desktopName!.y - desktopRadius!.y)).toBeLessThanOrEqual(1);

  const stage = page.getByRole("group", {
    name: "Ubicación de los destinos de encaje",
  });
  const movedTarget = await stage.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const event = new MouseEvent("click", {
      bubbles: true,
      clientX: rect.left + element.clientLeft + element.clientWidth * 0.3333357,
      clientY: rect.top + element.clientTop + element.clientHeight * 0.4444457,
    });
    const coordinate = (
      position: number,
      start: number,
      border: number,
      size: number,
    ) =>
      Math.round(
        Math.max(0, Math.min(100, ((position - start - border) / size) * 100)) *
          1000,
      ) / 1000;
    element.dispatchEvent(event);
    return {
      x: coordinate(
        event.clientX,
        rect.left,
        element.clientLeft,
        element.clientWidth,
      ),
      y: coordinate(
        event.clientY,
        rect.top,
        element.clientTop,
        element.clientHeight,
      ),
    };
  });
  const updateRequest = page.waitForRequest(
    (candidate) =>
      candidate.url() === `${API}/api/tasks/${task.id}` &&
      candidate.method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  const updatedTarget = (await updateRequest)
    .postDataJSON()
    .dragDropTargets.find(
      (target: { id: string }) => target.id === DRAG_DROP_TARGETS[0].id,
    );
  expect(updatedTarget).toMatchObject(movedTarget);

  await page.setViewportSize({ width: 320, height: 800 });
  const [
    mobileName,
    mobileWidth,
    mobileRadius,
    mobileCategoryOne,
    mobileCategoryTwo,
    mobileFirstAgeCheckbox,
    mobileFirstDifficulty,
    mobileSecondDifficulty,
    mobileFirstAgeField,
    mobileSecondAgeField,
    mobileThirdAgeLabel,
  ] = await Promise.all([
    nameInput.boundingBox(),
    widthInput.boundingBox(),
    radiusInput.boundingBox(),
    firstCategory.boundingBox(),
    secondCategory.boundingBox(),
    firstAgeCheckbox.boundingBox(),
    firstDifficulty.boundingBox(),
    secondDifficulty.boundingBox(),
    firstAgeField.boundingBox(),
    secondAgeField.boundingBox(),
    thirdAgeLabel.boundingBox(),
  ]);
  expect(mobileName).not.toBeNull();
  expect(mobileWidth).not.toBeNull();
  expect(mobileRadius).not.toBeNull();
  expect(mobileCategoryOne).not.toBeNull();
  expect(mobileCategoryTwo).not.toBeNull();
  expect(mobileFirstAgeCheckbox).not.toBeNull();
  expect(mobileFirstDifficulty).not.toBeNull();
  expect(mobileSecondDifficulty).not.toBeNull();
  expect(mobileFirstAgeField).not.toBeNull();
  expect(mobileSecondAgeField).not.toBeNull();
  expect(mobileThirdAgeLabel).not.toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(mobileWidth!.y).toBeGreaterThan(mobileName!.y + mobileName!.height);
  expect(mobileRadius!.y).toBeGreaterThan(mobileWidth!.y + mobileWidth!.height);
  expect(mobileCategoryTwo!.y).toBeGreaterThan(
    mobileCategoryOne!.y + mobileCategoryOne!.height,
  );
  const checkboxOpticalOffset =
    mobileFirstAgeCheckbox!.y +
    mobileFirstAgeCheckbox!.height / 2 -
    (mobileFirstDifficulty!.y + mobileFirstDifficulty!.height / 2);
  expect(checkboxOpticalOffset).toBeGreaterThanOrEqual(-3);
  expect(checkboxOpticalOffset).toBeLessThanOrEqual(-1);
  expect(mobileFirstDifficulty!.width).toBeLessThanOrEqual(145);
  expect(mobileSecondDifficulty!.width).toBe(mobileFirstDifficulty!.width);
  expect(mobileSecondDifficulty!.x).toBe(mobileFirstDifficulty!.x);
  expect(mobileThirdAgeLabel!.height).toBeLessThanOrEqual(20);
  expect(
    mobileFirstAgeField!.x +
      mobileFirstAgeField!.width -
      (mobileFirstDifficulty!.x + mobileFirstDifficulty!.width),
  ).toBeLessThanOrEqual(1);
  expect(
    mobileSecondAgeField!.y -
      (mobileFirstAgeField!.y + mobileFirstAgeField!.height),
  ).toBeLessThanOrEqual(16);
});

test("rejects documents whose content does not match the extension", async () => {
  const api = await request.newContext();
  const response = await api.post(`${API}/api/auth/register`, {
    multipart: {
      firstName: "Archivo",
      lastName: "Disfrazado",
      email: `archivo-${Date.now()}@example.com`,
      password: "segura123",
      schoolName: "Colegio manual",
      institutionType: "school",
      phone: "70000000",
      letter: {
        name: "carta.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("esto no es un documento PDF"),
      },
    },
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("contenido del documento");
  await api.dispose();
});

test("registers school and homeschool teachers with valid documents", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const previousUploads = uploadedDocuments();
  const schoolEmail = `colegio-${Date.now()}@example.com`;
  const homeschoolEmail = `casa-${Date.now()}@example.com`;

  try {
    const school = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(schoolEmail, "school"),
        letter: VALID_PDF,
      },
    });
    expect(school.status(), await school.text()).toBe(201);

    const homeschool = await api.post(`${API}/api/auth/register`, {
      multipart: {
        ...registrationFields(homeschoolEmail, "homeschool"),
        idFront: VALID_JPG,
        idBack: VALID_PNG,
      },
    });
    expect(homeschool.status(), await homeschool.text()).toBe(201);

    const teachersResponse = await api.get(`${API}/api/users/maestros`, {
      headers,
    });
    expect(teachersResponse.ok(), await teachersResponse.text()).toBe(true);
    const teachers = await teachersResponse.json();
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: schoolEmail,
        institutionType: "school",
        hasLetter: true,
        hasIdFront: false,
        hasIdBack: false,
      }),
    );
    expect(teachers).toContainEqual(
      expect.objectContaining({
        email: homeschoolEmail,
        institutionType: "homeschool",
        hasLetter: false,
        hasIdFront: true,
        hasIdBack: true,
      }),
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});

test("rejects incomplete, unsupported and oversized document uploads cleanly", async () => {
  const api = await request.newContext();
  const previousUploads = uploadedDocuments();

  const assertRejectedWithoutUploads = async (
    multipart: Record<string, string | typeof VALID_PDF>,
    expectedMessage: string,
  ) => {
    const response = await api.post(`${API}/api/auth/register`, { multipart });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain(expectedMessage);
    expect(uploadedDocuments()).toEqual(previousUploads);
  };

  try {
    await assertRejectedWithoutUploads(
      registrationFields(`sin-carta-${Date.now()}@example.com`, "school"),
      "carta de autorización",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`carnet-${Date.now()}@example.com`, "homeschool"),
        idFront: VALID_JPG,
      },
      "anverso y el reverso",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`tipo-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`grande-${Date.now()}@example.com`, "school"),
        letter: {
          name: "carta.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0x25),
        },
      },
      "5 MB",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`campos-${Date.now()}@example.com`, "school"),
        firstName: "",
        letter: VALID_PDF,
      },
      "son obligatorios",
    );
    await assertRejectedWithoutUploads(
      {
        ...registrationFields(`parcial-${Date.now()}@example.com`, "school"),
        letter: VALID_PDF,
        idFront: {
          name: "carnet.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("documento"),
        },
      },
      "PDF o una imagen",
    );
  } finally {
    removeNewUploads(previousUploads);
    await api.dispose();
  }
});

test("rejects a grade that does not match the contest category", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);

  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Grade" },
    })
    .then((r) => r.json());

  const wrongGrade = contest.picked.grade === "S6" ? "P1" : "S6";

  const wrong = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: wrongGrade,
      memberOneFirstName: "Curso",
      memberOneLastName: "Invalido",
    },
  });

  expect(wrong.status()).toBe(400);
  expect((await wrong.json()).message).toContain(contest.picked.category);

  await api.dispose();
});

test("uses the 17-18 range and S5-S6 grades for Kuntur", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const suffix = Date.now();
  const taskResponse = await api.post(`${API}/api/tasks`, {
    headers,
    data: {
      title: `PW Kuntur ${suffix}`,
      categories: ["Algoritmos y programación"],
      difficulties: { "17–18": "hard" },
      bodyBlocks: [taskBlock(`kuntur-body-${suffix}`, "Contenido")],
      challengeBlocks: [
        taskBlock(`kuntur-challenge-${suffix}`, "Selecciona B"),
      ],
      answerType: "multiple_choice",
      multipleChoiceOrderMode: "fixed",
      answers: [
        { id: "A", blocks: [taskBlock(`kuntur-a-${suffix}`, "Incorrecta")] },
        { id: "B", blocks: [taskBlock(`kuntur-b-${suffix}`, "Correcta")] },
      ],
      correctAnswerId: "B",
      explanation: "B es correcta.",
      status: "Borrador",
    },
  });
  expect(taskResponse.ok(), await taskResponse.text()).toBe(true);
  const task = await taskResponse.json();
  const contest = await createContest(api, headers, {
    category: "Kuntur",
    tasks: [{ taskId: task.id }],
  });

  expect(contest.category).toBe("Kuntur");
  expect(contest.initialScore).toBe(4);
  expect(contest.tasks[0]).toMatchObject({
    difficulty: "hard",
    minScore: -4,
    noAnswerScore: 0,
    maxScore: 12,
  });

  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Kuntur" },
    })
    .then((response) => response.json());
  const publicGroupResponse = await api.get(
    `${API}/api/play/group/${group.accessCode}`,
  );
  expect(publicGroupResponse.ok(), await publicGroupResponse.text()).toBe(true);
  expect((await publicGroupResponse.json()).grades).toEqual([
    expect.objectContaining({ value: "S5", label: "5.º de secundaria" }),
    expect.objectContaining({ value: "S6", label: "6.º de secundaria" }),
  ]);

  for (const grade of ["S5", "S6"]) {
    const join = await api.post(`${API}/api/play/join`, {
      data: {
        accessCode: group.accessCode,
        participationMode: "individual",
        grade,
        memberOneFirstName: grade,
        memberOneLastName: "Kuntur",
      },
    });
    expect(join.status(), await join.text()).toBe(201);
  }

  const wrongGrade = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: "S4",
      memberOneFirstName: "Curso",
      memberOneLastName: "Incorrecto",
    },
  });
  expect(wrongGrade.status()).toBe(400);
  expect((await wrongGrade.json()).message).toContain("Kuntur");

  await api.dispose();
});

test("allows deleting unused contests, groups, participants and tasks", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createScoringTask(api, headers, "easy", Date.now());
  const contest = await createContest(api, headers, {
    tasks: [{ taskId: task.taskId }],
  });
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Delete" },
    })
    .then((response) => response.json());
  const join = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: contest.picked.grade,
      memberOneFirstName: "Eliminar",
      memberOneLastName: "Tester",
    },
  });
  expect(join.ok(), await join.text()).toBe(true);
  const personalCode = (await join.json()).personalCode as string;
  const groupDetails = await api
    .get(`${API}/api/groups/${group.id}`, { headers })
    .then((response) => response.json());
  const team = groupDetails.teams.find(
    (candidate: { personalCode: string }) =>
      candidate.personalCode === personalCode,
  );

  const removeTeam = await api.delete(`${API}/api/teams/${team.id}`, {
    headers,
  });
  expect(removeTeam.status(), await removeTeam.text()).toBe(204);

  const removeGroup = await api.delete(`${API}/api/groups/${group.id}`, {
    headers,
  });
  expect(removeGroup.status(), await removeGroup.text()).toBe(204);

  const removeContest = await api.delete(`${API}/api/contests/${contest.id}`, {
    headers,
  });
  expect(removeContest.status(), await removeContest.text()).toBe(204);

  const removeTask = await api.delete(`${API}/api/tasks/${task.taskId}`, {
    headers,
  });
  expect(removeTask.status(), await removeTask.text()).toBe(204);

  await api.dispose();
});

test("protects tasks and played contest records from deletion", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const task = await createScoringTask(api, headers, "easy", Date.now());
  const contest = await createContest(api, headers, {
    tasks: [{ taskId: task.taskId }],
  });
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Protected" },
    })
    .then((response) => response.json());
  const join = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade: contest.picked.grade,
      memberOneFirstName: "Protegido",
      memberOneLastName: "Tester",
    },
  });
  expect(join.ok(), await join.text()).toBe(true);
  const personalCode = (await join.json()).personalCode as string;

  const removeUsedTask = await api.delete(`${API}/api/tasks/${task.taskId}`, {
    headers,
  });
  expect(removeUsedTask.status()).toBe(409);
  expect((await removeUsedTask.json()).message).toContain("competencia");

  const start = await api.post(`${API}/api/play/start`, {
    data: { personalCode },
  });
  expect(start.ok(), await start.text()).toBe(true);
  const submit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode },
  });
  expect(submit.ok(), await submit.text()).toBe(true);

  const groupDetails = await api
    .get(`${API}/api/groups/${group.id}`, { headers })
    .then((response) => response.json());
  const team = groupDetails.teams.find(
    (candidate: { personalCode: string }) =>
      candidate.personalCode === personalCode,
  );

  const removeTeam = await api.delete(`${API}/api/teams/${team.id}`, {
    headers,
  });
  expect(removeTeam.status()).toBe(409);
  expect((await removeTeam.json()).message).toContain("ya rindió");

  const removeGroup = await api.delete(`${API}/api/groups/${group.id}`, {
    headers,
  });
  expect(removeGroup.status()).toBe(409);
  expect((await removeGroup.json()).message).toContain("ya rindieron");

  const removeContest = await api.delete(`${API}/api/contests/${contest.id}`, {
    headers,
  });
  expect(removeContest.status()).toBe(409);
  expect((await removeContest.json()).message).toContain("ya rindieron");

  await api.dispose();
});

test("enforces contest windows for publication and late starts", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);

  const acceptedContest = await createContest(api, headers, {
    durationMinutes: 2,
    startsAt: new Date(Date.now() - 2 * 60000).toISOString(),
    endsAt: new Date(Date.now() + 3 * 60000).toISOString(),
  });
  const acceptedCode = await joinContest(
    api,
    headers,
    acceptedContest.id,
    acceptedContest.picked.grade,
    "Inicio tardio",
  );
  const acceptedStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: acceptedCode },
  });
  expect(acceptedStart.ok(), await acceptedStart.text()).toBe(true);
  const acceptedAttempt = await api
    .get(`${API}/api/play/attempt/${acceptedCode}`)
    .then((response) => response.json());
  expect(acceptedAttempt.status).toBe("in_progress");
  expect(
    new Date(acceptedAttempt.endsAt).getTime() -
      new Date(acceptedAttempt.startedAt).getTime(),
  ).toBe(2 * 60000);

  const insufficientRemaining = await createContest(api, headers, {
    durationMinutes: 5,
    startsAt: new Date(Date.now() - 10 * 60000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 60000).toISOString(),
  });
  const rejectedCode = await joinContest(
    api,
    headers,
    insufficientRemaining.id,
    insufficientRemaining.picked.grade,
    "Sin tiempo",
  );
  const rejectedStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: rejectedCode },
  });
  expect(rejectedStart.status()).toBe(409);
  expect((await rejectedStart.json()).message).toContain(
    "no queda tiempo suficiente",
  );

  const shortWindowResponse = await api.post(`${API}/api/contests`, {
    headers,
    data: {
      title: `PW Short Window ${Date.now()}`,
      category: SEEDED_TASK.category,
      durationMinutes: 10,
      startsAt: new Date(Date.now() + 60000).toISOString(),
      endsAt: new Date(Date.now() + 6 * 60000).toISOString(),
      tasks: [{ taskId: SEEDED_TASK.taskId }],
    },
  });
  expect(shortWindowResponse.ok(), await shortWindowResponse.text()).toBe(true);
  const shortWindow = await shortWindowResponse.json();
  const publish = await api.post(
    `${API}/api/contests/${shortWindow.id}/publish`,
    { headers },
  );
  expect(publish.status()).toBe(400);
  expect((await publish.json()).message).toContain("más corta que la duración");

  await api.dispose();
});

test("freezes a contest once it is running", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);

  const edit = await api.put(`${API}/api/contests/${contest.id}`, {
    headers,
    data: {
      title: "Editada en vivo",
      category: contest.picked.category,
      durationMinutes: 60,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      tasks: contest.tasks.map((task: { taskId: string }) => ({
        taskId: task.taskId,
      })),
    },
  });

  expect(edit.status()).toBe(409);
  expect((await edit.json()).message).toContain("en curso");

  await api.dispose();
});

test("applies the easy, medium and hard Bebras scoring scales", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers, {
    tasks: SCORING_TASKS.map(({ taskId }) => ({ taskId })),
  });

  expect(contest.initialScore).toBe(9);
  expect(
    contest.tasks.map(
      (task: {
        taskId: string;
        difficulty: string;
        minScore: number;
        noAnswerScore: number;
        maxScore: number;
      }) => ({
        taskId: task.taskId,
        difficulty: task.difficulty,
        minScore: task.minScore,
        noAnswerScore: task.noAnswerScore,
        maxScore: task.maxScore,
      }),
    ),
  ).toEqual(SCORING_TASKS);

  const attempts = [
    {
      firstName: "Correctas",
      selected: "B",
      totalScore: 36,
      correctCount: 3,
      answeredCount: 3,
    },
    {
      firstName: "Incorrectas",
      selected: "A",
      totalScore: 0,
      correctCount: 0,
      answeredCount: 3,
    },
    {
      firstName: "Omitidas",
      selected: null,
      totalScore: 9,
      correctCount: 0,
      answeredCount: 0,
    },
  ] as const;

  for (const attempt of attempts) {
    const personalCode = await joinContest(
      api,
      headers,
      contest.id,
      contest.picked.grade,
      attempt.firstName,
    );
    const start = await api.post(`${API}/api/play/start`, {
      data: { personalCode },
    });
    expect(start.ok(), await start.text()).toBe(true);

    if (attempt.selected) {
      for (const task of SCORING_TASKS) {
        const answer = await api.post(`${API}/api/play/answer`, {
          data: {
            personalCode,
            taskId: task.taskId,
            payload: { selected: [attempt.selected] },
          },
        });
        expect(answer.status(), await answer.text()).toBe(204);
      }
    }

    const submit = await api.post(`${API}/api/play/submit`, {
      data: { personalCode },
    });
    expect(submit.ok(), await submit.text()).toBe(true);
  }

  const resultsResponse = await api.get(
    `${API}/api/contests/${contest.id}/results`,
    { headers },
  );
  expect(resultsResponse.ok(), await resultsResponse.text()).toBe(true);
  const results = await resultsResponse.json();

  for (const attempt of attempts) {
    const row = results.rows.find(
      (result: { memberOneFirstName: string }) =>
        result.memberOneFirstName === attempt.firstName,
    );
    expect(row).toMatchObject({
      totalScore: attempt.totalScore,
      correctCount: attempt.correctCount,
      answeredCount: attempt.answeredCount,
    });
  }

  await api.dispose();
});

test("scores the standard 15-task Bebras distribution from zero to 180", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const standardTasks = [];

  for (const scoring of SCORING_TASKS) {
    standardTasks.push(scoring);
    for (let copy = 1; copy < 5; copy += 1) {
      standardTasks.push(
        await createScoringTask(api, headers, scoring.difficulty, copy),
      );
    }
  }

  const contest = await createContest(api, headers, {
    tasks: standardTasks.map(({ taskId }) => ({ taskId })),
  });
  expect(contest.initialScore).toBe(45);
  expect(contest.tasks).toHaveLength(15);
  expect(
    contest.tasks.reduce(
      (counts: Record<string, number>, task: { difficulty: string }) => ({
        ...counts,
        [task.difficulty]: (counts[task.difficulty] ?? 0) + 1,
      }),
      {},
    ),
  ).toEqual({ easy: 5, medium: 5, hard: 5 });

  await submitScoringAttempt(
    api,
    headers,
    contest.id,
    standardTasks,
    "Maximo",
    () => "B",
  );
  await submitScoringAttempt(
    api,
    headers,
    contest.id,
    standardTasks,
    "Piso",
    () => "A",
  );
  await submitScoringAttempt(
    api,
    headers,
    contest.id,
    standardTasks,
    "Mixto",
    (index) => {
      const positionWithinDifficulty = index % 5;
      return positionWithinDifficulty < 2
        ? "B"
        : positionWithinDifficulty < 4
          ? "A"
          : null;
    },
  );

  const resultsResponse = await api.get(
    `${API}/api/contests/${contest.id}/results`,
    { headers },
  );
  expect(resultsResponse.ok(), await resultsResponse.text()).toBe(true);
  const results = await resultsResponse.json();
  const expectedResults = [
    { memberOneFirstName: "Maximo", totalScore: 180, answeredCount: 15 },
    { memberOneFirstName: "Piso", totalScore: 0, answeredCount: 15 },
    { memberOneFirstName: "Mixto", totalScore: 81, answeredCount: 12 },
  ];

  for (const expectedResult of expectedResults) {
    expect(results.rows).toContainEqual(
      expect.objectContaining(expectedResult),
    );
  }

  await api.dispose();
});

test("breaks equal-score ties by elapsed time", async () => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const slowerCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
    "Lento",
  );
  const fasterCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
    "Rapido",
  );

  const slowerStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: slowerCode },
  });
  expect(slowerStart.ok(), await slowerStart.text()).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const fasterStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: fasterCode },
  });
  expect(fasterStart.ok(), await fasterStart.text()).toBe(true);
  const fasterSubmit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode: fasterCode },
  });
  expect(fasterSubmit.ok(), await fasterSubmit.text()).toBe(true);

  const slowerSubmit = await api.post(`${API}/api/play/submit`, {
    data: { personalCode: slowerCode },
  });
  expect(slowerSubmit.ok(), await slowerSubmit.text()).toBe(true);

  const resultsResponse = await api.get(
    `${API}/api/contests/${contest.id}/results`,
    { headers },
  );
  expect(resultsResponse.ok(), await resultsResponse.text()).toBe(true);
  const results = await resultsResponse.json();
  const faster = results.rows.find(
    (row: { memberOneFirstName: string }) =>
      row.memberOneFirstName === "Rapido",
  );
  const slower = results.rows.find(
    (row: { memberOneFirstName: string }) => row.memberOneFirstName === "Lento",
  );

  expect(faster.totalScore).toBe(slower.totalScore);
  expect(faster.elapsedSeconds).toBeLessThanOrEqual(slower.elapsedSeconds);
  expect(faster.rankPosition).toBe(1);
  expect(slower.rankPosition).toBe(2);

  await api.dispose();
});

test("student starts, answers and submits without seeing the score", async ({
  page,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  await api.dispose();

  await page.goto(`/rendir?code=${personalCode}`);

  const startButton = page.getByRole("button", { name: /Empezar/i });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.getByText("Tarea 1", { exact: true })).toBeVisible({
    timeout: 15000,
  });

  const firstOption = page.locator("button[aria-pressed]").first();
  if (await firstOption.count()) {
    await firstOption.click();
  }

  await page.getByRole("button", { name: "Entregar" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Entregar" }).click();

  await expect(page.getByText(/Competencia terminada/i)).toBeVisible({
    timeout: 15000,
  });

  await expect(page.getByText(/Puntaje:/i)).toBeHidden();
  await expect(page.getByText(/se publicarán/i)).toBeVisible();
});

test("serializes answer saves for the same task", async ({ page }) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  const savedPayloads: Array<{ payload: { selected: string[] } }> = [];
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  let markFirstSaveStarted: (() => void) | undefined;
  const firstSaveStarted = new Promise<void>((resolve) => {
    markFirstSaveStarted = resolve;
  });

  await page.route(`${API}/api/play/answer`, async (route) => {
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    savedPayloads.push(
      route.request().postDataJSON() as { payload: { selected: string[] } },
    );

    if (savedPayloads.length === 1) {
      markFirstSaveStarted?.();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } finally {
      activeRequests -= 1;
    }
  });

  await page.goto(`/rendir?code=${personalCode}`);
  await page.getByRole("button", { name: /Empezar/i }).click();
  await expect(page.getByText("Tarea 1", { exact: true })).toBeVisible({
    timeout: 15000,
  });

  const options = page.locator("button[aria-pressed]");
  await options.first().click();
  await firstSaveStarted;
  await options.last().click();

  await expect
    .poll(() => savedPayloads.length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
  expect(maximumActiveRequests).toBe(1);
  expect(savedPayloads[0].payload.selected).not.toEqual(
    savedPayloads[1].payload.selected,
  );

  await api.dispose();
});

test("blocks submission until failed answers can be saved", async ({ page }) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);
  const contest = await createContest(api, headers);
  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  let failAnswerRequests = true;
  let answerRequests = 0;
  let submitRequests = 0;

  await page.route(`${API}/api/play/answer`, async (route) => {
    answerRequests += 1;
    if (failAnswerRequests) {
      await route.fulfill({
        status: 503,
        json: { message: "Temporary save failure" },
      });
      return;
    }
    await route.continue();
  });
  await page.route(`${API}/api/play/submit`, async (route) => {
    submitRequests += 1;
    await route.continue();
  });

  await page.goto(`/rendir?code=${personalCode}`);
  await page.getByRole("button", { name: /Empezar/i }).click();
  await expect(page.getByText("Tarea 1", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.locator("button[aria-pressed]").first().click();

  await page.getByRole("button", { name: "Entregar" }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Entregar" })
    .click();
  await expect(page.locator("button[aria-pressed]").first()).toBeDisabled();
  await expect(
    page.getByText(
      "No pudimos entregar la competencia. Revisa la conexión e inténtalo nuevamente.",
    ),
  ).toBeVisible({ timeout: 10000 });
  expect(answerRequests).toBeGreaterThanOrEqual(3);
  expect(submitRequests).toBe(0);
  await expect(page.getByRole("button", { name: "Entregar" }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: /Reintentar/i })).toHaveCount(0);

  failAnswerRequests = false;
  await page.getByRole("button", { name: "Entregar" }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Entregar" })
    .click();

  await expect(page.getByText(/Competencia terminada/i)).toBeVisible({
    timeout: 15000,
  });
  expect(submitRequests).toBe(1);

  await api.dispose();
});

test("results appear only after consolidating and publishing", async ({ page }) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);

  const endsAt = new Date(Date.now() + 90000);
  const contest = await createContest(api, headers, {
    durationMinutes: 1,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: endsAt.toISOString(),
  });

  const personalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  const expiredPersonalCode = await joinContest(
    api,
    headers,
    contest.id,
    contest.picked.grade,
    "Expired",
  );

  const expiredStart = await api.post(`${API}/api/play/start`, {
    data: { personalCode: expiredPersonalCode },
  });
  expect(expiredStart.ok(), await expiredStart.text()).toBe(true);
  const expiredAttempt = await api
    .get(`${API}/api/play/attempt/${expiredPersonalCode}`)
    .then((r) => r.json());
  expect(expiredAttempt.status).toBe("in_progress");
  await api.post(`${API}/api/play/start`, { data: { personalCode } });
  await api.post(`${API}/api/play/submit`, { data: { personalCode } });

  const beforePublish = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  expect(beforePublish.status).toBe("finished");
  expect(beforePublish.resultsPublished).toBe(false);
  expect(beforePublish.result).toBeNull();

  const tooEarly = await api.post(
    `${API}/api/contests/${contest.id}/consolidate`,
    { headers },
  );
  expect(tooEarly.status()).toBe(409);

  writeFileSync(
    E2E_CLOCK_FILE,
    new Date(endsAt.getTime() + 2000).toISOString(),
  );

  const consolidated = await api.post(
    `${API}/api/contests/${contest.id}/consolidate`,
    { headers },
  );
  expect(consolidated.ok()).toBe(true);
  const consolidatedContest = await consolidated.json();
  expect(consolidatedContest.state).toBe("consolidada");
  expect(consolidatedContest.closedAttempts).toBe(1);

  const adminResults = await api
    .get(`${API}/api/contests/${contest.id}/results`, { headers })
    .then((r) => r.json());
  expect(adminResults.state).toBe("consolidada");
  const expiredResult = adminResults.rows.find(
    (row: { elapsedSeconds: number | null }) => row.elapsedSeconds === 60,
  );
  expect(expiredResult?.elapsedSeconds).toBe(60);

  await page.addInitScript(
    ({ token }) => {
      window.localStorage.setItem("bebras_token", token);
      window.localStorage.setItem(
        "bebras_user",
        JSON.stringify({
          id: 0,
          email: "marko@bebras.bo",
          name: "Marko",
          role: "admin",
        }),
      );
    },
    { token: headers.authorization.replace("Bearer ", "") },
  );
  await page.goto(`/competencias/resultados?id=${contest.id}`);
  await expect(page.getByText("Consolidada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar resultados" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publicar resultados" })
    .click();
  await expect(page.getByRole("button", { name: "Ocultar resultados" })).toBeVisible();

  const afterPublish = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  expect(afterPublish.resultsPublished).toBe(true);
  expect(afterPublish.result).not.toBeNull();
  expect(afterPublish.result.rankPosition).toBe(1);
  expect(afterPublish.result.totalScore).toBe(contest.initialScore);
  expect(afterPublish.result.answeredCount).toBe(0);

  await page.getByRole("button", { name: "Ocultar resultados" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Ocultar resultados" })
    .click();
  await expect(page.getByRole("button", { name: "Publicar resultados" })).toBeVisible();

  const afterUnpublish = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  expect(afterUnpublish.resultsPublished).toBe(false);
  expect(afterUnpublish.result).toBeNull();

  await api.dispose();
});

test("blocks the panel for users without a session", async ({ page }) => {
  await page.goto("/competencias");
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});

test("filters navigation sections by user role", () => {
  expect(canAccessSiteNav("public")).toBe(true);
  expect(canAccessSiteNav("admin", "admin")).toBe(true);
  expect(canAccessSiteNav("staff", "admin")).toBe(true);
  expect(canAccessSiteNav("staff", "maestro")).toBe(true);
  expect(canAccessSiteNav("admin", "maestro")).toBe(false);
  expect(canAccessSiteNav("staff")).toBe(false);
});

test("keeps the new contest form within a mobile viewport", async ({ page }) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, { data: ADMIN });
  expect(loginResponse.ok()).toBe(true);
  const session = (await loginResponse.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/competencias/nueva");

  await expect(page.getByText("Datos generales", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  const mainBeforeMenu = await page.locator("main").boundingBox();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  const mobileNavigation = page.getByRole("navigation", {
    name: "Navegación principal",
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Desafíos" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Tareas" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Competencias" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    mobileNavigation.getByRole("link", { name: "Grupos" }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Maestros" }),
  ).toBeVisible();
  const mainWithMenu = await page.locator("main").boundingBox();
  expect(mainWithMenu!.y).toBeGreaterThan(mainBeforeMenu!.y);
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  await expect(mobileNavigation).toBeHidden();

  await page
    .getByRole("button", { name: /Ventana de disponibilidad/ })
    .click();
  const calendarBounds = await page.locator('[data-slot="calendar"]').boundingBox();
  expect(calendarBounds).not.toBeNull();
  expect(calendarBounds!.x).toBeGreaterThanOrEqual(0);
  expect(calendarBounds!.x + calendarBounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Agregar" }).first().click();
  await expect(page.getByRole("button", { name: "Quitar" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page
    .getByRole("link", { name: "Volver: Crear competencia" })
    .click();
  await expect(page).toHaveURL(/\/competencias\/?$/);

  await api.dispose();
});

test("keeps contest and task card actions responsive and compact", async ({
  page,
}) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, { data: ADMIN });
  expect(loginResponse.ok()).toBe(true);
  const session = (await loginResponse.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const headers = { authorization: `Bearer ${session.token}` };
  const listedContest = await createContest(api, headers, {
    title: `Responsive actions ${Date.now()}`,
    tasks: [
      { taskId: "seed-bebras-easy" },
      { taskId: "seed-bebras-medium" },
      { taskId: "seed-bebras-hard" },
    ],
  });
  const tasksResponse = await api.get(`${API}/api/tasks`, { headers });
  expect(tasksResponse.ok()).toBe(true);
  const listedTask = (
    (await tasksResponse.json()) as Array<{ id: string; title: string }>
  )[0];
  expect(listedTask).toBeDefined();

  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/competencias");

  const contestCard = page
    .getByText(listedContest.title, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const contestActions = [
    contestCard.getByRole("link", { name: "Resultados" }),
    contestCard.getByRole("link", { name: "Editar" }),
    contestCard.getByRole("button", { name: "Eliminar" }),
  ];
  const mobileContestActions = await Promise.all(
    contestActions.map((action) => action.boundingBox()),
  );
  expect(mobileContestActions[0]!.width).toBe(mobileContestActions[1]!.width);
  expect(mobileContestActions[1]!.width).toBe(mobileContestActions[2]!.width);
  expect(mobileContestActions[1]!.y).toBeGreaterThan(mobileContestActions[0]!.y);
  expect(mobileContestActions[2]!.y).toBeGreaterThan(mobileContestActions[1]!.y);
  const contestTasks = contestCard.locator('[data-slot="card-footer"] > div');
  await expect(contestTasks).toHaveCount(3);
  const mobileContestTasks = await Promise.all(
    [0, 1, 2].map((index) => contestTasks.nth(index).boundingBox()),
  );
  expect(mobileContestTasks[1]!.y).toBeGreaterThan(mobileContestTasks[0]!.y);
  expect(mobileContestTasks[2]!.y).toBeGreaterThan(mobileContestTasks[1]!.y);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopContestActions = await Promise.all(
    contestActions.map((action) => action.boundingBox()),
  );
  expect(desktopContestActions[0]!.width).toBeLessThan(160);
  expect(desktopContestActions[0]!.width).toBe(desktopContestActions[1]!.width);
  expect(desktopContestActions[1]!.width).toBe(desktopContestActions[2]!.width);
  expect(desktopContestActions[1]!.y).toBe(desktopContestActions[0]!.y);
  expect(desktopContestActions[1]!.x).toBeGreaterThan(desktopContestActions[0]!.x);
  expect(desktopContestActions[2]!.y).toBeGreaterThan(desktopContestActions[0]!.y);
  const desktopContestTasks = await Promise.all(
    [0, 1, 2].map((index) => contestTasks.nth(index).boundingBox()),
  );
  expect(desktopContestTasks[0]!.width).toBe(desktopContestTasks[1]!.width);
  expect(desktopContestTasks[0]!.y).toBe(desktopContestTasks[1]!.y);
  expect(desktopContestTasks[1]!.x).toBeGreaterThan(desktopContestTasks[0]!.x);
  expect(desktopContestTasks[2]!.y).toBeGreaterThan(desktopContestTasks[0]!.y);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/tareas");
  const taskCard = page
    .getByText(listedTask.title, { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const taskActions = [
    taskCard.getByRole("button", { name: /^(En práctica|Práctica)$/ }),
    taskCard.getByRole("link", { name: "Editar" }),
    taskCard.getByRole("link", { name: "Probar" }),
    taskCard.getByRole("button", { name: "Eliminar" }),
  ];
  const mobileTaskActions = await Promise.all(
    taskActions.map((action) => action.boundingBox()),
  );
  expect(mobileTaskActions[0]!.width).toBe(mobileTaskActions[1]!.width);
  expect(mobileTaskActions[1]!.width).toBe(mobileTaskActions[2]!.width);
  expect(mobileTaskActions[2]!.width).toBe(mobileTaskActions[3]!.width);
  expect(mobileTaskActions[1]!.y).toBeGreaterThan(mobileTaskActions[0]!.y);
  expect(mobileTaskActions[2]!.y).toBeGreaterThan(mobileTaskActions[1]!.y);
  expect(mobileTaskActions[3]!.y).toBeGreaterThan(mobileTaskActions[2]!.y);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopTaskActions = await Promise.all(
    taskActions.map((action) => action.boundingBox()),
  );
  expect(desktopTaskActions[0]!.width).toBeLessThan(160);
  expect(desktopTaskActions[0]!.width).toBe(desktopTaskActions[1]!.width);
  expect(desktopTaskActions[1]!.width).toBe(desktopTaskActions[2]!.width);
  expect(desktopTaskActions[2]!.width).toBe(desktopTaskActions[3]!.width);
  expect(desktopTaskActions[1]!.y).toBe(desktopTaskActions[0]!.y);
  expect(desktopTaskActions[1]!.x).toBeGreaterThan(desktopTaskActions[0]!.x);
  expect(desktopTaskActions[2]!.y).toBeGreaterThan(desktopTaskActions[0]!.y);
  expect(desktopTaskActions[3]!.y).toBe(desktopTaskActions[2]!.y);
  expect((await taskCard.boundingBox())!.height).toBeLessThan(260);

  await api.dispose();
});

test("keeps group and teacher cards responsive and compact", async ({ page }) => {
  const api = await request.newContext();
  const loginResponse = await api.post(`${API}/api/auth/login`, { data: ADMIN });
  expect(loginResponse.ok()).toBe(true);
  const session = (await loginResponse.json()) as {
    token: string;
    user: { id: number; email: string; name: string | null; role: string };
  };
  const now = new Date().toISOString();

  await page.route(`${API}/api/published-contests`, (route) =>
    route.fulfill({
      json: [
        {
          id: "responsive-contest",
          title: "Competencia responsive",
          category: "Capibara",
          startsAt: now,
          endsAt: new Date(Date.now() + 3600000).toISOString(),
        },
      ],
    }),
  );
  await page.route(`${API}/api/groups`, (route) =>
    route.fulfill({
      json: [
        {
          id: "responsive-group",
          name: "Grupo responsive",
          accessCode: "ABC123",
          contestId: "responsive-contest",
          contestTitle: "Competencia responsive",
          contestCategory: "Capibara",
          contestAllowPairs: true,
          scheduledAt: now,
          firstUsedAt: null,
          expiresAt: null,
          createdAt: now,
          teamCount: 1,
          teams: [
            {
              id: "responsive-team",
              participationMode: "individual",
              grade: "P3",
              memberOneFirstName: "Participante",
              memberOneLastName: "Con apellido extenso",
              memberTwoFirstName: null,
              memberTwoLastName: null,
              personalCode: "TEAM01",
              status: "registered",
              createdAt: now,
            },
          ],
        },
      ],
    }),
  );
  await page.route(`${API}/api/users/maestros`, (route) =>
    route.fulfill({
      json: [
        {
          id: 999,
          name: "Maestro responsive",
          email: "maestro.responsive.con.correo.extenso@example.com",
          status: "pending",
          schoolName: "Colegio de prueba responsive",
          institutionType: "school",
          phone: "70000000",
          isHomeschool: false,
          hasLetter: true,
          hasIdFront: true,
          hasIdBack: true,
          createdAt: now,
        },
      ],
    }),
  );
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem("bebras_token", token);
    window.localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/grupos");
  const groupCard = page
    .getByText("Grupo responsive", { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const groupActions = [
    groupCard.getByRole("button", { name: "Copiar enlace" }),
    groupCard.getByRole("button", { name: "Eliminar", exact: true }),
  ];
  const mobileGroupActions = await Promise.all(
    groupActions.map((action) => action.boundingBox()),
  );
  expect(mobileGroupActions[0]!.width).toBe(mobileGroupActions[1]!.width);
  expect(mobileGroupActions[1]!.y).toBeGreaterThan(mobileGroupActions[0]!.y);
  await groupCard.getByRole("button", { name: /1 equipo/ }).click();
  await expect(
    groupCard.getByRole("button", { name: "Editar participante" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopGroupActions = await Promise.all(
    groupActions.map((action) => action.boundingBox()),
  );
  expect(desktopGroupActions[0]!.width).toBeLessThan(160);
  expect(desktopGroupActions[0]!.width).toBe(desktopGroupActions[1]!.width);
  expect(desktopGroupActions[0]!.y).toBe(desktopGroupActions[1]!.y);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/maestros");
  const teacherCard = page
    .getByText("Maestro responsive", { exact: true })
    .locator('xpath=ancestor::*[@data-slot="card"][1]');
  const teacherActions = [
    teacherCard.getByRole("button", { name: "Ver carta" }),
    teacherCard.getByRole("button", { name: "Carnet anverso" }),
    teacherCard.getByRole("button", { name: "Carnet reverso" }),
    teacherCard.getByRole("button", { name: "Aprobar" }),
    teacherCard.getByRole("button", { name: "Rechazar" }),
  ];
  const mobileTeacherActions = await Promise.all(
    teacherActions.map((action) => action.boundingBox()),
  );
  for (let index = 1; index < mobileTeacherActions.length; index += 1) {
    expect(mobileTeacherActions[index]!.width).toBe(
      mobileTeacherActions[0]!.width,
    );
    expect(mobileTeacherActions[index]!.y).toBeGreaterThan(
      mobileTeacherActions[index - 1]!.y,
    );
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopTeacherActions = await Promise.all(
    teacherActions.map((action) => action.boundingBox()),
  );
  expect(desktopTeacherActions[0]!.width).toBeLessThan(170);
  expect(desktopTeacherActions[0]!.width).toBe(desktopTeacherActions[1]!.width);
  expect(desktopTeacherActions[0]!.y).toBe(desktopTeacherActions[1]!.y);
  expect(desktopTeacherActions[1]!.x).toBeGreaterThan(
    desktopTeacherActions[0]!.x,
  );
  expect((await teacherCard.boundingBox())!.height).toBeLessThan(260);

  await api.dispose();
});

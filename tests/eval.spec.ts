import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const API = "http://localhost:3100";
const UPLOADS_DIR = resolve(process.cwd(), "backend/uploads/letters");

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

test("results appear only after consolidating and publishing", async () => {
  test.setTimeout(180000);

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

  await new Promise((resolve) =>
    setTimeout(resolve, endsAt.getTime() - Date.now() + 2000),
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
  const expiredResult = adminResults.rows.find(
    (row: { elapsedSeconds: number | null }) => row.elapsedSeconds === 60,
  );
  expect(expiredResult?.elapsedSeconds).toBe(60);

  const published = await api.post(
    `${API}/api/contests/${contest.id}/results/publish`,
    { headers },
  );
  expect(published.ok()).toBe(true);
  expect((await published.json()).state).toBe("publicada");

  const afterPublish = await api
    .get(`${API}/api/play/attempt/${personalCode}`)
    .then((r) => r.json());
  expect(afterPublish.resultsPublished).toBe(true);
  expect(afterPublish.result).not.toBeNull();
  expect(afterPublish.result.rankPosition).toBe(1);
  expect(afterPublish.result.totalScore).toBe(contest.initialScore);
  expect(afterPublish.result.answeredCount).toBe(0);

  await api.dispose();
});

test("blocks the panel for users without a session", async ({ page }) => {
  await page.goto("/competencias");
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});

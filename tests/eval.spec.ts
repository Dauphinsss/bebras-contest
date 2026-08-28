import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
        answerType === "drag_drop"
          ? {
              id: `background-${suffix}`,
              name: "fondo.png",
              url: "data:image/png;base64,AA==",
            }
          : null,
      dragDropItems:
        answerType === "drag_drop"
          ? [
              {
                id: `item-${suffix}`,
                label: "Pieza",
                image: {
                  id: `image-${suffix}`,
                  name: "pieza.png",
                  url: "data:image/png;base64,AA==",
                },
                targetX: 50,
                targetY: 40,
                tolerance: 5,
              },
            ]
          : [],
      explanation: `Explicación ${answerType}`,
      status: "Borrador",
      isPractice: true,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
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
      task: tasks.find((task) => task.answerType === "drag_drop"),
      correct: {
        placements: {
          [tasks.find((task) => task.answerType === "drag_drop")
            .dragDropItems[0].id]: { x: 53, y: 36 },
        },
      },
      incorrect: {
        placements: {
          [tasks.find((task) => task.answerType === "drag_drop")
            .dragDropItems[0].id]: { x: 80, y: 80 },
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
      expect(detail.dragDropItems[0]).not.toHaveProperty("targetX");
      expect(detail.dragDropItems[0]).not.toHaveProperty("targetY");
      expect(detail.dragDropItems[0]).not.toHaveProperty("tolerance");
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

test("results appear only after consolidating and publishing", async () => {
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

import { expect, type APIRequestContext } from "@playwright/test";
import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export const API = "http://localhost:3100";
export const UPLOADS_DIR = resolve(process.cwd(), "backend/uploads/letters");
export const E2E_CLOCK_FILE = resolve(process.cwd(), "backend/test-clock.txt");

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "marko@bebras.bo",
  password: process.env.E2E_ADMIN_PASSWORD ?? "bebras2026",
};

export async function loginAdmin(api: APIRequestContext) {
  const login = await api
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((r) => r.json());
  return { authorization: `Bearer ${login.token}` };
}

export const SEEDED_TASK = {
  taskId: "seed-bebras-easy",
  category: "Capibara",
  grade: "P3",
};

export const SCORING_TASKS = [
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

export async function createContest(
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

export async function joinContest(
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

export function playHeaders(sessionToken: string) {
  return { "x-play-session": sessionToken };
}

export async function joinContestSession(
  api: APIRequestContext,
  headers: Record<string, string>,
  contestId: string,
  grade: string,
  firstName = "Playwright",
  lastName = "Tester",
) {
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId, name: "PW Group" },
    })
    .then((r) => r.json());

  const join = await api.post(`${API}/api/play/join`, {
    data: {
      accessCode: group.accessCode,
      participationMode: "individual",
      grade,
      memberOneFirstName: firstName,
      memberOneLastName: lastName,
    },
  });
  expect(join.ok(), await join.text()).toBe(true);

  const session = await api.post(`${API}/api/play/session`, {
    data: { accessCode: group.accessCode, firstName, lastName },
  });
  expect(session.ok(), await session.text()).toBe(true);

  return {
    accessCode: group.accessCode as string,
    personalCode: (await join.json()).personalCode as string,
    sessionToken: (await session.json()).sessionToken as string,
    firstName,
    lastName,
  };
}

export async function createScoringTask(
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

export async function submitScoringAttempt(
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

export function uploadedDocuments() {
  return readdirSync(UPLOADS_DIR).filter((name) => name !== ".gitkeep");
}

export function removeNewUploads(previous: string[]) {
  const existing = new Set(previous);
  for (const filename of uploadedDocuments()) {
    if (!existing.has(filename)) {
      rmSync(resolve(UPLOADS_DIR, filename), { force: true });
    }
  }
}

export function registrationFields(
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

export const VALID_PDF = {
  name: "carta.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n"),
};
export const VALID_JPG = {
  name: "anverso.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
};
export const VALID_PNG = {
  name: "reverso.png",
  mimeType: "image/png",
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

export function taskBlock(id: string, content: string) {
  return { id, type: "text", content, image: null, widthPercent: 100 };
}

export const DRAG_DROP_BACKGROUND = {
  id: "drag-background",
  name: "escenario.svg",
  url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Crect width='800' height='500' fill='%23e2e8f0'/%3E%3C/svg%3E",
};
export const DRAG_DROP_INPUT_TARGETS = [
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
export const DRAG_DROP_TARGETS = DRAG_DROP_INPUT_TARGETS.map((target) => ({
  ...target,
  x: Math.round(target.x * 1000) / 1000,
  y: Math.round(target.y * 1000) / 1000,
}));
export const DRAG_DROP_ITEMS = [
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

export const DRAG_DROP_CORRECT_PLACEMENTS = Object.fromEntries(
  DRAG_DROP_ITEMS.map((item) => [item.id, item.correctTargetId]),
);

export async function createPracticeTask(
  api: APIRequestContext,
  headers: Record<string, string>,
  answerType: "multiple_choice" | "short_text" | "range" | "drag_drop",
  overrides: Record<string, unknown> = {},
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
      ...overrides,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const task = await response.json();
  if (answerType === "drag_drop") {
    expect(task.dragDropTargets).toEqual(DRAG_DROP_TARGETS);
  }
  return task;
}

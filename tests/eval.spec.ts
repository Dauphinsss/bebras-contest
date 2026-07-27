import { test, expect, request, type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3000";

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

const RANGE_CATEGORY: Record<string, { category: string; grade: string }> = {
  "6–8": { category: "Guacamayo", grade: "P1" },
  "8–10": { category: "Capibara", grade: "P3" },
  "10–12": { category: "Titi", grade: "P5" },
  "12–14": { category: "Jucumari", grade: "S1" },
  "14–16": { category: "Yaguareté", grade: "S3" },
  "16–19": { category: "Kuntur", grade: "S5" },
};

async function pickScorableTask(
  api: APIRequestContext,
  headers: Record<string, string>,
) {
  const tasks = await api
    .get(`${API}/api/tasks`, { headers })
    .then((r) => r.json());

  for (const task of tasks) {
    for (const [range, target] of Object.entries(RANGE_CATEGORY)) {
      if (task.difficulties?.[range]) {
        return { taskId: task.id as string, ...target };
      }
    }
  }

  throw new Error("No hay ninguna tarea con dificultad asignada en el banco.");
}

async function createContest(
  api: APIRequestContext,
  headers: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  const picked = await pickScorableTask(api, headers);
  const taskId = picked.taskId;

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
        tasks: [{ taskId }],
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
) {
  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId, name: "PW Group" },
    })
    .then((r) => r.json());

  const join = await api
    .post(`${API}/api/play/join`, {
      data: {
        accessCode: group.accessCode,
        participationMode: "individual",
        grade,
        memberOneFirstName: "Playwright",
        memberOneLastName: "Tester",
      },
    })
    .then((r) => r.json());

  return join.personalCode as string;
}

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

  const endsAt = new Date(Date.now() + 70000);
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
  expect((await consolidated.json()).state).toBe("consolidada");

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

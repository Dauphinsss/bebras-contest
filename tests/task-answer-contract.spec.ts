import { expect, test } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import { signToken } from "../backend/src/lib/auth";
import {
  ADMIN,
  API,
  E2E_CLOCK_FILE,
  createPracticeTask,
  createContest,
  joinContestSession,
  loginAdmin,
  playHeaders,
} from "./support/helpers";

test.afterEach(() => rmSync(E2E_CLOCK_FILE, { force: true }));

test("private drafts use authenticated preview/check, preserve the storage contract and hide solutions", async ({
  request,
}) => {
  const headers = await loginAdmin(request);
  const task = await createPracticeTask(request, headers, "short_text", {
    isPractice: false,
  });
  expect(task.answerConfig).toEqual({});
  expect(task.answerKey).toEqual({});
  const teacher = {
    authorization: `Bearer ${signToken({ id: 99999, email: "test@example.com", role: "teacher" })}`,
  };
  for (const auth of [
    { headers: {}, status: 401 },
    { headers: teacher, status: 403 },
  ]) {
    expect(
      (
        await request.get(`${API}/api/tasks/${task.id}/preview`, {
          headers: auth.headers,
        })
      ).status(),
    ).toBe(auth.status);
    expect(
      (
        await request.post(`${API}/api/tasks/${task.id}/check`, {
          headers: auth.headers,
          data: { payload: { text: "Bebras" } },
        })
      ).status(),
    ).toBe(auth.status);
  }
  expect(
    (await request.get(`${API}/api/practice/tasks/${task.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`${API}/api/practice/tasks/${task.id}/check`, {
        data: { payload: { text: "Bebras" } },
      })
    ).status(),
  ).toBe(404);
  const preview = await request.get(`${API}/api/tasks/${task.id}/preview`, {
    headers,
  });
  expect(preview.ok()).toBe(true);
  const safe = await preview.json();
  expect(safe.answerConfig).toEqual({});
  for (const key of [
    "answerKey",
    "correctAnswerId",
    "shortAnswer",
    "rangeMin",
    "rangeMax",
    "dragDropSolutions",
  ])
    expect(safe).not.toHaveProperty(key);
  for (const [payload, correct] of [
    [{ text: " BEBRAS " }, true],
    [{ text: "Wrong" }, false],
    [{ text: "" }, false],
  ] as const) {
    const check = await request.post(`${API}/api/tasks/${task.id}/check`, {
      headers,
      data: { payload },
    });
    expect(check.status()).toBe(200);
    expect(await check.json()).toMatchObject({ correct });
  }
  expect(
    (
      await request.post(`${API}/api/tasks/${task.id}/check`, {
        headers,
        data: { payload: { text: [] } },
      })
    ).status(),
  ).toBe(400);
  for (const field of ["answerConfig", "answerKey"]) {
    const invalid = await request.put(`${API}/api/tasks/${task.id}`, {
      headers,
      data: { ...task, [field]: { secret: "solution" } },
    });
    expect(invalid.status()).toBe(400);
  }
  const update = await request.put(`${API}/api/tasks/${task.id}`, {
    headers,
    data: { ...task, title: "Contrato reabierto" },
  });
  expect(update.status()).toBe(200);
  const reopened = await request.get(`${API}/api/tasks/${task.id}`, {
    headers,
  });
  expect(await reopened.json()).toMatchObject({
    title: "Contrato reabierto",
    answerConfig: {},
    answerKey: {},
    shortAnswer: "Bebras",
    isPractice: false,
  });
  expect(
    (
      await request.get(`${API}/api/tasks/missing/preview`, { headers })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.post(`${API}/api/tasks/missing/check`, {
        headers,
        data: { payload: {} },
      })
    ).status(),
  ).toBe(404);
});

test("tester discards stale checks, clears feedback on changes/reset and retries request failures", async ({
  request,
  page,
}) => {
  const session = await request
    .post(`${API}/api/auth/login`, { data: ADMIN })
    .then((r) => r.json());
  const headers = { authorization: `Bearer ${session.token}` };
  const task = await createPracticeTask(request, headers, "short_text", {
    isPractice: false,
  });
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("bebras_token", token);
    localStorage.setItem("bebras_user", JSON.stringify(user));
  }, session);
  await page.goto(`/tareas/probador?id=${task.id}`);
  const input = page.getByRole("textbox", {
    name: "Tu respuesta",
    exact: true,
  });
  const result = page.locator("main").getByRole("alert");
  await input.fill("Bebras");
  let release!: () => void;
  let intercepted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  let delivered!: () => void;
  const finished = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  await page.route(
    `**/api/tasks/${task.id}/check`,
    async (route) => {
      const response = await route.fetch();
      intercepted();
      await gate;
      await route.fulfill({ response }).catch(() => undefined);
      delivered();
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await started;
  await expect(
    page.getByRole("button", { name: "Comprobando…" }),
  ).toBeDisabled();
  await input.fill("Otra respuesta");
  release();
  await finished;
  await expect(result).toHaveCount(0);
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(result.getByText("Incorrecto", { exact: true })).toBeVisible();
  await input.fill("Bebras");
  await expect(result).toHaveCount(0);
  await page.route(
    `**/api/tasks/${task.id}/check`,
    (route) =>
      route.fulfill({
        status: 503,
        json: { message: "Fallo temporal de prueba" },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(
    page.getByText("Fallo temporal de prueba", { exact: true }),
  ).toBeVisible();
  await expect(result).toHaveCount(0);
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(result.getByText("Correcto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reiniciar" }).click();
  await expect(input).toHaveValue("");
  await expect(result).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("Bebras");
  await page.getByRole("button", { name: "Probar respuesta" }).click();
  await expect(result.getByText("Correcto", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/task-contract-tester-mobile.png",
    fullPage: true,
  });
});

test("existing text, range and choice answers survive invalid saves and score identically in preview and contest", async ({
  request,
}) => {
  const headers = await loginAdmin(request);
  const cases = [
    {
      type: "multiple_choice",
      valid: { selected: ["B"] },
      invalid: { selected: ["unknown"] },
      empty: { selected: [] },
    },
    {
      type: "short_text",
      valid: { text: " BEBRAS " },
      invalid: { text: [] },
      empty: { text: " " },
    },
    {
      type: "range",
      valid: { value: "0" },
      invalid: { value: null },
      empty: { value: "" },
    },
  ] as const;
  const tasks = [];
  for (const entry of cases)
    tasks.push(
      await createPracticeTask(request, headers, entry.type, {
        rangeMin: 0,
        rangeMax: 10,
        difficulties: { "8–10": "easy" },
      }),
    );
  const now = Date.now();
  const contest = await createContest(request, headers, {
    tasks: tasks.map((task) => ({ taskId: task.id })),
    registrationStartsAt: new Date(now - 3600000).toISOString(),
    registrationEndsAt: new Date(now + 3600000).toISOString(),
    startsAt: new Date(now + 7200000).toISOString(),
    endsAt: new Date(now + 14400000).toISOString(),
  });
  const student = await joinContestSession(
    request,
    headers,
    contest.id,
    "P3",
    "Contrato",
  );
  writeFileSync(E2E_CLOCK_FILE, new Date(now + 7260000).toISOString());
  const studentHeaders = playHeaders(student.sessionToken);
  expect(
    (
      await request.post(`${API}/api/play/start`, {
        headers: studentHeaders,
        data: {},
      })
    ).ok(),
  ).toBe(true);
  const answers: Record<string, unknown> = {};
  for (const [index, entry] of cases.entries()) {
    const taskId = tasks[index].id;
    const save = (payload: unknown) =>
      request.post(`${API}/api/play/answer`, {
        headers: studentHeaders,
        data: { taskId, payload },
      });
    expect((await save(entry.valid)).status()).toBe(204);
    expect((await save(entry.invalid)).status()).toBe(400);
    const recovered = await request
      .get(`${API}/api/play/attempt`, { headers: studentHeaders })
      .then((r) => r.json());
    expect(recovered.answers[taskId]).toEqual(entry.valid);
    for (const task of recovered.tasks)
      expect(task).not.toHaveProperty("answerKey");
    expect((await save(entry.empty)).status()).toBe(204);
    const publicCheck = await request.post(
      `${API}/api/practice/tasks/${taskId}/check`,
      { data: { payload: entry.empty } },
    );
    expect(await publicCheck.json()).toMatchObject({ correct: false });
    expect((await save(entry.valid)).status()).toBe(204);
    answers[taskId] = entry.valid;
    const adminCheck = await request.post(`${API}/api/tasks/${taskId}/check`, {
      headers,
      data: { payload: entry.valid },
    });
    expect(await adminCheck.json()).toMatchObject({ correct: true });
  }
  const preview = await request
    .post(`${API}/api/contests/${contest.id}/preview/score`, {
      headers,
      data: { answers },
    })
    .then((r) => r.json());
  expect(preview).toMatchObject({ correctCount: 3, answeredCount: 3 });
  expect(
    (
      await request.post(`${API}/api/play/submit`, {
        headers: studentHeaders,
        data: {},
      })
    ).ok(),
  ).toBe(true);
  const results = await request
    .get(`${API}/api/contests/${contest.id}/results`, { headers })
    .then((r) => r.json());
  expect(results.rows).toContainEqual(
    expect.objectContaining({
      memberOneFirstName: "Contrato",
      correctCount: 3,
      answeredCount: 3,
      totalScore: preview.totalScore,
    }),
  );
});

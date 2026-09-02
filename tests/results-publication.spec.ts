import { test, expect, request } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import {
  API,
  E2E_CLOCK_FILE,
  SCORING_TASKS,
  loginAdmin,
  createContest,
  joinContest,
  joinContestSession,
  playHeaders,
} from "./support/helpers";

test.afterEach(() => {
  rmSync(E2E_CLOCK_FILE, { force: true });
});

test("results appear only after consolidating and publishing", async ({
  page,
}) => {
  const api = await request.newContext();
  const headers = await loginAdmin(api);

  const endsAt = new Date(Date.now() + 90000);
  const contest = await createContest(api, headers, {
    durationMinutes: 1,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: endsAt.toISOString(),
    tasks: SCORING_TASKS.map(({ taskId }) => ({ taskId })),
  });

  const participant = await joinContestSession(
    api,
    headers,
    contest.id,
    contest.picked.grade,
  );
  const studentHeaders = playHeaders(participant.sessionToken);
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
  await api.post(`${API}/api/play/start`, {
    headers: studentHeaders,
    data: {},
  });
  for (const [task, selected] of [
    [SCORING_TASKS[0], "B"],
    [SCORING_TASKS[1], "A"],
  ] as const) {
    const answer = await api.post(`${API}/api/play/answer`, {
      headers: studentHeaders,
      data: {
        taskId: task.taskId,
        payload: { selected: [selected] },
      },
    });
    expect(answer.status(), await answer.text()).toBe(204);
  }
  await api.post(`${API}/api/play/submit`, {
    headers: studentHeaders,
    data: {},
  });

  const beforePublish = await api
    .get(`${API}/api/play/attempt`, { headers: studentHeaders })
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
  await expect(page.getByText("Consolidado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publicar resultados" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publicar resultados" })
    .click();
  await expect(
    page.getByRole("button", { name: "Ocultar resultados" }),
  ).toBeVisible();

  const afterPublish = await api
    .get(`${API}/api/play/attempt`, { headers: studentHeaders })
    .then((r) => r.json());
  expect(afterPublish.resultsPublished).toBe(true);
  expect(afterPublish.result).not.toBeNull();
  expect(afterPublish.result.rankPosition).toBe(1);
  expect(afterPublish.result.totalScore).toBe(
    contest.initialScore +
      contest.tasks[0].maxScore +
      contest.tasks[1].minScore,
  );
  expect(afterPublish.result.correctCount).toBe(1);
  expect(afterPublish.result.answeredCount).toBe(2);
  expect(
    afterPublish.tasks.map((task: { correct: boolean | null }) => task.correct),
  ).toEqual([true, false, null]);

  await page.evaluate((sessionToken) => {
    window.localStorage.setItem("bebras_play_session", sessionToken);
  }, participant.sessionToken);
  await page.goto("/rendir");
  await expect(
    page.getByText("¡Desafío terminado!", { exact: true }),
  ).toBeVisible();

  const expectedStatuses = ["Correcta", "Incorrecta", "Sin responder"];
  for (const [index, task] of afterPublish.tasks.entries()) {
    const resultCard = page
      .getByRole("heading", {
        name: `${task.position}. ${task.title}`,
        exact: true,
      })
      .locator('xpath=ancestor::*[@data-slot="card"][1]');
    await expect(
      resultCard.getByText(expectedStatuses[index], { exact: true }),
    ).toBeVisible();
  }

  await page.goto(`/competencias/resultados?id=${contest.id}`);
  await expect(
    page.getByRole("button", { name: "Ocultar resultados" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ocultar resultados" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Ocultar resultados" })
    .click();
  await expect(
    page.getByRole("button", { name: "Publicar resultados" }),
  ).toBeVisible();

  const afterUnpublish = await api
    .get(`${API}/api/play/attempt`, { headers: studentHeaders })
    .then((r) => r.json());
  expect(afterUnpublish.resultsPublished).toBe(false);
  expect(afterUnpublish.result).toBeNull();

  await api.dispose();
});

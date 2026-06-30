import { test, expect, request } from "@playwright/test";

const API = "http://localhost:3000";

async function setupOpenContest() {
  const api = await request.newContext();
  const login = await api
    .post(`${API}/api/auth/login`, {
      data: { email: "marko@bebras.bo", password: "bebras2026" },
    })
    .then((r) => r.json());
  const headers = { authorization: `Bearer ${login.token}` };

  const tasks = await api.get(`${API}/api/tasks`, { headers }).then((r) => r.json());
  const taskId = tasks[0].id;

  const contest = await api
    .post(`${API}/api/contests`, {
      headers,
      data: {
        title: "PW Eval " + Date.now(),
        category: "Capibara",
        durationMinutes: 60,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        allowPairs: false,
        showFeedback: true,
        showSolutions: true,
        showTotalScore: true,
        tasks: [{ taskId, minScore: -2, noAnswerScore: 0, maxScore: 6 }],
      },
    })
    .then((r) => r.json());

  await api.post(`${API}/api/contests/${contest.id}/publish`, { headers });

  const group = await api
    .post(`${API}/api/groups`, {
      headers,
      data: { contestId: contest.id, name: "PW Group" },
    })
    .then((r) => r.json());

  const join = await api
    .post(`${API}/api/play/join`, {
      data: {
        accessCode: group.accessCode,
        participationMode: "individual",
        memberOneFirstName: "Playwright",
        memberOneLastName: "Tester",
      },
    })
    .then((r) => r.json());

  await api.dispose();
  return { personalCode: join.personalCode, contestId: contest.id };
}

test("student starts, answers, submits and sees the result", async ({ page }) => {
  const { personalCode } = await setupOpenContest();

  await page.goto(`/rendir?code=${personalCode}`);

  const startButton = page.getByRole("button", { name: /Empezar/i });
  await expect(startButton).toBeVisible();
  await startButton.click();

  await expect(page.getByText(/Tarea 1/i)).toBeVisible({ timeout: 15000 });

  const firstOption = page.locator(".cursor-pointer").first();
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
  await expect(page.getByText(/Puntaje:/i)).toBeVisible();
});

test("blocks the panel for users without a session", async ({ page }) => {
  await page.goto("/competencias");
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});

import { test, expect, request } from "@playwright/test";
import {
  API,
  loginAdmin,
  createContest,
  joinContest,
} from "./support/helpers";

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

test("blocks submission until failed answers can be saved", async ({
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
  await expect(
    page.getByRole("button", { name: "Entregar" }).first(),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: /Reintentar/i })).toHaveCount(
    0,
  );

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

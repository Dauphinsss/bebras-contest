import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  API,
  DRAG_DROP_BACKGROUND,
  DRAG_DROP_ITEMS,
  loginAdmin,
  loginAdminPage,
  taskBlock,
} from "./support/helpers";

// Match FileReader uploads while keeping the older URL-encoded fixtures in
// the existing suites to exercise their compatibility independently.
function uploadedImage(image: { id: string; name: string; url: string }) {
  const svg = decodeURIComponent(image.url.slice(image.url.indexOf(",") + 1));
  return {
    ...image,
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}

async function author(page: Page, kind: "text_cloze" | "drag_drop") {
  const headers = await loginAdmin(page.request);
  await loginAdminPage(page);
  const base = {
    title: `Autoría ${kind} ${Date.now()}`,
    categories: ["Algoritmos y programación"],
    difficulties: { "8–10": "easy" },
    bodyBlocks: [taskBlock("body", "Construye la respuesta.")],
    challengeBlocks: [taskBlock("challenge", "Completa la tarea.")],
    explanationBlocks: [
      taskBlock("explanation", "Se aceptan las configuraciones indicadas."),
    ],
    answerType: kind,
    isPractice: true,
  };
  const data =
    kind === "text_cloze"
      ? {
          ...base,
          challengeBlocks: [
            {
              ...taskBlock("challenge", "Primero y después."),
              richText: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Primero " },
                      { type: "taskBlank", attrs: { blankId: "first" } },
                      { type: "text", text: " y después " },
                      { type: "taskBlank", attrs: { blankId: "second" } },
                    ],
                  },
                ],
              },
            },
          ],
          answerConfig: {
            version: 1,
            options: ["white", "black"].map((id) => ({
              id,
              label: id === "white" ? "Blanca" : "Negra",
              image: null,
              limit: null,
            })),
            blanks: [
              { id: "first", allowedOptionIds: ["white"] },
              { id: "second", allowedOptionIds: ["white", "black"] },
            ],
          },
          answerKey: {
            version: 1,
            acceptedAssignments: [{ first: "white", second: "black" }],
          },
        }
      : {
          ...base,
          dragDropBackground: uploadedImage(DRAG_DROP_BACKGROUND),
          dragDropItems: DRAG_DROP_ITEMS.slice(0, 2).map((item, i) => ({
            ...item,
            image: uploadedImage(item.image),
            id: i ? "b" : "a",
            correctTargetId: i ? "two" : "one",
          })),
          dragDropTargets: ["one", "two", "three", "four", "five"].map(
            (id, i) => ({ id, x: 10 + i * 20, y: 50, snapRadius: 3 }),
          ),
          dragDropSolutions: [
            { id: "alt", placements: { a: "three", b: "two" } },
          ],
        };
  const response = await page.request.post(`${API}/api/tasks`, {
    headers,
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const task = await response.json();
  await page.goto(`/tareas/editar?id=${task.id}`);
  return { task, headers };
}

async function activate(locator: Locator, width: number) {
  if (width === 390) await locator.tap();
  else await locator.click();
}

async function save(page: Page, id: string, headers: Record<string, string>) {
  const response = page.waitForResponse(
    (r) =>
      r.url() === `${API}/api/tasks/${id}` && r.request().method() === "PUT",
  );
  const redirected = page.waitForURL((url) => url.pathname === "/tareas");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await redirected;
  const stored = await page.request.get(`${API}/api/tasks/${id}`, { headers });
  expect(stored.ok(), await stored.text()).toBe(true);
  return stored.json();
}

for (const width of [1280, 390]) {
  test.describe(`authoring refinement ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width === 390 });

    test("blank selection opens its panel; deletion cancels, confirms and restores metadata with native undo", async ({
      page,
    }) => {
      const { task, headers } = await author(page, "text_cloze");
      // AlertDialog hides the underlying form from the accessibility tree,
      // but its unchanged document must still be checked while confirmation is open.
      const editor = page.getByRole("textbox", {
        name: "Escribe el contenido de la consigna.",
        exact: true,
        includeHidden: true,
      });
      const second = editor.locator('[data-task-blank="second"]');
      const panel = page
        .locator("details")
        .filter({ has: page.getByLabel("Configurar hueco") });
      await activate(second, width);
      await expect(panel).toHaveAttribute("open", "");
      await expect(page.getByLabel("Configurar hueco")).toHaveValue("second");
      await expect(
        panel.getByRole("checkbox", { name: "Negra", exact: true }),
      ).toBeChecked();
      await panel
        .getByRole("checkbox", { name: "Blanca", exact: true })
        .uncheck();
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/authoring-${width}-blank-panel.png`,
        animations: "disabled",
      });
      await activate(second, width);
      await page.keyboard.press("Delete");
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("soluciones 1");
      await expect(editor.locator("[data-task-blank]")).toHaveCount(2);
      await page.screenshot({
        path: `test-results/authoring-${width}-blank-confirmation.png`,
        animations: "disabled",
      });
      await activate(
        dialog.getByRole("button", { name: "Cancelar", exact: true }),
        width,
      );
      await expect(dialog).toBeHidden();
      await expect(second).toHaveCount(1);
      await activate(second, width);
      await page.keyboard.press("Delete");
      await activate(
        dialog.getByRole("button", { name: "Eliminar", exact: true }),
        width,
      );
      await expect(second).toHaveCount(0);
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(second).toHaveCount(1);
      await expect(dialog).toBeHidden();
      await activate(second, width);
      await expect(page.getByLabel("Configurar hueco")).toHaveValue("second");
      await expect(
        panel.getByRole("checkbox", { name: "Blanca", exact: true }),
      ).not.toBeChecked();
      await expect(
        panel.getByRole("checkbox", { name: "Negra", exact: true }),
      ).toBeChecked();
      await expect(
        page.locator('[data-assignment-slot="second"]'),
      ).toHaveAccessibleName(/Negra$/);
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await expect(second).toHaveCount(0);
      await expect(dialog).toBeHidden();
      await page.keyboard.press("ControlOrMeta+z");
      await expect(second).toHaveCount(1);
      const stored = await save(page, task.id, headers);
      expect(stored.answerKey).toEqual(task.answerKey);
      expect(
        stored.answerConfig.blanks.find(
          (blank: { id: string }) => blank.id === "second",
        ).allowedOptionIds,
      ).toEqual(["black"]);
      await page.goto(`/tareas/editar?id=${task.id}`);
      await activate(second, width);
      await expect(page.getByLabel("Configurar hueco")).toHaveValue("second");
      await expect(
        panel.getByRole("checkbox", { name: "Blanca", exact: true }),
      ).not.toBeChecked();
    });

    test("new destinations are spaced and used target/piece deletion requires confirmation with solution impact", async ({
      page,
    }) => {
      const { task, headers } = await author(page, "drag_drop");
      const add = page.getByRole("button", {
        name: "Agregar destino",
        exact: true,
      });
      await activate(add, width);
      const x = page.getByLabel("Horizontal (%)", { exact: true });
      const y = page.getByLabel("Vertical (%)", { exact: true });
      const first = {
        x: Number(await x.inputValue()),
        y: Number(await y.inputValue()),
      };
      await activate(add, width);
      const second = {
        x: Number(await x.inputValue()),
        y: Number(await y.inputValue()),
      };
      expect(
        Math.hypot(first.x - second.x, first.y - second.y),
      ).toBeGreaterThanOrEqual(20);
      expect([first, second]).not.toContainEqual({ x: 50, y: 50 });
      const marker = page.getByRole("button", {
        name: "Mover destino 1",
        exact: true,
      });
      await marker.scrollIntoViewIfNeeded();
      const box = await marker.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(24);
      const stage = await page
        .locator("[data-drag-target-editor]")
        .boundingBox();
      const circle = await marker
        .locator('span[aria-hidden="true"]')
        .boundingBox();
      expect(circle!.width).toBeCloseTo(
        0.06 * Math.min(stage!.width, stage!.height),
        0,
      );
      const number = await marker
        .locator("[data-authoring-target-label]")
        .boundingBox();
      if (circle!.width < 24) {
        expect(number!.y + number!.height).toBeLessThanOrEqual(circle!.y);
      }
      await page.locator("[data-drag-target-editor]").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/authoring-${width}-destinations.png`,
        animations: "disabled",
      });
      await page
        .getByLabel("Destino a editar", { exact: true })
        .selectOption("two");
      const removeTarget = page.getByRole("button", {
        name: "Quitar destino 2",
        exact: true,
      });
      await activate(removeTarget, width);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText("Principal, Alterna 1");
      await expect(dialog).toContainText("sin colocar");
      await page.screenshot({
        path: `test-results/authoring-${width}-target-confirmation.png`,
        animations: "disabled",
      });
      await activate(
        dialog.getByRole("button", { name: "Cancelar", exact: true }),
        width,
      );
      await expect(
        page.getByText("2 piezas · 7 destinos", { exact: true }),
      ).toBeVisible();
      await activate(removeTarget, width);
      await activate(
        dialog.getByRole("button", { name: "Eliminar", exact: true }),
        width,
      );
      await expect(
        page.getByText("2 piezas · 6 destinos", { exact: true }),
      ).toBeVisible();
      await activate(
        page.getByRole("radio", { name: "Definir solución", exact: true }),
        width,
      );
      const solution = page.getByLabel("Solución válida", { exact: true });
      const b = page.getByLabel("Destino de la pieza 2", { exact: true });
      await expect(b).toHaveValue("");
      await solution.selectOption("alt");
      await expect(b).toHaveValue("");
      const removePiece = page.getByRole("button", {
        name: "Quitar pieza 1",
        exact: true,
      });
      await activate(removePiece, width);
      await expect(dialog).toContainText("Principal, Alterna 1");
      await expect(dialog).toContainText("No se puede deshacer");
      await activate(
        dialog.getByRole("button", { name: "Cancelar", exact: true }),
        width,
      );
      await expect(
        page.getByText("2 piezas · 6 destinos", { exact: true }),
      ).toBeVisible();
      await activate(removePiece, width);
      await activate(
        dialog.getByRole("button", { name: "Eliminar", exact: true }),
        width,
      );
      await expect(
        page.getByText("1 piezas · 6 destinos", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Destino de la pieza 1", { exact: true })
        .selectOption("five");
      await solution.selectOption("primary");
      await page
        .getByLabel("Destino de la pieza 1", { exact: true })
        .selectOption("four");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const stored = await save(page, task.id, headers);
      expect(
        stored.dragDropItems.map((item: { id: string }) => item.id),
      ).toEqual(["b"]);
      expect(stored.dragDropItems[0].correctTargetId).toBe("four");
      expect(stored.dragDropSolutions).toEqual([
        { id: "alt", placements: { b: "five" } },
      ]);
      expect(
        stored.dragDropTargets.map((target: { id: string }) => target.id),
      ).not.toContain("two");
    });

    test("measured piece warnings follow current solution and do not block saving geometry", async ({
      page,
    }) => {
      const { task, headers } = await author(page, "drag_drop");
      await page
        .getByLabel("Destino a editar", { exact: true })
        .selectOption("one");
      await page.getByLabel("Horizontal (%)", { exact: true }).fill("1");
      const warning = page.locator("[data-authoring-piece-geometry]");
      await expect(warning).toContainText("Pieza 1: sobrepasa el fondo");
      await activate(
        page.getByRole("radio", { name: "Definir solución", exact: true }),
        width,
      );
      await page
        .getByLabel("Solución válida", { exact: true })
        .selectOption("alt");
      await expect(warning).toHaveCount(0);
      await page
        .getByLabel("Solución válida", { exact: true })
        .selectOption("primary");
      await expect(warning).toContainText("Revisar Principal");
      await activate(
        page.getByRole("radio", { name: "Editar posiciones", exact: true }),
        width,
      );
      await page.getByLabel("Horizontal (%)", { exact: true }).fill("29");
      await expect(warning).toContainText("Piezas 1 y 2: se superponen");
      await expect(warning).toContainText("cubre el centro del destino");
      const stored = await save(page, task.id, headers);
      expect(
        stored.dragDropTargets.find(
          (target: { id: string }) => target.id === "one",
        ).x,
      ).toBe(29);
    });

    test("duplicates the current alternative, warns before save and edits the copy independently", async ({
      page,
    }) => {
      const { task, headers } = await author(page, "drag_drop");
      await activate(
        page.getByRole("radio", { name: "Definir solución", exact: true }),
        width,
      );
      const solution = page.getByLabel("Solución válida", { exact: true });
      await solution.selectOption("alt");
      await page
        .getByLabel("Destino de la pieza 1", { exact: true })
        .selectOption("four");
      await activate(
        page.getByRole("button", { name: "Duplicar Alterna 1", exact: true }),
        width,
      );
      const copyId = await solution.inputValue();
      expect(copyId).not.toBe("primary");
      expect(copyId).not.toBe("alt");
      await expect(
        page.getByLabel("Destino de la pieza 1", { exact: true }),
      ).toHaveValue("four");
      await expect(
        page.getByText(/Soluciones repetidas: Alterna 2: igual a Alterna 1/),
      ).toBeVisible();
      await page
        .getByText(/Soluciones repetidas: Alterna 2: igual a Alterna 1/)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/authoring-${width}-solution-copy.png`,
        animations: "disabled",
      });
      await page
        .getByLabel("Destino de la pieza 1", { exact: true })
        .selectOption("five");
      await expect(page.getByText(/Soluciones repetidas:/)).toHaveCount(0);
      await solution.selectOption("alt");
      await expect(
        page.getByLabel("Destino de la pieza 1", { exact: true }),
      ).toHaveValue("four");
      await solution.selectOption("primary");
      await expect(
        page.getByLabel("Destino de la pieza 1", { exact: true }),
      ).toHaveValue("one");
      const stored = await save(page, task.id, headers);
      expect(stored.dragDropItems).toEqual(task.dragDropItems);
      expect(stored.dragDropSolutions).toEqual([
        { id: "alt", placements: { a: "four", b: "two" } },
        { id: copyId, placements: { a: "five", b: "two" } },
      ]);
      await page.goto(`/tareas/editar?id=${task.id}`);
      await activate(
        page.getByRole("radio", { name: "Definir solución", exact: true }),
        width,
      );
      await solution.selectOption(copyId);
      await expect(
        page.getByLabel("Destino de la pieza 1", { exact: true }),
      ).toHaveValue("five");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  });
}

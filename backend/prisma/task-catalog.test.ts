import assert from "node:assert/strict";
import test from "node:test";
import { catalogTaskData, loadCatalogTaskData } from "./task-catalog";

test("loads the complete checked-in catalog into Prisma rows", () => {
  const tasks = loadCatalogTaskData();
  const task = (id: string) => tasks.find((candidate) => candidate.id === id)!;
  assert.equal(tasks.length, 43);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 43);
  assert.equal(
    tasks.some((task) => task.id?.startsWith("seed-bebras-")),
    false,
  );
  // Las siete que la migración no deriva del PDF ya están redactadas a mano con
  // su tipo interactivo, así que ninguna sigue en cuarentena.
  assert.deepEqual(
    tasks.filter((task) => task.isPractice === false).map((task) => task.id),
    [],
  );
  assert.deepEqual(
    tasks
      .filter((task) =>
        ["image_hotspot", "state_grid", "text_cloze"].includes(
          task.answerType ?? "",
        ),
      )
      .map((task) => task.id)
      .sort(),
    [
      "bebras-2024-04-caminando-bosque",
      "bebras-2024-09-tubo-canicas",
      "bebras-2024-11-dibujando-barquitos",
      "bebras-2024-19-dias-soleados",
      "bebras-2024-31-secuencia-pelotas",
      "bebras-2024-37-dias-soleados-2",
      "bebras-2024-40-explorando",
    ],
  );
  assert.equal(
    tasks.reduce(
      (count, current) =>
        count +
        (
          JSON.parse(current.explanationBlocks ?? "[]") as Array<{ id: string }>
        ).filter((block) => block.id === `${current.id}-solution-image-block`)
          .length,
      0,
    ),
    25,
  );

  for (const [id, targetCount] of [
    ["bebras-2024-14-camino-de-robot", 10],
    ["bebras-2024-34-puntos-por-letras", 12],
  ] as const) {
    const dragDrop = task(id);
    assert.equal(dragDrop.answerType, "drag_drop");
    assert.equal(
      (JSON.parse(dragDrop.dragDropItems ?? "[]") as { targets: unknown[] })
        .targets.length,
      targetCount,
    );
  }
  assert.equal(task("bebras-2024-43-palago").correctAnswerId, "single:D");
});

test("maps all persisted answer fields, configuration and key included", () => {
  const data = catalogTaskData({
    id: "cloze-task",
    title: "Cloze",
    categories: ["Algoritmos y programación"],
    difficulties: { "8–10": "easy" },
    bodyBlocks: [{ id: "body" }],
    challengeBlocks: [{ id: "challenge" }],
    answerType: "text_cloze",
    answerConfig: { unit: "steps" },
    answerKey: { tolerance: 1 },
    answers: [],
    correctAnswerId: "",
    isPractice: false,
  });

  assert.equal(data.answerConfig, JSON.stringify({ unit: "steps" }));
  assert.equal(data.answerKey, JSON.stringify({ tolerance: 1 }));
  assert.equal(data.isPractice, false);
});

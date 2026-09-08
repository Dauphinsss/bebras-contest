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
  assert.deepEqual(
    tasks
      .filter((task) => task.isPractice === false)
      .map((task) => task.id)
      .sort(),
    [
      "bebras-2024-04-caminando-bosque",
      "bebras-2024-09-tubo-canicas",
      "bebras-2024-11-dibujando-barquitos",
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

test("maps all persisted answer fields without discarding numeric ranges", () => {
  const data = catalogTaskData({
    id: "range-task",
    title: "Range",
    categories: ["Algoritmos y programación"],
    difficulties: { "8–10": "easy" },
    bodyBlocks: [{ id: "body" }],
    challengeBlocks: [{ id: "challenge" }],
    answerType: "range",
    answerConfig: { unit: "steps" },
    answerKey: { tolerance: 1 },
    answers: [],
    correctAnswerId: "",
    rangeMin: 2,
    rangeMax: 5,
    isPractice: false,
  });

  assert.equal(data.rangeMin, 2);
  assert.equal(data.rangeMax, 5);
  assert.equal(data.answerConfig, JSON.stringify({ unit: "steps" }));
  assert.equal(data.answerKey, JSON.stringify({ tolerance: 1 }));
  assert.equal(data.isPractice, false);
});

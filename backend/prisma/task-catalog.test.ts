import assert from "node:assert/strict";
import test from "node:test";
import { catalogTaskData, loadCatalogTaskData } from "./task-catalog";

test("loads the complete checked-in catalog into Prisma rows", () => {
  const tasks = loadCatalogTaskData();
  assert.equal(tasks.length, 43);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 43);
  assert.equal(
    tasks.some((task) => task.id?.startsWith("seed-bebras-")),
    false,
  );
  assert.equal(tasks.filter((task) => task.isPractice === false).length, 6);
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

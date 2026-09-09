import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHotspotConfig,
  parseHotspotKey,
  shapeContains,
  validateHotspotAnswer,
  type HotspotConfig,
} from "../backend/src/lib/task-answers/image-hotspot";
import {
  parseHotspotConfig as clientParse,
  shapeContains as clientContains,
} from "../frontend/src/lib/image-hotspot";
import { answerHasResponse } from "../backend/src/lib/task-answers/presence";
import { answerHasResponse as clientPresence } from "../frontend/src/lib/answer-presence";
import { answerIsCorrect } from "../backend/src/lib/task-answers/grading";
import { renderSafeTask } from "../backend/src/lib/task-answers/public-task";
import { parseTaskAnswerConfig } from "../backend/src/lib/task-answers/config";
import type { PlayTask } from "../backend/src/lib/task-answers/types";

const config: HotspotConfig = {
  version: 1,
  image: { id: "image", name: "board.png", url: "data:image/png;base64,AA==" },
  imageWidth: 600,
  imageHeight: 300,
  regions: [
    {
      id: "one",
      label: "Punto uno",
      shapes: [{ type: "circle", x: 20, y: 30, radius: 8 }],
    },
    {
      id: "two",
      label: "Punto dos",
      shapes: [{ type: "circle", x: 60, y: 30, radius: 8 }],
    },
    {
      id: "path",
      label: "Camino",
      shapes: [
        {
          type: "polygon",
          points: [
            { x: 10, y: 60 },
            { x: 80, y: 60 },
            { x: 80, y: 75 },
            { x: 10, y: 75 },
          ],
        },
      ],
    },
  ],
};
const key = { version: 1, acceptedRegionIds: ["one", "two"] };
const task: PlayTask = {
  id: "hotspot",
  title: "Test",
  bodyBlocks: [],
  challengeBlocks: [],
  answerType: "image_hotspot",
  answerConfig: config,
  answerKey: key,
  answers: [],
  multipleChoiceOrderMode: "fixed",
  correctAnswerId: "",
  shortAnswer: "",
  rangeMin: null,
  rangeMax: null,
  dragDropBackground: null,
  dragDropItems: [],
  dragDropTargets: [],
  dragDropSolutions: [],
  dragDropVersion: 2,
};

test("circle geometry respects the short side at different aspect ratios and includes boundaries", () => {
  for (const [point, hit] of [
    [{ x: 24, y: 30 }, true],
    [{ x: 24.1, y: 30 }, false],
    [{ x: 20, y: 38 }, true],
    [{ x: 20, y: 38.1 }, false],
  ] as const) {
    assert.equal(
      shapeContains(config.regions[0].shapes[0], point, 600, 300),
      hit,
    );
    assert.equal(
      clientContains(config.regions[0].shapes[0], point, 600, 300),
      hit,
    );
  }
  assert.equal(
    shapeContains(
      { type: "circle", x: 50, y: 50, radius: 10 },
      { x: 60, y: 50 },
      300,
      600,
    ),
    true,
  );
  assert.equal(
    shapeContains(
      { type: "circle", x: 50, y: 50, radius: 10 },
      { x: 50, y: 56 },
      300,
      600,
    ),
    false,
  );
  for (const x of [10, 40, 80])
    assert.equal(
      shapeContains(config.regions[2].shapes[0], { x, y: 60 }, 600, 300),
      true,
    );
});

test("accepts either correct region, rejects other/empty/malformed answers and keeps presence in sync", () => {
  for (const [regionId, correct] of [
    ["one", true],
    ["two", true],
    ["path", false],
    [null, false],
  ] as const) {
    const payload = { version: 1, regionId };
    assert.equal(answerIsCorrect(task, payload), correct);
    assert.equal(validateHotspotAnswer(config, payload), true);
    assert.equal(
      answerHasResponse("image_hotspot", payload),
      regionId !== null,
    );
    assert.equal(clientPresence("image_hotspot", payload), regionId !== null);
  }
  for (const payload of [
    null,
    [],
    {},
    { version: 2, regionId: "one" },
    { version: 1, regionId: "missing" },
    { version: 1, regionId: 12 },
    { version: 1, regionId: ["one", "two"] },
    { version: 1, regionId: "one", extra: true },
  ]) {
    assert.equal(answerIsCorrect(task, payload), false);
    assert.equal(validateHotspotAnswer(config, payload), false);
  }
});

test("validates polygon topology, finite coordinates, bounds, IDs and solution references", () => {
  assert.deepEqual(clientParse(config), parseHotspotConfig(config));
  const invalid = [
    { ...config, version: 2 },
    { ...config, imageWidth: 0 },
    { ...config, regions: [] },
    { ...config, regions: [config.regions[0], config.regions[0]] },
    {
      ...config,
      regions: [
        {
          id: "a",
          label: "A",
          shapes: [{ type: "circle", x: 0, y: 0, radius: 8 }],
        },
      ],
    },
    {
      ...config,
      regions: [
        {
          id: "a",
          label: "A",
          shapes: [{ type: "circle", x: 30, y: 30, radius: NaN }],
        },
      ],
    },
    {
      ...config,
      regions: [
        {
          id: "a",
          label: "A",
          shapes: [
            {
              type: "polygon",
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 20 },
              ],
            },
          ],
        },
      ],
    },
    {
      ...config,
      regions: [
        {
          id: "a",
          label: "A",
          shapes: [
            {
              type: "polygon",
              points: [
                { x: 10, y: 10 },
                { x: 40, y: 40 },
                { x: 10, y: 40 },
                { x: 40, y: 10 },
              ],
            },
          ],
        },
      ],
    },
  ];
  for (const c of invalid) {
    assert.throws(() => parseHotspotConfig(c));
    assert.throws(() => clientParse(c));
  }
  for (const ids of [[], ["missing"], ["one", "one"]])
    assert.throws(() =>
      parseHotspotKey({ version: 1, acceptedRegionIds: ids }, config),
    );
});

test("rejects collisions across regions but allows multiple geometries of the same region", () => {
  const polygon = config.regions[2].shapes[0];
  for (const shapes of [
    [{ type: "circle", x: 22, y: 30, radius: 8 }],
    [
      {
        type: "polygon",
        points: [
          { x: 15, y: 25 },
          { x: 25, y: 25 },
          { x: 25, y: 35 },
          { x: 15, y: 35 },
        ],
      },
    ],
    [polygon],
  ])
    assert.throws(() =>
      parseHotspotConfig({
        ...config,
        regions: [
          ...config.regions,
          { id: "collision", label: "Conflicto", shapes },
        ],
      }),
    );
  assert.doesNotThrow(() =>
    parseHotspotConfig({
      ...config,
      regions: [
        {
          ...config.regions[0],
          shapes: [...config.regions[0].shapes, ...config.regions[0].shapes],
        },
      ],
    }),
  );
});

test("persists the versioned config/key and explicitly removes private properties from public data", () => {
  const parsed = parseTaskAnswerConfig({
    answerType: "image_hotspot",
    answerConfig: config,
    answerKey: key,
  });
  assert.deepEqual(JSON.parse(parsed.answerKey), key);
  assert.deepEqual(JSON.parse(parsed.answerConfig), config);
  const poisoned = {
    ...config,
    solution: "SECRET",
    regions: config.regions.map((r) => ({
      ...r,
      correct: true,
      shapes: r.shapes.map((s) => ({ ...s, answer: "SECRET" })),
    })),
  };
  const safe = renderSafeTask(
    { position: 1 },
    { ...task, answerConfig: poisoned },
  );
  assert.equal("answerKey" in safe, false);
  assert.equal(JSON.stringify(safe).includes("SECRET"), false);
  assert.deepEqual(safe.answerConfig, config);
});

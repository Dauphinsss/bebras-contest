import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  AGE_RANGES,
  CATEGORY_ALIASES,
  MASTER_TASK_IDS,
  QUARANTINED_TASK_IDS,
  SOLUTION_IMAGE_TASK_IDS,
  TASK_METADATA,
  createSolutionImageBlock,
  serializeCatalog,
  validateCatalog,
} from "./catalog-migration";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function textBlock(id: string, content = "Content") {
  return { id, type: "text", content, image: null, widthPercent: 100 };
}

function syntheticCatalog() {
  return TASK_METADATA.map((metadata) => {
    const explanationBlocks: unknown[] = [
      textBlock(
        metadata.master
          ? `${metadata.id}-master-explanation`
          : `${metadata.id}-explanation-text`,
        "Explanation",
      ),
    ];
    if (metadata.hasSolutionImage) {
      explanationBlocks.push(createSolutionImageBlock(metadata.id, PNG));
    }

    const common = {
      id: metadata.id,
      title: metadata.title,
      country: metadata.country,
      year: metadata.year,
      sourceTaskCode: metadata.sourceTaskCode,
      categories: ["Algoritmos y programación"],
      difficulties: metadata.difficulties,
      bodyBlocks: [textBlock(`${metadata.id}-body`)],
      challengeBlocks: [
        {
          id: `${metadata.id}-challenge`,
          type: "challenge",
          content: "Question",
          image: null,
          widthPercent: 100,
        },
      ],
      explanationBlocks,
      isPractice: !QUARANTINED_TASK_IDS.has(metadata.id),
    };

    if (metadata.number === 14 || metadata.number === 34) {
      return {
        ...common,
        answerType: "drag_drop",
        answers: [],
        correctAnswerId: "",
        shortAnswer: "",
        dragDropBackground: {
          id: `${metadata.id}-background-image`,
          name: "background.png",
          url: PNG,
        },
        dragDropTargets: [
          { id: `${metadata.id}-target`, x: 50, y: 50, snapRadius: 10 },
        ],
        dragDropItems: [
          {
            id: `${metadata.id}-item`,
            label: "Item",
            image: {
              id: `${metadata.id}-item-image`,
              name: "item.png",
              url: PNG,
            },
            widthPercent: 10,
            correctTargetId: `${metadata.id}-target`,
          },
        ],
        dragDropSolutions: [],
      };
    }

    const correct = metadata.number === 43 ? "D" : "A";
    return {
      ...common,
      answerType: "multiple_choice",
      multipleChoiceOrderMode: "fixed",
      answers: [
        {
          id: "A",
          blocks: [textBlock(`${metadata.id}-answer-a`, "A")],
          isCorrect: correct === "A",
        },
        {
          id: "D",
          blocks: [textBlock(`${metadata.id}-answer-d`, "D")],
          isCorrect: correct === "D",
        },
      ],
      correctAnswerId: `single:${correct}`,
    };
  });
}

function taskByNumber(catalog: Array<Record<string, unknown>>, number: number) {
  return catalog[number - 1];
}

test("verified metadata covers all 43 booklet tasks", () => {
  assert.deepEqual(
    TASK_METADATA.map((task) => task.number),
    Array.from({ length: 43 }, (_, index) => index + 1),
  );
  assert.equal(new Set(TASK_METADATA.map((task) => task.id)).size, 43);
  assert.equal(
    new Set(TASK_METADATA.map((task) => task.sourceTaskCode)).size,
    43,
  );
  assert.equal(MASTER_TASK_IDS.size, 21);
  assert.equal(SOLUTION_IMAGE_TASK_IDS.size, 25);
  for (const task of TASK_METADATA) {
    assert.deepEqual(Object.keys(task.difficulties), AGE_RANGES);
  }

  const task14 = TASK_METADATA[13];
  assert.equal(task14.sourceTaskCode, "2024-PL-04");
  assert.deepEqual(Object.values(task14.difficulties), [
    "",
    "hard",
    "hard",
    "medium",
    "",
    "",
  ]);
  assert.equal(TASK_METADATA[41].sourceTaskCode, "2019-VN-04");
  assert.equal(TASK_METADATA[42].country, "Hungría");
  assert.deepEqual(Object.values(TASK_METADATA[10].difficulties), [
    "",
    "easy",
    "easy",
    "",
    "",
    "",
  ]);
  for (const legacyCategory of [
    "Algoritmos y programación",
    "Estructuras de datos y representaciones",
    "Estructuras de datos y lógica",
    "Procesos computacionales y hardware",
    "Comunicación y redes",
    "Pensamiento computacional",
    "Estructuras de datos",
    "Optimización",
    "Tipos de datos",
    "Autómatas y lenguajes",
    "Sistemas y estados",
    "Codificación binaria",
    "Criptografía",
    "Ordenamiento",
    "Teoría de grafos",
    "Teoría de juegos",
    "Estrategia algorítmica",
  ]) {
    assert.ok(Object.hasOwn(CATEGORY_ALIASES, legacyCategory));
  }
});

test("validator accepts a complete deterministic catalog", () => {
  const catalog = syntheticCatalog();
  assert.doesNotThrow(() => validateCatalog(catalog));
  assert.ok(serializeCatalog(catalog).endsWith("\n"));
});

test("validator rejects unknown categories and unsupported fields", () => {
  const unknownCategory = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  unknownCategory[0].categories = ["Unknown"];
  assert.throws(
    () => validateCatalog(unknownCategory),
    /non-canonical category/,
  );

  const unsupported = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  unsupported[0].status = "Borrador";
  assert.throws(
    () => validateCatalog(unsupported),
    /unsupported fields: status/,
  );
});

test("validator rejects duplicate numbering and a wrong quarantine set", () => {
  const duplicate = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  duplicate[1].id = duplicate[0].id;
  assert.throws(
    () => validateCatalog(duplicate),
    /duplicate task id|booklet task/,
  );

  const quarantine = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  taskByNumber(quarantine, 4).isPractice = true;
  assert.throws(() => validateCatalog(quarantine), /exact quarantine set/);
});

test("validator rejects invalid PNG data and solution image identifiers", () => {
  const badPng = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  const explanationBlocks = taskByNumber(badPng, 1).explanationBlocks as Array<
    Record<string, unknown>
  >;
  const solution = explanationBlocks.find(
    (block) =>
      block.id === "bebras-2024-01-caja-de-pulseras-solution-image-block",
  )!;
  (solution.image as Record<string, unknown>).url =
    "data:image/png;base64,invalid";
  assert.throws(() => validateCatalog(badPng), /not a PNG data URL/);

  const badId = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  const badIdBlocks = taskByNumber(badId, 2).explanationBlocks as Array<
    Record<string, unknown>
  >;
  const badIdSolution = badIdBlocks.find(
    (block) => block.id === "bebras-2024-02-la-pelota-solution-image-block",
  )!;
  (badIdSolution.image as Record<string, unknown>).id = "random-id";
  assert.throws(
    () => validateCatalog(badId),
    /solution image identifiers are not deterministic/,
  );
});

test("validator protects task 14, task 34, and Palago answer contracts", () => {
  for (const number of [14, 34]) {
    const catalog = structuredClone(syntheticCatalog()) as Array<
      Record<string, unknown>
    >;
    const task = taskByNumber(catalog, number);
    task.answerType = "multiple_choice";
    task.multipleChoiceOrderMode = "fixed";
    task.answers = [
      {
        id: "A",
        blocks: [textBlock(`${String(task.id)}-replacement-a`, "A")],
        isCorrect: true,
      },
      {
        id: "B",
        blocks: [textBlock(`${String(task.id)}-replacement-b`, "B")],
        isCorrect: false,
      },
    ];
    task.correctAnswerId = "single:A";
    assert.throws(() => validateCatalog(catalog), /must remain drag_drop/);
  }

  const palagoCatalog = structuredClone(syntheticCatalog()) as Array<
    Record<string, unknown>
  >;
  const palago = taskByNumber(palagoCatalog, 43);
  palago.correctAnswerId = "single:A";
  const answers = palago.answers as Array<Record<string, unknown>>;
  for (const answer of answers) answer.isCorrect = answer.id === "A";
  assert.throws(
    () => validateCatalog(palagoCatalog),
    /Palago must use multiple_choice with single:D/,
  );
});

const legacyPathFromEnvironment = process.env.BEBRAS_LEGACY_JSON;

test(
  "CLI migrates the actual master catalog without altering master fields",
  { skip: legacyPathFromEnvironment ? false : "BEBRAS_LEGACY_JSON is not set" },
  () => {
    const backendDirectory = path.resolve(__dirname, "..");
    const currentPath = path.resolve(__dirname, "seed/bebras-tasks.json");
    const legacyPath = path.resolve(legacyPathFromEnvironment!);
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "bebras-catalog-test-"),
    );
    const checkOutputPath = path.join(temporaryDirectory, "check-only.json");
    const outputPath = path.join(temporaryDirectory, "migrated.json");

    try {
      const checkResult = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.resolve(__dirname, "migrate-catalog.ts"),
          "--check",
          legacyPath,
          currentPath,
          checkOutputPath,
        ],
        { cwd: backendDirectory, encoding: "utf8" },
      );
      assert.equal(checkResult.status, 0, checkResult.stderr);
      assert.match(
        checkResult.stdout,
        /Validated 43 tasks; no file was written/,
      );
      assert.equal(fs.existsSync(checkOutputPath), false);

      const migrationResult = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.resolve(__dirname, "migrate-catalog.ts"),
          legacyPath,
          currentPath,
          outputPath,
        ],
        { cwd: backendDirectory, encoding: "utf8" },
      );
      assert.equal(migrationResult.status, 0, migrationResult.stderr);

      const outputText = fs.readFileSync(outputPath, "utf8");
      const migrated = JSON.parse(outputText) as Array<Record<string, unknown>>;
      const current = JSON.parse(fs.readFileSync(currentPath, "utf8")) as Array<
        Record<string, unknown>
      >;
      assert.equal(outputText, serializeCatalog(migrated));
      assert.equal(migrated.length, 43);
      assert.equal(
        migrated.filter((task) => !MASTER_TASK_IDS.has(String(task.id))).length,
        22,
      );
      assert.equal(
        migrated.some((task) => task.id === "bebras-2024-14-camino-robot"),
        false,
      );

      if (current.length === 43) {
        assert.deepEqual(migrated, current);
      } else {
        for (const master of current) {
          const migratedMaster = structuredClone(
            migrated.find((task) => task.id === master.id)!,
          );
          delete migratedMaster.sourceTaskCode;
          if (SOLUTION_IMAGE_TASK_IDS.has(String(master.id))) {
            const blocks = migratedMaster.explanationBlocks as Array<
              Record<string, unknown>
            >;
            const appended = blocks.pop();
            assert.equal(
              appended?.id,
              `${String(master.id)}-solution-image-block`,
            );
          }
          assert.deepEqual(migratedMaster, master);
        }
      }

      assert.equal(taskByNumber(migrated, 14).answerType, "drag_drop");
      assert.equal(taskByNumber(migrated, 34).answerType, "drag_drop");
      assert.equal(taskByNumber(migrated, 35).answerType, "short_text");
      assert.equal(taskByNumber(migrated, 43).correctAnswerId, "single:D");
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  },
);

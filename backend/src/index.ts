import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";

const app = express();
const port = Number(process.env.PORT) || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4321";

function serializeJson(value: unknown) {
  return JSON.stringify(value);
}

function deserializeCategories(value: unknown) {
  const rawValue = String(value ?? "[]");

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return rawValue ? [rawValue] : [];
  }
}

function deserializeTask(task: {
  category: unknown;
  difficulties: unknown;
  bodyBlocks: unknown;
  challengeBlocks: unknown;
  answerType?: unknown;
  answers: unknown;
  shortAnswer?: unknown;
  rangeAnswers?: unknown;
  dragDropBackground?: unknown;
  dragDropItems?: unknown;
  multipleChoiceOrderMode?: unknown;
  [key: string]: unknown;
}) {
  return {
    ...task,
    categories: deserializeCategories(task.category),
    difficulties: JSON.parse(String(task.difficulties ?? "{}")),
    bodyBlocks: JSON.parse(String(task.bodyBlocks ?? "[]")),
    challengeBlocks: JSON.parse(String(task.challengeBlocks ?? "[]")),
    answerType: String(task.answerType ?? "multiple_choice"),
    answers: JSON.parse(String(task.answers ?? "[]")),
    shortAnswer: String(task.shortAnswer ?? ""),
    rangeAnswers: JSON.parse(String(task.rangeAnswers ?? "[]")),
    dragDropBackground: JSON.parse(String(task.dragDropBackground ?? "null")),
    dragDropItems: JSON.parse(String(task.dragDropItems ?? "[]")),
    multipleChoiceOrderMode:
      task.multipleChoiceOrderMode === "random" ? "random" : "fixed",
  };
}

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", frontendOrigin);
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    message: "Backend corriendo con Express, TypeScript y Prisma",
  });
});

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;

  res.json({
    status: "ok",
    database: "connected",
  });
});

app.get("/api/tasks", async (_req, res) => {
  const tasks = await prisma.taskDraft.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

  res.json(tasks.map(deserializeTask));
});

app.get("/api/tasks/:id", async (req, res) => {
  const task = await prisma.taskDraft.findUnique({
    where: {
      id: req.params.id,
    },
  });

  if (!task) {
    res.status(404).json({
      message: "Task not found",
    });
    return;
  }

  res.json(deserializeTask(task));
});

app.post("/api/tasks", async (req, res) => {
  const {
    title,
    categories,
    category,
    difficulties,
    bodyBlocks,
    challengeBlocks,
    answerType,
    multipleChoiceOrderMode,
    answers,
    correctAnswerId,
    shortAnswer,
    rangeAnswers,
    dragDropBackground,
    dragDropItems,
    explanation,
    status,
  } = req.body;

  const task = await prisma.taskDraft.create({
    data: {
      title,
      category: serializeJson(
        Array.isArray(categories)
          ? categories
          : category
            ? [category]
            : [],
      ),
      difficulties: serializeJson(difficulties),
      bodyBlocks: serializeJson(bodyBlocks),
      challengeBlocks: serializeJson(challengeBlocks),
      answerType: answerType ?? "multiple_choice",
      multipleChoiceOrderMode:
        multipleChoiceOrderMode === "random" ? "random" : "fixed",
      answers: serializeJson(answers),
      correctAnswerId,
      shortAnswer: shortAnswer ?? "",
      rangeAnswers: serializeJson(rangeAnswers ?? []),
      dragDropBackground: serializeJson(dragDropBackground ?? null),
      dragDropItems: serializeJson(dragDropItems ?? []),
      explanation,
      status: status ?? "Borrador",
    },
  });

  res.status(201).json(deserializeTask(task));
});

app.put("/api/tasks/:id", async (req, res) => {
  const {
    title,
    categories,
    category,
    difficulties,
    bodyBlocks,
    challengeBlocks,
    answerType,
    multipleChoiceOrderMode,
    answers,
    correctAnswerId,
    shortAnswer,
    rangeAnswers,
    dragDropBackground,
    dragDropItems,
    explanation,
    status,
  } = req.body;

  const task = await prisma.taskDraft.update({
    where: {
      id: req.params.id,
    },
    data: {
      title,
      category: serializeJson(
        Array.isArray(categories)
          ? categories
          : category
            ? [category]
            : [],
      ),
      difficulties: serializeJson(difficulties),
      bodyBlocks: serializeJson(bodyBlocks),
      challengeBlocks: serializeJson(challengeBlocks),
      answerType: answerType ?? "multiple_choice",
      multipleChoiceOrderMode:
        multipleChoiceOrderMode === "random" ? "random" : "fixed",
      answers: serializeJson(answers),
      correctAnswerId,
      shortAnswer: shortAnswer ?? "",
      rangeAnswers: serializeJson(rangeAnswers ?? []),
      dragDropBackground: serializeJson(dragDropBackground ?? null),
      dragDropItems: serializeJson(dragDropItems ?? []),
      explanation,
      status: status ?? "Borrador",
    },
  });

  res.json(deserializeTask(task));
});

app.delete("/api/tasks/:id", async (req, res) => {
  await prisma.taskDraft.delete({
    where: {
      id: req.params.id,
    },
  });

  res.status(204).send();
});

const startServer = async () => {
  await prisma.$connect();

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
};

startServer().catch(async (error) => {
  console.error("Failed to start server", error);
  await prisma.$disconnect();
  process.exit(1);
});

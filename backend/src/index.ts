import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";

const app = express();
const port = Number(process.env.PORT) || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4321";

const ansi = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function colorize(text: string, color: string) {
  return `${color}${text}${ansi.reset}`;
}

function formatStatus(statusCode: number) {
  const padded = String(statusCode).padStart(3, " ");

  if (statusCode >= 500) {
    return colorize(padded, ansi.red);
  }

  if (statusCode >= 400) {
    return colorize(padded, ansi.yellow);
  }

  if (statusCode >= 300) {
    return colorize(padded, ansi.cyan);
  }

  if (statusCode >= 200) {
    return colorize(padded, ansi.green);
  }

  return colorize(padded, ansi.gray);
}

function formatMethod(method: string) {
  switch (method) {
    case "GET":
      return colorize(method.padEnd(7, " "), ansi.blue);
    case "POST":
      return colorize(method.padEnd(7, " "), ansi.green);
    case "PUT":
      return colorize(method.padEnd(7, " "), ansi.yellow);
    case "DELETE":
      return colorize(method.padEnd(7, " "), ansi.red);
    case "OPTIONS":
      return colorize(method.padEnd(7, " "), ansi.magenta);
    default:
      return colorize(method.padEnd(7, " "), ansi.gray);
  }
}

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

function parseJsonValue<T>(value: unknown, fallback: T) {
  try {
    return JSON.parse(String(value ?? JSON.stringify(fallback))) as T;
  } catch {
    return fallback;
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
    difficulties: parseJsonValue(task.difficulties, {}),
    bodyBlocks: parseJsonValue(task.bodyBlocks, []),
    challengeBlocks: parseJsonValue(task.challengeBlocks, []),
    answerType: String(task.answerType ?? "multiple_choice"),
    answers: parseJsonValue(task.answers, []),
    shortAnswer: String(task.shortAnswer ?? ""),
    rangeAnswers: parseJsonValue(task.rangeAnswers, []),
    dragDropBackground: parseJsonValue(task.dragDropBackground, null),
    dragDropItems: parseJsonValue(task.dragDropItems, []),
    multipleChoiceOrderMode:
      task.multipleChoiceOrderMode === "random" ? "random" : "fixed",
  };
}

function deserializeTaskSummary(task: {
  id: string;
  title: string;
  category: string;
  difficulties: string;
  status: string;
}) {
  return {
    id: task.id,
    title: task.title,
    categories: deserializeCategories(task.category),
    difficulties: parseJsonValue<Record<string, string>>(task.difficulties, {}),
    status: task.status,
  };
}

function parseDateInput(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`El campo ${fieldName} es obligatorio.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`El campo ${fieldName} no tiene una fecha válida.`);
  }

  return date;
}

function parseTaskIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

type ContestTaskInput = {
  taskId: string;
  minScore: number;
  noAnswerScore: number;
  maxScore: number;
  options: string;
};

function parseScore(value: unknown, fallback: number) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.trunc(score) : fallback;
}

function parseContestTasks(body: Record<string, unknown>) {
  const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
  const taskInputs = rawTasks
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      taskId: typeof item.taskId === "string" ? item.taskId.trim() : "",
      minScore: parseScore(item.minScore, 0),
      noAnswerScore: parseScore(item.noAnswerScore, 0),
      maxScore: parseScore(item.maxScore, 10),
      options:
        typeof item.options === "string" && item.options.trim()
          ? item.options.trim()
          : "{}",
    }))
    .filter((item) => item.taskId);

  const fallbackTaskInputs = parseTaskIds(body.taskIds).map((taskId) => ({
    taskId,
    minScore: 0,
    noAnswerScore: 0,
    maxScore: 10,
    options: "{}",
  }));

  const uniqueTasks = new Map<string, ContestTaskInput>();

  for (const task of taskInputs.length > 0 ? taskInputs : fallbackTaskInputs) {
    if (task.maxScore < task.minScore) {
      throw new Error("El puntaje máximo no puede ser menor que el puntaje mínimo.");
    }

    uniqueTasks.set(task.taskId, task);
  }

  return [...uniqueTasks.values()];
}

function buildContestTaskWrites(tasks: ContestTaskInput[]) {
  return tasks.map((task, index) => ({
    taskDraftId: task.taskId,
    position: index + 1,
    minScore: task.minScore,
    noAnswerScore: task.noAnswerScore,
    maxScore: task.maxScore,
    options: task.options,
  }));
}

function deserializeContest(contest: {
  id: string;
  title: string;
  level: string;
  year: number;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
  isOpen: boolean;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  isVisible: boolean;
  status: string;
  folderSecret: string;
  createdAt: Date;
  updatedAt: Date;
  tasks?: Array<{
    id: string;
    position: number;
    minScore: number;
    noAnswerScore: number;
    maxScore: number;
    options: string;
    taskDraft: {
      id: string;
      title: string;
      category: string;
      difficulties: string;
      status: string;
    };
  }>;
}) {
  return {
    id: contest.id,
    title: contest.title,
    level: contest.level,
    year: contest.year,
    durationMinutes: contest.durationMinutes,
    startsAt: contest.startsAt.toISOString(),
    endsAt: contest.endsAt.toISOString(),
    isOpen: contest.isOpen,
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    isVisible: contest.isVisible,
    status: contest.status,
    folderSecret: contest.folderSecret,
    createdAt: contest.createdAt.toISOString(),
    updatedAt: contest.updatedAt.toISOString(),
    taskCount: contest.tasks?.length ?? 0,
    tasks:
      contest.tasks?.map((task) => ({
        id: task.id,
        position: task.position,
        taskId: task.taskDraft.id,
        minScore: task.minScore,
        noAnswerScore: task.noAnswerScore,
        maxScore: task.maxScore,
        options: task.options,
        task: deserializeTaskSummary(task.taskDraft),
      })) ?? [],
  };
}

function parseContestPayload(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const level = typeof body.level === "string" ? body.level.trim() : "";
  const year = Number(body.year);
  const durationMinutes = Number(body.durationMinutes);
  const tasks = parseContestTasks(body);

  if (!title) {
    throw new Error("El nombre de la competencia es obligatorio.");
  }

  if (!level) {
    throw new Error("El nivel de la competencia es obligatorio.");
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("El año de la competencia debe ser válido.");
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("La duración debe ser un número mayor que cero.");
  }

  const startsAt = parseDateInput(body.startsAt, "startsAt");
  const endsAt = parseDateInput(body.endsAt, "endsAt");

  if (endsAt <= startsAt) {
    throw new Error("La fecha de fin debe ser posterior a la fecha de inicio.");
  }

  return {
    title,
    level,
    year,
    durationMinutes,
    startsAt,
    endsAt,
    isOpen: body.isOpen === true,
    allowPairs: body.allowPairs === true,
    showFeedback: body.showFeedback === true,
    showSolutions: body.showSolutions === true,
    showTotalScore: body.showTotalScore === true,
    isVisible: body.isVisible === true,
    status:
      typeof body.status === "string" && body.status.trim()
        ? body.status.trim()
        : "draft",
    folderSecret:
      typeof body.folderSecret === "string" ? body.folderSecret.trim() : "",
    tasks,
  };
}

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `${colorize("[api]", ansi.gray)} ${formatStatus(res.statusCode)} ${formatMethod(
        req.method,
      )} ${colorize(req.originalUrl, ansi.bold)} ${colorize(`${durationMs}ms`, ansi.dim)}`,
    );
  });

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

app.get("/api/contests", async (_req, res) => {
  const contests = await prisma.contest.findMany({
    include: {
      tasks: {
        orderBy: {
          position: "asc",
        },
        include: {
          taskDraft: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  res.json(contests.map(deserializeContest));
});

app.get("/api/contests/:id", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: {
      id: req.params.id,
    },
    include: {
      tasks: {
        orderBy: {
          position: "asc",
        },
        include: {
          taskDraft: true,
        },
      },
    },
  });

  if (!contest) {
    res.status(404).json({
      message: "Contest not found",
    });
    return;
  }

  res.json(deserializeContest(contest));
});

app.post("/api/contests", async (req, res) => {
  let payload;

  try {
    payload = parseContestPayload(req.body as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid contest payload",
    });
    return;
  }

  const taskCount = await prisma.taskDraft.count({
    where: {
      id: {
        in: payload.tasks.map((task) => task.taskId),
      },
    },
  });

  if (taskCount !== payload.tasks.length) {
    res.status(400).json({
      message: "Una o más tareas seleccionadas no existen.",
    });
    return;
  }

  const contest = await prisma.contest.create({
    data: {
      title: payload.title,
      level: payload.level,
      year: payload.year,
      durationMinutes: payload.durationMinutes,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      isOpen: payload.isOpen,
      allowPairs: payload.allowPairs,
      showFeedback: payload.showFeedback,
      showSolutions: payload.showSolutions,
      showTotalScore: payload.showTotalScore,
      isVisible: payload.isVisible,
      status: payload.status,
      folderSecret: payload.folderSecret,
      tasks: {
        create: buildContestTaskWrites(payload.tasks),
      },
    },
    include: {
      tasks: {
        orderBy: {
          position: "asc",
        },
        include: {
          taskDraft: true,
        },
      },
    },
  });

  res.status(201).json(deserializeContest(contest));
});

app.put("/api/contests/:id", async (req, res) => {
  let payload;

  try {
    payload = parseContestPayload(req.body as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid contest payload",
    });
    return;
  }

  const existingContest = await prisma.contest.findUnique({
    where: {
      id: req.params.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingContest) {
    res.status(404).json({
      message: "Contest not found",
    });
    return;
  }

  const taskCount = await prisma.taskDraft.count({
    where: {
      id: {
        in: payload.tasks.map((task) => task.taskId),
      },
    },
  });

  if (taskCount !== payload.tasks.length) {
    res.status(400).json({
      message: "Una o más tareas seleccionadas no existen.",
    });
    return;
  }

  const contest = await prisma.$transaction(async (transaction) => {
    await transaction.contestTask.deleteMany({
      where: {
        contestId: req.params.id,
      },
    });

    return transaction.contest.update({
      where: {
        id: req.params.id,
      },
      data: {
        title: payload.title,
        level: payload.level,
        year: payload.year,
        durationMinutes: payload.durationMinutes,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        isOpen: payload.isOpen,
        allowPairs: payload.allowPairs,
        showFeedback: payload.showFeedback,
        showSolutions: payload.showSolutions,
        showTotalScore: payload.showTotalScore,
        isVisible: payload.isVisible,
        status: payload.status,
        folderSecret: payload.folderSecret,
        tasks: {
          create: buildContestTaskWrites(payload.tasks),
        },
      },
      include: {
        tasks: {
          orderBy: {
            position: "asc",
          },
          include: {
            taskDraft: true,
          },
        },
      },
    });
  });

  res.json(deserializeContest(contest));
});

app.post("/api/contests/:id/publish", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: {
      id: req.params.id,
    },
    include: {
      tasks: {
        orderBy: {
          position: "asc",
        },
        include: {
          taskDraft: true,
        },
      },
    },
  });

  if (!contest) {
    res.status(404).json({
      message: "Contest not found",
    });
    return;
  }

  const readinessErrors: string[] = [];

  if (!contest.title.trim()) {
    readinessErrors.push("La competencia necesita nombre.");
  }

  if (!contest.level.trim()) {
    readinessErrors.push("La competencia necesita nivel.");
  }

  if (contest.endsAt <= contest.startsAt) {
    readinessErrors.push("La ventana de ejecución no es válida.");
  }

  if (contest.durationMinutes <= 0) {
    readinessErrors.push("La duración debe ser mayor que cero.");
  }

  if (contest.tasks.length === 0) {
    readinessErrors.push("La competencia necesita al menos una tarea.");
  }

  if (contest.tasks.some((task) => task.maxScore < task.minScore)) {
    readinessErrors.push("Hay tareas con puntajes mal configurados.");
  }

  if (readinessErrors.length > 0) {
    res.status(400).json({
      message: readinessErrors[0],
      errors: readinessErrors,
    });
    return;
  }

  const publishedContest = await prisma.contest.update({
    where: {
      id: contest.id,
    },
    data: {
      status: "published",
      isOpen: true,
      isVisible: true,
    },
    include: {
      tasks: {
        orderBy: {
          position: "asc",
        },
        include: {
          taskDraft: true,
        },
      },
    },
  });

  res.json(deserializeContest(publishedContest));
});

app.delete("/api/contests/:id", async (req, res) => {
  await prisma.contest.delete({
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

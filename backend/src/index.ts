import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma";
import { requireAdmin, requireAuth, signToken } from "./lib/auth";

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
    }))
    .filter((item) => item.taskId);

  const fallbackTaskInputs = parseTaskIds(body.taskIds).map((taskId) => ({
    taskId,
    minScore: 0,
    noAnswerScore: 0,
    maxScore: 10,
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
  }));
}

const CONTEST_CATEGORY_NAMES = [
  "Guacamayo",
  "Capibara",
  "Titi",
  "Jucumari",
  "Yaguareté",
];

type ContestState = "borrador" | "programada" | "abierta" | "cerrada";

function computeContestState(contest: {
  publishedAt: Date | null;
  startsAt: Date;
  endsAt: Date;
}): { state: ContestState; isOpen: boolean } {
  const now = new Date();

  if (!contest.publishedAt) {
    return { state: "borrador", isOpen: false };
  }

  if (now < contest.startsAt) {
    return { state: "programada", isOpen: false };
  }

  if (now > contest.endsAt) {
    return { state: "cerrada", isOpen: false };
  }

  return { state: "abierta", isOpen: true };
}

function deserializeContest(contest: {
  id: string;
  title: string;
  category: string;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: Array<{
    id: string;
    position: number;
    minScore: number;
    noAnswerScore: number;
    maxScore: number;
    taskDraft: {
      id: string;
      title: string;
      category: string;
      difficulties: string;
      status: string;
    };
  }>;
}) {
  const { state, isOpen } = computeContestState(contest);

  return {
    id: contest.id,
    title: contest.title,
    category: contest.category,
    durationMinutes: contest.durationMinutes,
    startsAt: contest.startsAt.toISOString(),
    endsAt: contest.endsAt.toISOString(),
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    publishedAt: contest.publishedAt?.toISOString() ?? null,
    state,
    isOpen,
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
        task: deserializeTaskSummary(task.taskDraft),
      })) ?? [],
  };
}

function parseContestPayload(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const durationMinutes = Number(body.durationMinutes);
  const tasks = parseContestTasks(body);

  if (!title) {
    throw new Error("El nombre de la competencia es obligatorio.");
  }

  if (category && !CONTEST_CATEGORY_NAMES.includes(category)) {
    throw new Error("La categoría seleccionada no es válida.");
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
    category,
    durationMinutes,
    startsAt,
    endsAt,
    allowPairs: body.allowPairs === true,
    showFeedback: body.showFeedback === true,
    showSolutions: body.showSolutions === true,
    showTotalScore: body.showTotalScore === true,
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

  res.header("Access-Control-Allow-Origin", req.headers.origin ?? frontendOrigin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

app.post("/api/auth/login", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    res.status(401).json({ message: "Credenciales inválidas." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    res.status(401).json({ message: "Credenciales inválidas." });
    return;
  }

  if (user.status !== "approved") {
    res.status(403).json({
      message:
        user.status === "rejected"
          ? "Tu cuenta fue rechazada. Contacta al administrador."
          : "Tu cuenta está pendiente de aprobación.",
    });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user) {
    res.status(404).json({ message: "Usuario no encontrado." });
    return;
  }

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

app.post("/api/auth/register", async (req, res) => {
  const firstName =
    typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName =
    typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!firstName || !lastName || !email || !password) {
    res.status(400).json({
      message: "Nombres, apellidos, correo y contraseña son obligatorios.",
    });
    return;
  }

  if (password.length < 6) {
    res
      .status(400)
      .json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    res.status(409).json({ message: "Ya existe una cuenta con ese correo." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      passwordHash,
      role: "maestro",
      status: "pending",
    },
  });

  res.status(201).json({
    message: "Cuenta de maestro creada. Queda pendiente de aprobación.",
  });
});

// Banco de tareas, competencias y gestión de usuarios: solo admin.
app.use(["/api/tasks", "/api/contests", "/api/users"], requireAdmin);
// Grupos: admin y maestro (con sesión); el alcance se filtra por rol.
app.use("/api/groups", requireAuth);
app.use("/api/teams", requireAuth);

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
      category: payload.category,
      durationMinutes: payload.durationMinutes,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      allowPairs: payload.allowPairs,
      showFeedback: payload.showFeedback,
      showSolutions: payload.showSolutions,
      showTotalScore: payload.showTotalScore,
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
        category: payload.category,
        durationMinutes: payload.durationMinutes,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        allowPairs: payload.allowPairs,
        showFeedback: payload.showFeedback,
        showSolutions: payload.showSolutions,
        showTotalScore: payload.showTotalScore,
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
      publishedAt: contest.publishedAt ?? new Date(),
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

function generateCode(length: number) {
  // Sin caracteres ambiguos (O/0, I/1/L).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function generateUniqueAccessCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = generateCode(6);
    const existing = await prisma.contestGroup.findUnique({
      where: { accessCode: code },
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error("No se pudo generar un código de acceso único.");
}

async function generateUniquePersonalCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = generateCode(8);
    const existing = await prisma.team.findUnique({
      where: { personalCode: code },
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error("No se pudo generar un código de equipo único.");
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatName(value: string) {
  return cleanName(value)
    .toLowerCase()
    .replace(/(^|\s|-)(\p{L})/gu, (_match, sep, letter) => sep + letter.toUpperCase());
}

function nameKey(first: string, last: string) {
  const norm = (value: string) =>
    cleanName(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  return `${norm(first)} ${norm(last)}`;
}

function serializeGroup(group: {
  id: string;
  name: string;
  accessCode: string;
  contestId: string;
  expiresAt: Date | null;
  createdAt: Date;
  contest?: { title: string; category: string } | null;
  teams?: Array<{
    id: string;
    participationMode: string;
    memberOneFirstName: string;
    memberOneLastName: string;
    memberTwoFirstName: string | null;
    memberTwoLastName: string | null;
    status: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: group.id,
    name: group.name,
    accessCode: group.accessCode,
    contestId: group.contestId,
    contestTitle: group.contest?.title ?? "",
    contestCategory: group.contest?.category ?? "",
    expiresAt: group.expiresAt?.toISOString() ?? null,
    createdAt: group.createdAt.toISOString(),
    teamCount: group.teams?.length ?? 0,
    teams:
      group.teams?.map((team) => ({
        id: team.id,
        participationMode: team.participationMode,
        memberOneFirstName: team.memberOneFirstName,
        memberOneLastName: team.memberOneLastName,
        memberTwoFirstName: team.memberTwoFirstName,
        memberTwoLastName: team.memberTwoLastName,
        status: team.status,
        createdAt: team.createdAt.toISOString(),
      })) ?? [],
  };
}

const groupContestSelect = {
  contest: { select: { title: true, category: true } },
};

// ---- Gestión de maestros (solo admin) ----

app.get("/api/users/maestros", async (_req, res) => {
  const maestros = await prisma.user.findMany({
    where: { role: "maestro" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, status: true, createdAt: true },
  });

  res.json(
    maestros.map((maestro) => ({
      ...maestro,
      createdAt: maestro.createdAt.toISOString(),
    })),
  );
});

app.post("/api/users/:id/approve", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { status: "approved" },
    select: { id: true, status: true },
  });
  res.json(user);
});

app.post("/api/users/:id/reject", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { status: "rejected" },
    select: { id: true, status: true },
  });
  res.json(user);
});

// ---- Competencias publicadas para armar grupos (admin y maestro) ----

app.get("/api/published-contests", requireAuth, async (_req, res) => {
  const contests = await prisma.contest.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, category: true },
  });
  res.json(contests);
});

// ---- Grupos: el admin ve todos; el maestro solo los suyos ----

app.get("/api/groups", async (req, res) => {
  const where =
    req.user?.role === "maestro" ? { createdById: req.user.id } : {};

  const groups = await prisma.contestGroup.findMany({
    where,
    include: { ...groupContestSelect, teams: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(groups.map(serializeGroup));
});

app.get("/api/groups/:id", async (req, res) => {
  const group = await prisma.contestGroup.findUnique({
    where: { id: req.params.id },
    include: {
      ...groupContestSelect,
      teams: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!group) {
    res.status(404).json({ message: "Grupo no encontrado." });
    return;
  }

  if (req.user?.role === "maestro" && group.createdById !== req.user.id) {
    res.status(404).json({ message: "Grupo no encontrado." });
    return;
  }

  res.json(serializeGroup(group));
});

app.post("/api/groups", async (req, res) => {
  const contestId =
    typeof req.body?.contestId === "string" ? req.body.contestId : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    res.status(400).json({ message: "El nombre del grupo es obligatorio." });
    return;
  }

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });

  if (!contest) {
    res.status(400).json({ message: "La competencia no existe." });
    return;
  }

  if (!contest.publishedAt) {
    res
      .status(400)
      .json({ message: "La competencia debe estar publicada para crear grupos." });
    return;
  }

  const accessCode = await generateUniqueAccessCode();
  const recoveryCode = generateCode(10);

  const group = await prisma.contestGroup.create({
    data: {
      contestId,
      name,
      accessCode,
      recoveryCode,
      createdById: req.user?.id ?? null,
    },
    include: { ...groupContestSelect, teams: true },
  });

  res.status(201).json(serializeGroup(group));
});

app.delete("/api/groups/:id", async (req, res) => {
  if (req.user?.role === "maestro") {
    const group = await prisma.contestGroup.findUnique({
      where: { id: req.params.id },
      select: { createdById: true },
    });
    if (!group || group.createdById !== req.user.id) {
      res.status(404).json({ message: "Grupo no encontrado." });
      return;
    }
  }

  await prisma.contestGroup.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

function serializeTeam(team: {
  id: string;
  participationMode: string;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: team.id,
    participationMode: team.participationMode,
    memberOneFirstName: team.memberOneFirstName,
    memberOneLastName: team.memberOneLastName,
    memberTwoFirstName: team.memberTwoFirstName,
    memberTwoLastName: team.memberTwoLastName,
    status: team.status,
    createdAt: team.createdAt.toISOString(),
  };
}

app.delete("/api/teams/:id", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    include: { group: { select: { createdById: true } } },
  });

  if (
    !team ||
    (req.user?.role === "maestro" && team.group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Participante no encontrado." });
    return;
  }

  await prisma.team.delete({ where: { id: team.id } });
  res.status(204).send();
});

app.put("/api/teams/:id", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    include: { group: { include: { contest: true } } },
  });

  if (
    !team ||
    (req.user?.role === "maestro" && team.group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Participante no encontrado." });
    return;
  }

  const readField = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const oneFirst = readField(req.body?.memberOneFirstName);
  const oneLast = readField(req.body?.memberOneLastName);
  const isPareja = team.participationMode === "pareja";
  const twoFirst = readField(req.body?.memberTwoFirstName);
  const twoLast = readField(req.body?.memberTwoLastName);

  if (!oneFirst || !oneLast) {
    res
      .status(400)
      .json({ message: "Los nombres y apellidos son obligatorios." });
    return;
  }

  if (isPareja && (!twoFirst || !twoLast)) {
    res
      .status(400)
      .json({ message: "Faltan los nombres y apellidos del segundo integrante." });
    return;
  }

  const keyOne = nameKey(oneFirst, oneLast);
  const keyTwo = isPareja ? nameKey(twoFirst, twoLast) : "";

  if (isPareja && keyOne === keyTwo) {
    res
      .status(400)
      .json({ message: "Los dos integrantes no pueden ser la misma persona." });
    return;
  }

  const others = await prisma.team.findMany({
    where: { group: { contestId: team.group.contestId }, id: { not: team.id } },
    select: {
      memberOneFirstName: true,
      memberOneLastName: true,
      memberTwoFirstName: true,
      memberTwoLastName: true,
    },
  });

  const takenKeys = new Set<string>();
  for (const other of others) {
    takenKeys.add(nameKey(other.memberOneFirstName, other.memberOneLastName));
    if (other.memberTwoFirstName && other.memberTwoLastName) {
      takenKeys.add(nameKey(other.memberTwoFirstName, other.memberTwoLastName));
    }
  }

  if (takenKeys.has(keyOne)) {
    res.status(409).json({
      message: `${formatName(oneFirst)} ${formatName(oneLast)} ya está registrado en esta competencia.`,
    });
    return;
  }

  if (isPareja && takenKeys.has(keyTwo)) {
    res.status(409).json({
      message: `${formatName(twoFirst)} ${formatName(twoLast)} ya está registrado en esta competencia.`,
    });
    return;
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: {
      memberOneFirstName: formatName(oneFirst),
      memberOneLastName: formatName(oneLast),
      memberTwoFirstName: isPareja ? formatName(twoFirst) : null,
      memberTwoLastName: isPareja ? formatName(twoLast) : null,
    },
  });

  res.json(serializeTeam(updated));
});

// ---- Entrada del estudiante (público, sin login) ----

app.get("/api/play/group/:code", async (req, res) => {
  const code = String(req.params.code ?? "").trim().toUpperCase();

  const group = await prisma.contestGroup.findUnique({
    where: { accessCode: code },
    include: { contest: true },
  });

  if (!group) {
    res.status(404).json({ message: "Código no encontrado." });
    return;
  }

  if (group.expiresAt && group.expiresAt < new Date()) {
    res.status(410).json({ message: "El código ya expiró." });
    return;
  }

  if (!group.contest.publishedAt) {
    res.status(409).json({ message: "La competencia aún no está disponible." });
    return;
  }

  const { state } = computeContestState(group.contest);

  if (state === "cerrada") {
    res.status(409).json({ message: "La competencia ya cerró." });
    return;
  }

  res.json({
    groupName: group.name,
    contestTitle: group.contest.title,
    contestCategory: group.contest.category,
    allowPairs: group.contest.allowPairs,
    durationMinutes: group.contest.durationMinutes,
    state,
  });
});

app.post("/api/play/join", async (req, res) => {
  const code =
    typeof req.body?.accessCode === "string"
      ? req.body.accessCode.trim().toUpperCase()
      : "";
  const mode =
    req.body?.participationMode === "pareja" ? "pareja" : "individual";
  const readField = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const memberOneFirstName = readField(req.body?.memberOneFirstName);
  const memberOneLastName = readField(req.body?.memberOneLastName);
  const memberTwoFirstName = readField(req.body?.memberTwoFirstName);
  const memberTwoLastName = readField(req.body?.memberTwoLastName);

  if (!memberOneFirstName || !memberOneLastName) {
    res
      .status(400)
      .json({ message: "Tus nombres y apellidos son obligatorios." });
    return;
  }

  const group = await prisma.contestGroup.findUnique({
    where: { accessCode: code },
    include: { contest: true },
  });

  if (!group) {
    res.status(404).json({ message: "Código no encontrado." });
    return;
  }

  if (group.expiresAt && group.expiresAt < new Date()) {
    res.status(410).json({ message: "El código ya expiró." });
    return;
  }

  if (!group.contest.publishedAt) {
    res.status(409).json({ message: "La competencia aún no está disponible." });
    return;
  }

  if (computeContestState(group.contest).state === "cerrada") {
    res
      .status(409)
      .json({ message: "La competencia ya cerró; no es posible registrarse." });
    return;
  }

  if (mode === "pareja" && !group.contest.allowPairs) {
    res.status(400).json({ message: "Esta competencia no permite parejas." });
    return;
  }

  if (mode === "pareja" && (!memberTwoFirstName || !memberTwoLastName)) {
    res
      .status(400)
      .json({ message: "Faltan los nombres y apellidos del segundo integrante." });
    return;
  }

  const keyOne = nameKey(memberOneFirstName, memberOneLastName);
  const keyTwo =
    mode === "pareja" ? nameKey(memberTwoFirstName, memberTwoLastName) : "";

  if (mode === "pareja" && keyOne === keyTwo) {
    res
      .status(400)
      .json({ message: "Los dos integrantes no pueden ser la misma persona." });
    return;
  }

  const existingTeams = await prisma.team.findMany({
    where: { group: { contestId: group.contestId } },
    select: {
      memberOneFirstName: true,
      memberOneLastName: true,
      memberTwoFirstName: true,
      memberTwoLastName: true,
    },
  });

  const takenKeys = new Set<string>();
  for (const existing of existingTeams) {
    takenKeys.add(nameKey(existing.memberOneFirstName, existing.memberOneLastName));
    if (existing.memberTwoFirstName && existing.memberTwoLastName) {
      takenKeys.add(
        nameKey(existing.memberTwoFirstName, existing.memberTwoLastName),
      );
    }
  }

  const oneName = `${formatName(memberOneFirstName)} ${formatName(memberOneLastName)}`;
  if (takenKeys.has(keyOne)) {
    res.status(409).json({
      message: `${oneName} ya está registrado en esta competencia.`,
    });
    return;
  }

  if (mode === "pareja" && takenKeys.has(keyTwo)) {
    const twoName = `${formatName(memberTwoFirstName)} ${formatName(memberTwoLastName)}`;
    res.status(409).json({
      message: `${twoName} ya está registrado en esta competencia.`,
    });
    return;
  }

  const personalCode = await generateUniquePersonalCode();

  const team = await prisma.team.create({
    data: {
      groupId: group.id,
      participationMode: mode,
      memberOneFirstName: formatName(memberOneFirstName),
      memberOneLastName: formatName(memberOneLastName),
      memberTwoFirstName:
        mode === "pareja" ? formatName(memberTwoFirstName) : null,
      memberTwoLastName:
        mode === "pareja" ? formatName(memberTwoLastName) : null,
      personalCode,
      attempt: { create: { status: "pending" } },
    },
  });

  if (!group.firstUsedAt) {
    await prisma.contestGroup.update({
      where: { id: group.id },
      data: { firstUsedAt: new Date() },
    });
  }

  res.status(201).json({
    personalCode,
    teamId: team.id,
    groupName: group.name,
    contestTitle: group.contest.title,
  });
});

app.get("/api/play/team/:personalCode", async (req, res) => {
  const personalCode = String(req.params.personalCode ?? "")
    .trim()
    .toUpperCase();

  const team = await prisma.team.findUnique({
    where: { personalCode },
    include: { group: { include: { contest: true } } },
  });

  if (!team) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  res.json({
    personalCode: team.personalCode,
    participationMode: team.participationMode,
    memberOneFirstName: team.memberOneFirstName,
    memberOneLastName: team.memberOneLastName,
    memberTwoFirstName: team.memberTwoFirstName,
    memberTwoLastName: team.memberTwoLastName,
    groupName: team.group.name,
    contestTitle: team.group.contest.title,
    accessCode: team.group.accessCode,
  });
});

function parseMcCorrectness(value: string) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("any:")) {
    return {
      mode: "any",
      ids: raw.slice(4).split(",").map((item) => item.trim()).filter(Boolean),
    };
  }
  if (raw.startsWith("all:")) {
    return {
      mode: "all",
      ids: raw.slice(4).split(",").map((item) => item.trim()).filter(Boolean),
    };
  }
  return { mode: "single", ids: raw ? [raw] : [] };
}

function answerHasResponse(answerType: string, payload: any) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (answerType === "multiple_choice") {
    return Array.isArray(payload.selected) && payload.selected.length > 0;
  }
  if (answerType === "short_text") {
    return typeof payload.text === "string" && payload.text.trim().length > 0;
  }
  if (answerType === "range") {
    const value = String(payload.value ?? "").trim();
    return value !== "" && !Number.isNaN(Number(value));
  }
  if (answerType === "drag_drop") {
    return (
      payload.placements &&
      typeof payload.placements === "object" &&
      Object.keys(payload.placements).length > 0
    );
  }
  return false;
}

function answerIsCorrect(task: any, payload: any) {
  const type = task.answerType;
  if (type === "multiple_choice") {
    const selected = Array.isArray(payload?.selected)
      ? payload.selected.map(String)
      : [];
    if (selected.length === 0) {
      return false;
    }
    const { mode, ids } = parseMcCorrectness(task.correctAnswerId);
    if (mode === "single") {
      return selected.length === 1 && selected[0] === ids[0];
    }
    if (mode === "any") {
      return selected.length === 1 && ids.includes(selected[0]);
    }
    return (
      selected.length === ids.length &&
      selected.every((item: string) => ids.includes(item))
    );
  }
  if (type === "short_text") {
    const text = typeof payload?.text === "string" ? payload.text : "";
    return (
      text.trim().toLowerCase() ===
      String(task.shortAnswer ?? "").trim().toLowerCase()
    );
  }
  if (type === "range") {
    const value = Number(payload?.value);
    if (Number.isNaN(value)) {
      return false;
    }
    return (task.rangeAnswers ?? []).some(
      (range: any) => value >= range.min && value <= range.max,
    );
  }
  if (type === "drag_drop") {
    const placements = payload?.placements ?? {};
    const items = task.dragDropItems ?? [];
    if (items.length === 0) {
      return false;
    }
    return items.every((item: any) => {
      const placement = placements[item.id];
      return (
        placement &&
        Math.abs(placement.x - item.targetX) <= item.tolerance &&
        Math.abs(placement.y - item.targetY) <= item.tolerance
      );
    });
  }
  return false;
}

function renderSafeTask(contestTask: any, task: any) {
  return {
    taskId: task.id,
    position: contestTask.position,
    title: task.title,
    bodyBlocks: task.bodyBlocks,
    challengeBlocks: task.challengeBlocks,
    answerType: task.answerType,
    multipleChoiceOrderMode: task.multipleChoiceOrderMode,
    multipleChoiceMode: parseMcCorrectness(task.correctAnswerId).mode,
    answers: (task.answers ?? []).map((answer: any) => ({
      id: answer.id,
      blocks: answer.blocks,
    })),
    dragDropBackground: task.dragDropBackground,
    dragDropItems: (task.dragDropItems ?? []).map((item: any) => ({
      id: item.id,
      label: item.label,
      image: item.image,
    })),
  };
}

async function recomputeRanking(contestId: string) {
  const results = await prisma.result.findMany({
    where: { attempt: { team: { group: { contestId } } } },
    orderBy: [{ totalScore: "desc" }, { calculatedAt: "asc" }],
    select: { id: true },
  });
  for (let i = 0; i < results.length; i += 1) {
    await prisma.result.update({
      where: { id: results[i].id },
      data: { rankPosition: i + 1 },
    });
  }
}

async function finalizeAttempt(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      team: {
        include: {
          group: {
            include: {
              contest: { include: { tasks: { include: { taskDraft: true } } } },
            },
          },
        },
      },
    },
  });
  if (!attempt) {
    return null;
  }

  const contest = attempt.team.group.contest;
  const answersByTask = new Map(
    attempt.answers.map((answer) => [answer.taskDraftId, answer]),
  );

  let totalScore = 0;
  let correctCount = 0;
  let answeredCount = 0;

  for (const contestTask of contest.tasks) {
    const task = deserializeTask(contestTask.taskDraft) as any;
    const existing = answersByTask.get(contestTask.taskDraftId);
    let payload: any = null;
    if (existing) {
      try {
        payload = JSON.parse(existing.responsePayload);
      } catch {
        payload = null;
      }
    }
    const answered = answerHasResponse(task.answerType, payload);
    const correct = answered ? answerIsCorrect(task, payload) : false;
    let score = contestTask.noAnswerScore;
    if (answered) {
      score = correct ? contestTask.maxScore : contestTask.minScore;
      answeredCount += 1;
    }
    if (correct) {
      correctCount += 1;
    }
    totalScore += score;

    if (existing) {
      await prisma.attemptAnswer.update({
        where: { id: existing.id },
        data: { isCorrect: answered ? correct : null, score },
      });
    }
  }

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { status: "finished", finishedAt: new Date() },
  });
  await prisma.result.upsert({
    where: { attemptId: attempt.id },
    update: { totalScore, correctCount, answeredCount, calculatedAt: new Date() },
    create: {
      attemptId: attempt.id,
      totalScore,
      correctCount,
      answeredCount,
      calculatedAt: new Date(),
    },
  });

  await recomputeRanking(contest.id);
  return { totalScore, correctCount, answeredCount };
}

function findTeamForPlay(personalCode: string) {
  return prisma.team.findUnique({
    where: { personalCode },
    include: {
      attempt: true,
      group: {
        include: {
          contest: {
            include: {
              tasks: {
                orderBy: { position: "asc" },
                include: { taskDraft: true },
              },
            },
          },
        },
      },
    },
  });
}

app.post("/api/play/start", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const team = await findTeamForPlay(personalCode);

  if (!team || !team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  const contest = team.group.contest;
  if (computeContestState(contest).state !== "abierta") {
    res
      .status(409)
      .json({ message: "La competencia no está abierta en este momento." });
    return;
  }

  if (team.attempt.status === "finished") {
    res.status(409).json({ message: "Ya entregaste esta competencia." });
    return;
  }

  if (team.attempt.status === "pending") {
    const now = new Date();
    const byDuration = new Date(now.getTime() + contest.durationMinutes * 60000);
    const endsAt = byDuration < contest.endsAt ? byDuration : contest.endsAt;
    await prisma.attempt.update({
      where: { id: team.attempt.id },
      data: { status: "in_progress", startedAt: now, endsAt },
    });
  }

  res.json({ ok: true });
});

app.get("/api/play/attempt/:personalCode", async (req, res) => {
  const personalCode = String(req.params.personalCode ?? "")
    .trim()
    .toUpperCase();
  const team = await findTeamForPlay(personalCode);

  if (!team || !team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  let attempt = team.attempt;
  const contest = team.group.contest;

  if (
    attempt.status === "in_progress" &&
    attempt.endsAt &&
    new Date() > attempt.endsAt
  ) {
    await finalizeAttempt(attempt.id);
    attempt = (await prisma.attempt.findUnique({
      where: { id: attempt.id },
    }))!;
  }

  const savedAnswers = await prisma.attemptAnswer.findMany({
    where: { attemptId: attempt.id },
  });
  const answers: Record<string, unknown> = {};
  for (const answer of savedAnswers) {
    try {
      answers[answer.taskDraftId] = JSON.parse(answer.responsePayload);
    } catch {
      answers[answer.taskDraftId] = null;
    }
  }

  const finished = attempt.status === "finished";
  const tasks = contest.tasks.map((contestTask) => {
    const task = deserializeTask(contestTask.taskDraft) as any;
    const safe = renderSafeTask(contestTask, task) as any;
    if (finished && contest.showSolutions) {
      safe.explanation = task.explanation;
      safe.correctAnswerId = task.correctAnswerId;
      safe.shortAnswer = task.shortAnswer;
      safe.rangeAnswers = task.rangeAnswers;
    }
    return safe;
  });

  const result =
    finished && contest.showTotalScore
      ? await prisma.result.findUnique({ where: { attemptId: attempt.id } })
      : null;

  res.json({
    contestTitle: contest.title,
    durationMinutes: contest.durationMinutes,
    state: computeContestState(contest).state,
    status: attempt.status,
    startedAt: attempt.startedAt?.toISOString() ?? null,
    endsAt: attempt.endsAt?.toISOString() ?? null,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    tasks,
    answers,
    result: result
      ? {
          totalScore: result.totalScore,
          correctCount: result.correctCount,
          answeredCount: result.answeredCount,
          rankPosition: result.rankPosition,
        }
      : null,
  });
});

app.post("/api/play/answer", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
  const payload = req.body?.payload ?? null;

  const team = await prisma.team.findUnique({
    where: { personalCode },
    include: { attempt: true },
  });

  if (!team || !team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  if (team.attempt.status !== "in_progress") {
    res.status(409).json({ message: "La competencia no está en curso." });
    return;
  }

  if (team.attempt.endsAt && new Date() > team.attempt.endsAt) {
    await finalizeAttempt(team.attempt.id);
    res.status(409).json({ message: "El tiempo terminó." });
    return;
  }

  await prisma.attemptAnswer.upsert({
    where: {
      attemptId_taskDraftId: { attemptId: team.attempt.id, taskDraftId: taskId },
    },
    update: { responsePayload: JSON.stringify(payload), answeredAt: new Date() },
    create: {
      attemptId: team.attempt.id,
      taskDraftId: taskId,
      responsePayload: JSON.stringify(payload),
      answeredAt: new Date(),
    },
  });

  res.status(204).send();
});

app.post("/api/play/submit", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const team = await prisma.team.findUnique({
    where: { personalCode },
    include: { attempt: true },
  });

  if (!team || !team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  if (team.attempt.status === "finished") {
    res.json({ ok: true });
    return;
  }

  if (team.attempt.status !== "in_progress") {
    res.status(409).json({ message: "La competencia no está en curso." });
    return;
  }

  await finalizeAttempt(team.attempt.id);
  res.json({ ok: true });
});

app.get("/api/contests/:id/results", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: {
      tasks: true,
      groups: {
        include: {
          teams: { include: { attempt: { include: { result: true } } } },
        },
      },
    },
  });

  if (!contest) {
    res.status(404).json({ message: "Competencia no encontrada." });
    return;
  }

  const rows = contest.groups.flatMap((group) =>
    group.teams.map((team) => ({
      teamId: team.id,
      groupName: group.name,
      participationMode: team.participationMode,
      memberOneFirstName: team.memberOneFirstName,
      memberOneLastName: team.memberOneLastName,
      memberTwoFirstName: team.memberTwoFirstName,
      memberTwoLastName: team.memberTwoLastName,
      status: team.attempt?.status ?? "pending",
      totalScore: team.attempt?.result?.totalScore ?? null,
      correctCount: team.attempt?.result?.correctCount ?? null,
      answeredCount: team.attempt?.result?.answeredCount ?? null,
      rankPosition: team.attempt?.result?.rankPosition ?? null,
    })),
  );

  rows.sort((left, right) => {
    if (left.rankPosition && right.rankPosition) {
      return left.rankPosition - right.rankPosition;
    }
    if (left.rankPosition) {
      return -1;
    }
    if (right.rankPosition) {
      return 1;
    }
    return 0;
  });

  res.json({
    contestTitle: contest.title,
    taskCount: contest.tasks.length,
    rows,
  });
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

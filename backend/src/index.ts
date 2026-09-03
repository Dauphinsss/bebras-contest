import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { mkdir, open, unlink } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { prisma } from "./lib/prisma";
import { requireAdmin, requireAuth, signToken } from "./lib/auth";

const app = express();
const port = Number(process.env.PORT) || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4321";

const UPLOADS_DIR = resolve(__dirname, "..", "uploads", "letters");
const DOC_ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const DOC_MAX_BYTES = 5 * 1024 * 1024;
const ROSTER_ALLOWED_EXT = new Set([".xlsx", ".csv"]);
const ROSTER_MAX_BYTES = 2 * 1024 * 1024;
const E2E_CLOCK_FILE = process.env.E2E_CLOCK_FILE;

function documentUploadField(value: unknown) {
  return value === "letter" || value === "idFront" || value === "idBack"
    ? value
    : undefined;
}

function currentDate() {
  if (E2E_CLOCK_FILE) {
    try {
      const date = new Date(readFileSync(E2E_CLOCK_FILE, "utf8").trim());
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // An absent test clock means the real clock is active.
    }
  }

  return new Date();
}

function uploadedFiles(req: express.Request) {
  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | Express.Multer.File[]
    | undefined;

  return Array.isArray(files) ? files : Object.values(files ?? {}).flat();
}

async function hasValidDocumentSignature(file: Express.Multer.File) {
  const handle = await open(file.path, "r");
  const signature = Buffer.alloc(8);

  try {
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    const bytes = signature.subarray(0, bytesRead);
    const extension = extname(file.originalname).toLowerCase();

    if (extension === ".pdf") {
      return bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
    }
    if (extension === ".jpg" || extension === ".jpeg") {
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    }
    if (extension === ".png") {
      return bytes.equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }

    return false;
  } finally {
    await handle.close();
  }
}

const uploadDocs = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) =>
      cb(
        null,
        `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      ),
  }),
  limits: { fileSize: DOC_MAX_BYTES, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (!DOC_ALLOWED_EXT.has(extname(file.originalname).toLowerCase())) {
      cb(
        Object.assign(new Error("INVALID_DOC_TYPE"), { field: file.fieldname }),
      );
      return;
    }
    cb(null, true);
  },
});

const uploadRoster = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ROSTER_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ROSTER_ALLOWED_EXT.has(extname(file.originalname).toLowerCase())) {
      cb(new Error("INVALID_ROSTER_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("file");

function rosterUploadMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  uploadRoster(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof Error && err.message === "INVALID_ROSTER_TYPE") {
        res
          .status(400)
          .json({ message: "La planilla debe ser un archivo XLSX o CSV." });
        return;
      }

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res
          .status(400)
          .json({ message: "La planilla no debe superar los 2 MB." });
        return;
      }

      res.status(400).json({ message: "No se pudo leer la planilla." });
      return;
    }

    next();
  });
}

const ROSTER_COLUMNS = [
  "Nombres",
  "Apellidos",
  "Curso",
  "Modalidad",
  "Nombres del compañero",
  "Apellidos del compañero",
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function gradeFromCell(value: unknown, contestCategory: string) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    throw new Error("Falta el curso.");
  }

  const normalized = normalizeHeader(raw);
  const known =
    SCHOOL_GRADES.find((grade) => grade.value.toLowerCase() === normalized) ??
    SCHOOL_GRADES.find((grade) => normalizeHeader(grade.label) === normalized);

  if (!known) {
    throw new Error(`Curso "${raw}" no reconocido.`);
  }

  return parseGrade(known.value, contestCategory);
}

function registerUploadMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const handler = uploadDocs.fields([
    { name: "letter", maxCount: 1 },
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
  ]);

  handler(req, res, (err: unknown) => {
    if (err) {
      void cleanupFiles(...uploadedFiles(req)).then(() => {
        const field = documentUploadField(
          err instanceof multer.MulterError
            ? err.field
            : err instanceof Error && "field" in err
              ? err.field
              : undefined,
        );
        if (
          err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          res.status(400).json({
            message: "El archivo no debe superar los 5 MB.",
            field,
          });
          return;
        }
        if (err instanceof Error && err.message === "INVALID_DOC_TYPE") {
          res.status(400).json({
            message:
              "El documento debe ser un archivo PDF o una imagen (JPG, JPEG o PNG).",
            field,
          });
          return;
        }
        res.status(400).json({
          message: "No se pudo subir el documento.",
          field,
        });
      });
      return;
    }

    const files = uploadedFiles(req);
    void Promise.allSettled(files.map(hasValidDocumentSignature)).then(
      async (checks) => {
        const invalidIndex = checks.findIndex(
          (check) => check.status === "rejected" || !check.value,
        );
        if (invalidIndex === -1) {
          next();
          return;
        }

        await cleanupFiles(...files);
        const check = checks[invalidIndex];
        res.status(400).json({
          message:
            check.status === "rejected"
              ? "No se pudo validar el documento."
              : "El contenido del documento no coincide con un PDF, JPG, JPEG o PNG válido.",
          field: documentUploadField(files[invalidIndex]?.fieldname),
        });
      },
    );
  });
}

async function cleanupFiles(...files: Array<Express.Multer.File | undefined>) {
  for (const file of files) {
    if (file?.path) {
      try {
        await unlink(file.path);
      } catch {
        // el archivo ya no existe o no se pudo borrar; se ignora
      }
    }
  }
}

function serializeTeacherSchool(school: {
  id: string;
  schoolCodUe: string | null;
  schoolName: string;
  letterFilename: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: school.id,
    schoolCodUe: school.schoolCodUe,
    schoolName: school.schoolName,
    status: school.status,
    hasLetter: Boolean(school.letterFilename),
    createdAt: school.createdAt.toISOString(),
  };
}

function describeUserDocuments(user: {
  institutionType: string | null;
  letterFilename: string | null;
  idFrontFilename: string | null;
  idBackFilename: string | null;
}) {
  const isSchool = user.institutionType !== "homeschool";
  const missing = isSchool
    ? user.letterFilename
      ? []
      : ["letter"]
    : [
        ...(user.idFrontFilename ? [] : ["idFront"]),
        ...(user.idBackFilename ? [] : ["idBack"]),
      ];

  return {
    institutionType: isSchool ? "school" : "homeschool",
    letter: Boolean(user.letterFilename),
    idFront: Boolean(user.idFrontFilename),
    idBack: Boolean(user.idBackFilename),
    missing,
    complete: missing.length === 0,
  };
}

function pickUploaded(
  req: express.Request,
  field: string,
): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

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

type DragDropItem = {
  id: string;
  label: unknown;
  image: unknown;
  widthPercent: number;
  correctTargetId: string;
};

type DragDropTarget = {
  id: string;
  x: number;
  y: number;
  snapRadius: number;
};

type DragDropConfig = {
  version: 1 | 2;
  items: DragDropItem[];
  targets: DragDropTarget[];
};

function readFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDragDropCoordinate(value: unknown) {
  return Math.round(readFiniteNumber(value) * 1000) / 1000;
}

function normalizeDragDropWidth(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
    ? value
    : 12;
}

function legacyDragDropTargetId(
  index: number,
  itemId: string,
  x: number,
  y: number,
  snapRadius: number,
) {
  const value = `${index}\u0000${itemId}\u0000${x}\u0000${y}\u0000${snapRadius}`;
  let hash = 2166136261;

  for (let character = 0; character < value.length; character += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(character), 16777619);
  }

  return `legacy-target-${(hash >>> 0).toString(36)}`;
}

function normalizeDragDropConfig(value: unknown): DragDropConfig {
  if (Array.isArray(value)) {
    const items: DragDropItem[] = [];
    const targets: DragDropTarget[] = [];
    const targetIds = new Set<string>();

    value.forEach((entry, index) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      const id =
        typeof item.id === "string" && item.id
          ? item.id
          : `legacy-item-${index + 1}`;
      const x = normalizeDragDropCoordinate(item.targetX);
      const y = normalizeDragDropCoordinate(item.targetY);
      const snapRadius = readFiniteNumber(item.tolerance);
      const targetIdBase = legacyDragDropTargetId(index, id, x, y, snapRadius);
      let targetId = targetIdBase;
      let collisionSuffix = 2;
      while (targetIds.has(targetId)) {
        targetId = `${targetIdBase}-${collisionSuffix}`;
        collisionSuffix += 1;
      }
      targetIds.add(targetId);

      items.push({
        id,
        label: item.label ?? "",
        image: item.image ?? null,
        widthPercent: normalizeDragDropWidth(item.widthPercent),
        correctTargetId: targetId,
      });
      targets.push({ id: targetId, x, y, snapRadius });
    });

    return { version: 1, items, targets };
  }

  if (!value || typeof value !== "object") {
    return { version: 2, items: [], targets: [] };
  }

  const config = value as Record<string, unknown>;
  if (
    (config.version !== 1 && config.version !== 2) ||
    !Array.isArray(config.items) ||
    !Array.isArray(config.targets)
  ) {
    return { version: 2, items: [], targets: [] };
  }

  return {
    version: config.version,
    items: config.items.map((entry, index) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      return {
        id:
          typeof item.id === "string" && item.id
            ? item.id
            : `item-${index + 1}`,
        label: item.label ?? "",
        image: item.image ?? null,
        widthPercent: normalizeDragDropWidth(item.widthPercent),
        correctTargetId:
          typeof item.correctTargetId === "string" ? item.correctTargetId : "",
      };
    }),
    targets: config.targets.map((entry, index) => {
      const target =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      return {
        id:
          typeof target.id === "string" && target.id
            ? target.id
            : `target-${index + 1}`,
        x: normalizeDragDropCoordinate(target.x),
        y: normalizeDragDropCoordinate(target.y),
        snapRadius: readFiniteNumber(target.snapRadius),
      };
    }),
  };
}

function normalizeTaskDifficulties(value: unknown) {
  const difficulties = parseJsonValue<Record<string, unknown>>(value, {});
  const normalized = { ...difficulties };

  if (!("5–8" in normalized) && "6–8" in normalized) {
    normalized["5–8"] = normalized["6–8"];
  }
  if (!("17–18" in normalized) && "16–19" in normalized) {
    normalized["17–18"] = normalized["16–19"];
  }
  delete normalized["6–8"];
  delete normalized["16–19"];

  return normalized;
}

function deserializeTask<
  T extends {
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
  },
>(task: T) {
  const dragDropConfig = normalizeDragDropConfig(
    parseJsonValue<unknown>(task.dragDropItems, []),
  );

  return {
    ...task,
    categories: deserializeCategories(task.category),
    difficulties: normalizeTaskDifficulties(task.difficulties),
    bodyBlocks: parseJsonValue<unknown[]>(task.bodyBlocks, []),
    challengeBlocks: parseJsonValue<unknown[]>(task.challengeBlocks, []),
    answerType: String(task.answerType ?? "multiple_choice"),
    answers: parseJsonValue<PlayTask["answers"]>(task.answers, []),
    shortAnswer: String(task.shortAnswer ?? ""),
    rangeAnswers: parseJsonValue<PlayTask["rangeAnswers"]>(
      task.rangeAnswers,
      [],
    ),
    dragDropBackground: parseJsonValue<unknown>(task.dragDropBackground, null),
    dragDropItems: dragDropConfig.items,
    dragDropTargets: dragDropConfig.targets,
    dragDropVersion: dragDropConfig.version,
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
    difficulties: normalizeTaskDifficulties(task.difficulties),
    status: task.status,
  };
}

const TASK_CATEGORIES = [
  "Algoritmos y programación",
  "Estructuras de datos y representaciones",
  "Procesos computacionales y hardware",
  "Comunicación y redes",
  "Interacción, sistemas y sociedad",
];

const TASK_AGE_RANGES = ["5–8", "8–10", "10–12", "12–14", "14–16", "17–18"];

const TASK_ANSWER_TYPES = [
  "multiple_choice",
  "short_text",
  "range",
  "drag_drop",
];

type ContentBlockInput = {
  content?: unknown;
  image?: unknown;
};

function blockHasContent(block: unknown) {
  if (!block || typeof block !== "object") {
    return false;
  }

  const typed = block as ContentBlockInput;
  const text = typeof typed.content === "string" ? typed.content.trim() : "";
  return text.length > 0 || Boolean(typed.image);
}

function countFilledBlocks(value: unknown) {
  return Array.isArray(value) ? value.filter(blockHasContent).length : 0;
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTaskPayload(body: Record<string, unknown>) {
  const title = readText(body.title);

  if (!title) {
    throw new Error("El título es obligatorio.");
  }

  const categories = Array.isArray(body.categories)
    ? body.categories.filter((item): item is string => typeof item === "string")
    : typeof body.category === "string" && body.category
      ? [body.category]
      : [];

  if (categories.length === 0) {
    throw new Error("Debes seleccionar al menos una categoría.");
  }

  const unknownCategory = categories.find(
    (category) => !TASK_CATEGORIES.includes(category),
  );

  if (unknownCategory) {
    throw new Error(`La categoría "${unknownCategory}" no es válida.`);
  }

  const difficulties =
    body.difficulties && typeof body.difficulties === "object"
      ? (body.difficulties as Record<string, unknown>)
      : {};

  const activeRanges = Object.entries(difficulties).filter(
    ([, value]) => readText(value).length > 0,
  );

  if (activeRanges.length === 0) {
    throw new Error(
      "Debes activar al menos un rango de edad con su dificultad.",
    );
  }

  const unknownRange = activeRanges.find(
    ([range]) => !TASK_AGE_RANGES.includes(range),
  );

  if (unknownRange) {
    throw new Error(`El rango de edad "${unknownRange[0]}" no es válido.`);
  }

  const invalidDifficulty = activeRanges.find(
    ([, value]) => !isDifficultyKey(readText(value)),
  );

  if (invalidDifficulty) {
    throw new Error(
      `La dificultad "${readText(invalidDifficulty[1])}" no es válida para el rango ${invalidDifficulty[0]}.`,
    );
  }

  if (countFilledBlocks(body.bodyBlocks) === 0) {
    throw new Error("Debes agregar contenido en el cuerpo.");
  }

  if (countFilledBlocks(body.challengeBlocks) === 0) {
    throw new Error("Debes agregar contenido en la pregunta o desafío.");
  }

  const answerType = readText(body.answerType) || "multiple_choice";

  if (!TASK_ANSWER_TYPES.includes(answerType)) {
    throw new Error("El tipo de respuesta no es válido.");
  }

  const explanation = readText(body.explanation);

  if (!explanation) {
    throw new Error("La explicación de la respuesta es obligatoria.");
  }

  const answers = Array.isArray(body.answers) ? body.answers : [];
  const correctAnswerId = readText(body.correctAnswerId);
  const shortAnswer = readText(body.shortAnswer);
  const rangeAnswers = Array.isArray(body.rangeAnswers)
    ? body.rangeAnswers
    : [];
  const dragDropItems = Array.isArray(body.dragDropItems)
    ? body.dragDropItems
    : [];
  const dragDropTargets = Array.isArray(body.dragDropTargets)
    ? body.dragDropTargets
    : [];
  let dragDropConfig: {
    version: 2;
    items: DragDropItem[];
    targets: DragDropTarget[];
  } = {
    version: 2,
    items: [],
    targets: [],
  };

  if (answerType === "multiple_choice") {
    const filledAnswers = answers.filter(
      (answer) =>
        answer &&
        typeof answer === "object" &&
        countFilledBlocks((answer as { blocks?: unknown }).blocks) > 0,
    );

    if (filledAnswers.length < 2) {
      throw new Error("Debes completar al menos dos respuestas.");
    }

    const { mode, ids } = parseMcCorrectness(correctAnswerId);

    if (mode === "single" && ids.length !== 1) {
      throw new Error("Debes marcar exactamente una respuesta correcta.");
    }

    if (mode !== "single" && ids.length < 2) {
      throw new Error("Debes marcar al menos dos respuestas correctas.");
    }

    const filledIds = new Set(
      filledAnswers.map((answer) => String((answer as { id?: unknown }).id)),
    );
    const missing = ids.find((id) => !filledIds.has(id));

    if (missing) {
      throw new Error(
        "Las respuestas marcadas como correctas deben tener contenido.",
      );
    }
  }

  if (answerType === "short_text" && !shortAnswer) {
    throw new Error("Debes definir la respuesta corta esperada.");
  }

  if (answerType === "range") {
    if (rangeAnswers.length === 0) {
      throw new Error("Debes agregar al menos un rango válido.");
    }

    for (const rangeAnswer of rangeAnswers) {
      const range = (rangeAnswer ?? {}) as Record<string, unknown>;
      const min = Number(range.min);
      const max = Number(range.max);

      if (!readText(range.label)) {
        throw new Error("Cada rango debe tener una etiqueta.");
      }

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error("Cada rango debe tener valores numéricos válidos.");
      }

      if (min > max) {
        throw new Error(
          "En cada rango, el mínimo no puede ser mayor que el máximo.",
        );
      }
    }
  }

  if (answerType === "drag_drop") {
    if (!body.dragDropBackground) {
      throw new Error(
        "Debes agregar la imagen de fondo para arrastrar y soltar.",
      );
    }

    if (dragDropItems.length === 0 || dragDropTargets.length === 0) {
      throw new Error(
        "Debes agregar al menos un objeto arrastrable y un destino.",
      );
    }

    if (dragDropItems.length !== dragDropTargets.length) {
      throw new Error(
        "Debe haber la misma cantidad de objetos arrastrables y destinos.",
      );
    }

    const normalizedItems: DragDropItem[] = [];
    const normalizedTargets: DragDropTarget[] = [];
    const itemIds = new Set<string>();
    const targetIds = new Set<string>();

    for (const dragDropItem of dragDropItems) {
      const item = (dragDropItem ?? {}) as Record<string, unknown>;
      const id = readText(item.id);
      const label = readText(item.label);
      const widthPercent = item.widthPercent;
      const correctTargetId = readText(item.correctTargetId);

      if (!id) {
        throw new Error("Cada objeto arrastrable debe tener un ID.");
      }

      if (itemIds.has(id)) {
        throw new Error(
          "Los IDs de los objetos arrastrables deben ser únicos.",
        );
      }
      itemIds.add(id);

      if (!label) {
        throw new Error("Cada objeto arrastrable debe tener un nombre.");
      }

      if (!item.image) {
        throw new Error("Cada objeto arrastrable debe tener una imagen.");
      }

      if (
        typeof widthPercent !== "number" ||
        !Number.isFinite(widthPercent) ||
        widthPercent <= 0 ||
        widthPercent > 100
      ) {
        throw new Error(
          "El ancho de cada objeto arrastrable debe ser mayor que 0 y menor o igual a 100.",
        );
      }

      if (!correctTargetId) {
        throw new Error(
          "Cada objeto arrastrable debe tener un destino correcto.",
        );
      }

      normalizedItems.push({
        id,
        label,
        image: item.image,
        widthPercent,
        correctTargetId,
      });
    }

    for (const dragDropTarget of dragDropTargets) {
      const target = (dragDropTarget ?? {}) as Record<string, unknown>;
      const id = readText(target.id);
      const x = target.x;
      const y = target.y;
      const snapRadius = target.snapRadius;

      if (!id) {
        throw new Error("Cada destino debe tener un ID.");
      }

      if (targetIds.has(id)) {
        throw new Error("Los IDs de los destinos deben ser únicos.");
      }
      targetIds.add(id);

      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 100 ||
        y < 0 ||
        y > 100
      ) {
        throw new Error(
          "La posición de cada destino debe estar entre 0 y 100.",
        );
      }

      if (
        typeof snapRadius !== "number" ||
        !Number.isFinite(snapRadius) ||
        snapRadius <= 0 ||
        snapRadius > 100
      ) {
        throw new Error(
          "El radio de ajuste de cada destino debe ser mayor que 0 y menor o igual a 100.",
        );
      }

      normalizedTargets.push({
        id,
        x: normalizeDragDropCoordinate(x),
        y: normalizeDragDropCoordinate(y),
        snapRadius,
      });
    }

    const usedTargetIds = new Set<string>();
    for (const item of normalizedItems) {
      if (!targetIds.has(item.correctTargetId)) {
        throw new Error(
          "El destino correcto de cada objeto debe existir en la tarea.",
        );
      }

      if (usedTargetIds.has(item.correctTargetId)) {
        throw new Error(
          "Cada destino debe ser la respuesta correcta de un solo objeto.",
        );
      }
      usedTargetIds.add(item.correctTargetId);
    }

    if (usedTargetIds.size !== targetIds.size) {
      throw new Error("Cada destino debe usarse exactamente una vez.");
    }

    dragDropConfig = {
      version: 2,
      items: normalizedItems,
      targets: normalizedTargets,
    };
  }

  return {
    title,
    category: serializeJson(categories),
    difficulties: serializeJson(difficulties),
    bodyBlocks: serializeJson(body.bodyBlocks ?? []),
    challengeBlocks: serializeJson(body.challengeBlocks ?? []),
    answerType,
    multipleChoiceOrderMode:
      body.multipleChoiceOrderMode === "random" ? "random" : "fixed",
    answers: serializeJson(answers),
    correctAnswerId,
    shortAnswer: answerType === "short_text" ? shortAnswer : "",
    rangeAnswers: serializeJson(answerType === "range" ? rangeAnswers : []),
    dragDropBackground: serializeJson(
      answerType === "drag_drop" ? (body.dragDropBackground ?? null) : null,
    ),
    dragDropItems: serializeJson(
      answerType === "drag_drop" ? dragDropConfig : [],
    ),
    explanation,
    status: readText(body.status) || "Borrador",
  };
}

const GROUP_CODE_LIFETIME_MINUTES = 30;

function parseOptionalDateInput(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("La fecha de la sesión no es válida.");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha de la sesión no es válida.");
  }

  return date;
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

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

const BEBRAS_SCORING = {
  easy: { letter: "A", correct: 6, wrong: -2 },
  medium: { letter: "B", correct: 9, wrong: -3 },
  hard: { letter: "C", correct: 12, wrong: -4 },
} as const;

type DifficultyKey = keyof typeof BEBRAS_SCORING;

const CATEGORY_AGE_RANGE: Record<string, string> = {
  Guacamayo: "5–8",
  Capibara: "8–10",
  Titi: "10–12",
  Jucumari: "12–14",
  "Yaguareté": "14–16",
  Kuntur: "17–18",
};

function isDifficultyKey(value: unknown): value is DifficultyKey {
  return value === "easy" || value === "medium" || value === "hard";
}

function scoresForDifficulty(difficulty: DifficultyKey) {
  const scoring = BEBRAS_SCORING[difficulty];
  return {
    difficulty,
    minScore: scoring.wrong,
    noAnswerScore: 0,
    maxScore: scoring.correct,
  };
}

function parseContestTasks(body: Record<string, unknown>) {
  const rawTasks = Array.isArray(body.tasks) ? body.tasks : [];
  const taskIds = rawTasks
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    )
    .map((item) => (typeof item.taskId === "string" ? item.taskId.trim() : ""))
    .filter(Boolean);

  const ids = taskIds.length > 0 ? taskIds : parseTaskIds(body.taskIds);

  return [...new Set(ids)];
}

async function buildContestTaskWrites(taskIds: string[], category: string) {
  const ageRange = CATEGORY_AGE_RANGE[category];

  if (!ageRange) {
    throw new Error(
      `La categoría "${category}" no tiene un rango de edad definido.`,
    );
  }

  const drafts = await prisma.taskDraft.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true, difficulties: true },
  });

  const byId = new Map(drafts.map((draft) => [draft.id, draft]));

  return taskIds.map((taskId, index) => {
    const draft = byId.get(taskId);

    if (!draft) {
      throw new Error("Una o más tareas seleccionadas no existen.");
    }

    const difficulties = parseJsonValue<Record<string, unknown>>(
      draft.difficulties,
      {},
    );
    const difficulty = difficulties[ageRange];

    if (!isDifficultyKey(difficulty)) {
      throw new Error(
        `La tarea "${draft.title}" no tiene dificultad definida para el rango ${ageRange} (categoría ${category}).`,
      );
    }

    return {
      taskDraftId: taskId,
      position: index + 1,
      ...scoresForDifficulty(difficulty),
    };
  });
}

function computeInitialScore(writes: Array<{ minScore: number }>) {
  return writes.reduce((total, write) => total - write.minScore, 0);
}

const CONTEST_CATEGORY_NAMES = [
  "Guacamayo",
  "Capibara",
  "Titi",
  "Jucumari",
  "Yaguareté",
  "Kuntur",
];

const SCHOOL_GRADES = [
  { value: "P1", label: "1.º de primaria", category: "Guacamayo" },
  { value: "P2", label: "2.º de primaria", category: "Guacamayo" },
  { value: "P3", label: "3.º de primaria", category: "Capibara" },
  { value: "P4", label: "4.º de primaria", category: "Capibara" },
  { value: "P5", label: "5.º de primaria", category: "Titi" },
  { value: "P6", label: "6.º de primaria", category: "Titi" },
  { value: "S1", label: "1.º de secundaria", category: "Jucumari" },
  { value: "S2", label: "2.º de secundaria", category: "Jucumari" },
  { value: "S3", label: "3.º de secundaria", category: "Yaguareté" },
  { value: "S4", label: "4.º de secundaria", category: "Yaguareté" },
  { value: "S5", label: "5.º de secundaria", category: "Kuntur" },
  { value: "S6", label: "6.º de secundaria", category: "Kuntur" },
] as const;

function gradesForCategory(category: string) {
  return SCHOOL_GRADES.filter((grade) => grade.category === category);
}

function parseGrade(value: unknown, contestCategory: string) {
  const grade = typeof value === "string" ? value.trim() : "";

  if (!grade) {
    throw new Error("Debes indicar el curso del participante.");
  }

  const known = SCHOOL_GRADES.find((item) => item.value === grade);

  if (!known) {
    throw new Error("El curso indicado no es válido.");
  }

  if (contestCategory && known.category !== contestCategory) {
    const allowed = gradesForCategory(contestCategory)
      .map((item) => item.label)
      .join(" o ");
    throw new Error(
      `${known.label} no corresponde a la categoría ${contestCategory}. Este desafío es para ${allowed}.`,
    );
  }

  return grade;
}

type ContestState =
  | "borrador"
  | "programada"
  | "abierta"
  | "suspendida"
  | "cerrada"
  | "consolidada"
  | "publicada";

const ENDED_CONTEST_STATES: ContestState[] = [
  "cerrada",
  "consolidada",
  "publicada",
];

const SUSPENDED_CONTEST_MESSAGE =
  "El desafío está suspendido. Tu tiempo quedó en pausa; espera a que lo reanuden.";

function contestHasEnded(state: ContestState) {
  return ENDED_CONTEST_STATES.includes(state);
}

function computeContestState(contest: {
  publishedAt: Date | null;
  suspendedAt?: Date | null;
  consolidatedAt?: Date | null;
  resultsPublishedAt?: Date | null;
  startsAt: Date;
  endsAt: Date;
}): { state: ContestState; isOpen: boolean } {
  const now = currentDate();

  if (!contest.publishedAt) {
    return { state: "borrador", isOpen: false };
  }

  if (now < contest.startsAt) {
    return { state: "programada", isOpen: false };
  }

  if (now > contest.endsAt) {
    if (contest.resultsPublishedAt) {
      return { state: "publicada", isOpen: false };
    }

    if (contest.consolidatedAt) {
      return { state: "consolidada", isOpen: false };
    }

    return { state: "cerrada", isOpen: false };
  }

  if (contest.suspendedAt) {
    return { state: "suspendida", isOpen: false };
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
  initialScore: number;
  questionDisplayMode: string;
  allowPairs: boolean;
  showFeedback: boolean;
  showSolutions: boolean;
  showTotalScore: boolean;
  publishedAt: Date | null;
  suspendedAt: Date | null;
  consolidatedAt: Date | null;
  resultsPublishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: Array<{
    id: string;
    position: number;
    difficulty: string;
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
    initialScore: contest.initialScore,
    questionDisplayMode: contest.questionDisplayMode,
    allowPairs: contest.allowPairs,
    showFeedback: contest.showFeedback,
    showSolutions: contest.showSolutions,
    showTotalScore: contest.showTotalScore,
    publishedAt: contest.publishedAt?.toISOString() ?? null,
    suspendedAt: contest.suspendedAt?.toISOString() ?? null,
    consolidatedAt: contest.consolidatedAt?.toISOString() ?? null,
    resultsPublishedAt: contest.resultsPublishedAt?.toISOString() ?? null,
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
        difficulty: task.difficulty,
        minScore: task.minScore,
        noAnswerScore: task.noAnswerScore,
        maxScore: task.maxScore,
        task: deserializeTaskSummary(task.taskDraft),
      })) ?? [],
  };
}

function parseContestPayload(body: Record<string, unknown>) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  const durationMinutes = Number(body.durationMinutes);
  const tasks = parseContestTasks(body);

  if (!title) {
    throw new Error("El nombre del desafío es obligatorio.");
  }

  if (!category) {
    throw new Error("Debes elegir la categoría del desafío.");
  }

  if (!CONTEST_CATEGORY_NAMES.includes(category)) {
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

  const questionDisplayMode =
    body.questionDisplayMode === "all" ? "all" : "one_by_one";

  return {
    title,
    category,
    durationMinutes,
    startsAt,
    endsAt,
    questionDisplayMode,
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

  res.header(
    "Access-Control-Allow-Origin",
    req.headers.origin ?? frontendOrigin,
  );
  res.header("Vary", "Origin");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Play-Session",
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );

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

  if (user.status === "rejected") {
    res.status(403).json({
      message: "Tu cuenta fue rechazada. Contacta al administrador.",
    });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    },
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { schools: { orderBy: { createdAt: "asc" } } },
  });

  if (!user) {
    res.status(404).json({ message: "Usuario no encontrado." });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    institutionType: user.institutionType,
    schoolName: user.schoolName,
    schoolCodUe: user.schoolCodUe,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    documents: describeUserDocuments(user),
    schools: user.schools.map(serializeTeacherSchool),
  });
});

app.get("/api/auth/me/schools", requireAuth, async (req, res) => {
  const schools = await prisma.teacherSchool.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "asc" },
  });

  res.json(schools.map(serializeTeacherSchool));
});

app.post(
  "/api/auth/me/schools",
  requireAuth,
  registerUploadMiddleware,
  async (req, res) => {
    const letterFile = pickUploaded(req, "letter");
    const idFrontFile = pickUploaded(req, "idFront");
    const idBackFile = pickUploaded(req, "idBack");
    const schoolName =
      typeof req.body?.schoolName === "string"
        ? req.body.schoolName.trim()
        : "";
    const schoolCodUe =
      typeof req.body?.schoolCodUe === "string" && req.body.schoolCodUe.trim()
        ? req.body.schoolCodUe.trim()
        : null;

    if (idFrontFile || idBackFile) {
      await cleanupFiles(letterFile, idFrontFile, idBackFile);
      res.status(400).json({
        message: "Para un colegio adjunta la carta de su director.",
      });
      return;
    }

    if (!schoolName) {
      await cleanupFiles(letterFile);
      res.status(400).json({ message: "Indica el nombre del colegio." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { schools: true },
    });

    if (!user) {
      await cleanupFiles(letterFile);
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const alreadyMain =
      (user.schoolCodUe && user.schoolCodUe === schoolCodUe) ||
      (user.schoolName ?? "").toLowerCase() === schoolName.toLowerCase();
    const alreadyExtra = user.schools.some(
      (school) =>
        (school.schoolCodUe && school.schoolCodUe === schoolCodUe) ||
        school.schoolName.toLowerCase() === schoolName.toLowerCase(),
    );

    if (alreadyMain || alreadyExtra) {
      await cleanupFiles(letterFile);
      res.status(409).json({ message: "Ese colegio ya está en tu cuenta." });
      return;
    }

    const created = await prisma.teacherSchool.create({
      data: {
        userId: user.id,
        schoolCodUe,
        schoolName,
        letterFilename: letterFile?.filename ?? null,
      },
    });

    res.status(201).json(serializeTeacherSchool(created));
  },
);

app.post(
  "/api/auth/me/schools/:id/letter",
  requireAuth,
  registerUploadMiddleware,
  async (req, res) => {
    const letterFile = pickUploaded(req, "letter");
    const idFrontFile = pickUploaded(req, "idFront");
    const idBackFile = pickUploaded(req, "idBack");
    const school = await prisma.teacherSchool.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!school || school.userId !== req.user!.id) {
      await cleanupFiles(letterFile, idFrontFile, idBackFile);
      res.status(404).json({ message: "Colegio no encontrado." });
      return;
    }

    if (idFrontFile || idBackFile) {
      await cleanupFiles(letterFile, idFrontFile, idBackFile);
      res.status(400).json({
        message: "Para un colegio adjunta la carta de su director.",
      });
      return;
    }

    if (!letterFile) {
      res.status(400).json({ message: "No adjuntaste ninguna carta." });
      return;
    }

    const updated = await prisma.teacherSchool.update({
      where: { id: school.id },
      data: { letterFilename: letterFile.filename, status: "pending" },
    });

    res.json(serializeTeacherSchool(updated));
  },
);

app.delete("/api/auth/me/schools/:id", requireAuth, async (req, res) => {
  const school = await prisma.teacherSchool.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!school || school.userId !== req.user!.id) {
    res.status(404).json({ message: "Colegio no encontrado." });
    return;
  }

  if (school.status === "approved") {
    res.status(409).json({
      message:
        "Ese colegio ya fue aprobado; pide al administrador que lo quite.",
    });
    return;
  }

  await prisma.teacherSchool.delete({ where: { id: school.id } });
  res.status(204).end();
});

app.post(
  "/api/auth/me/documents",
  requireAuth,
  registerUploadMiddleware,
  async (req, res) => {
    const letterFile = pickUploaded(req, "letter");
    const idFrontFile = pickUploaded(req, "idFront");
    const idBackFile = pickUploaded(req, "idBack");
    const allFiles = [letterFile, idFrontFile, idBackFile];
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    if (!user) {
      await cleanupFiles(...allFiles);
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const isSchool = user.institutionType !== "homeschool";

    if (isSchool && (idFrontFile || idBackFile)) {
      await cleanupFiles(...allFiles);
      res.status(400).json({
        message: "Tu cuenta es de colegio: adjunta la carta del director.",
      });
      return;
    }

    if (!isSchool && letterFile) {
      await cleanupFiles(...allFiles);
      res.status(400).json({
        message: "Enseñas en casa: adjunta tu carnet de identidad.",
      });
      return;
    }

    if (!letterFile && !idFrontFile && !idBackFile) {
      res.status(400).json({ message: "No adjuntaste ningún documento." });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        letterFilename: letterFile?.filename ?? user.letterFilename,
        idFrontFilename: idFrontFile?.filename ?? user.idFrontFilename,
        idBackFilename: idBackFile?.filename ?? user.idBackFilename,
      },
    });

    res.json({
      status: updated.status,
      documents: describeUserDocuments(updated),
    });
  },
);

app.post("/api/auth/register", registerUploadMiddleware, async (req, res) => {
  const letterFile = pickUploaded(req, "letter");
  const idFrontFile = pickUploaded(req, "idFront");
  const idBackFile = pickUploaded(req, "idBack");
  const allFiles = [letterFile, idFrontFile, idBackFile];

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
  const schoolCodUe =
    typeof req.body?.schoolCodUe === "string" && req.body.schoolCodUe.trim()
      ? req.body.schoolCodUe.trim()
      : null;
  const schoolName =
    typeof req.body?.schoolName === "string" ? req.body.schoolName.trim() : "";
  const institutionType =
    req.body?.institutionType === "homeschool" ? "homeschool" : "school";
  const phone =
    typeof req.body?.phone === "string" ? req.body.phone.trim() : "";

  const isSchool = institutionType === "school";

  if (institutionType === "homeschool" && schoolCodUe) {
    await cleanupFiles(...allFiles);
    res.status(400).json({
      message: "La educación en casa no puede tener un código de colegio.",
    });
    return;
  }

  if (!firstName || !lastName || !email || !password) {
    await cleanupFiles(...allFiles);
    res.status(400).json({
      message: "Nombres, apellidos, correo y contraseña son obligatorios.",
    });
    return;
  }

  if (!schoolName) {
    await cleanupFiles(...allFiles);
    res.status(400).json({
      message: "Indica tu colegio o el nombre de tu educación en casa.",
    });
    return;
  }

  if (!phone) {
    await cleanupFiles(...allFiles);
    res
      .status(400)
      .json({ message: "El teléfono de contacto es obligatorio." });
    return;
  }

  if (password.length < 6) {
    await cleanupFiles(...allFiles);
    res
      .status(400)
      .json({ message: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await cleanupFiles(...allFiles);
    res.status(409).json({
      message: "Ya existe una cuenta con ese correo.",
      field: "email",
    });
    return;
  }

  let created;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    created = await prisma.user.create({
      data: {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        email,
        passwordHash,
        role: "maestro",
        status: "pending",
        schoolCodUe,
        schoolName,
        institutionType,
        phone,
        letterFilename: isSchool ? (letterFile?.filename ?? null) : null,
        idFrontFilename: isSchool ? null : (idFrontFile?.filename ?? null),
        idBackFilename: isSchool ? null : (idBackFile?.filename ?? null),
      },
    });
  } catch {
    await cleanupFiles(...allFiles);
    res.status(500).json({ message: "No se pudo crear la cuenta." });
    return;
  }

  const pendingDocuments = isSchool ? !letterFile : !idFrontFile || !idBackFile;
  const token = signToken({
    id: created.id,
    email: created.email,
    role: created.role,
  });

  res.status(201).json({
    message: pendingDocuments
      ? "Cuenta de maestro creada. Sube tus documentos desde tu perfil para que te aprueben."
      : "Cuenta de maestro creada. Queda pendiente de aprobación.",
    pendingDocuments,
    token,
    user: {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      status: created.status,
    },
  });
});

app.post("/api/letter/pdf", (req, res) => {
  const field = (name: string, fallback = "") => {
    const value = req.body?.[name];
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  };

  const blank = "____________________";
  const city = field("ciudad", blank);
  const day = field("dia", "____");
  const month = field("mes", "____________");
  const year = field("anio", "______");
  const school = field("colegio", blank);
  const teacher = field("maestro", blank);
  const id = field("ci", "______________");
  const director = field("director", blank);
  const schoolSign = field("colegioFirma", school);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 62, bottom: 62, left: 68, right: 68 },
    info: {
      Title: "Carta de autorización — Desafío Bebras Bolivia",
      Author: director,
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="carta-autorizacion-bebras.pdf"',
  );
  doc.pipe(res);

  doc.font("Times-Roman").fontSize(12);

  const writeSegments = (segments: Array<[string, boolean]>) => {
    segments.forEach(([text, bold], index) => {
      doc
        .font(bold ? "Times-Bold" : "Times-Roman")
        .text(text, { continued: index < segments.length - 1, lineGap: 4 });
    });
  };

  const dateSegments: Array<[string, boolean]> = [
    [city, true],
    [", ", false],
    [day, true],
    [" de ", false],
    [month, true],
    [" de ", false],
    [year, true],
  ];
  const dateWidth = dateSegments.reduce(
    (total, [text, bold]) =>
      total + doc.font(bold ? "Times-Bold" : "Times-Roman").widthOfString(text),
    0,
  );
  doc.x = doc.page.width - doc.page.margins.right - dateWidth;
  writeSegments(dateSegments);
  doc.x = doc.page.margins.left;
  doc.moveDown(1.5);

  doc.font("Times-Bold").text("Señores");
  doc.font("Times-Roman").text("Comité Organizador del Desafío Bebras Bolivia");
  doc.text("Presente.—");
  doc.moveDown(1);

  doc
    .font("Times-Bold")
    .text("Ref.: Autorización para participar como maestro");
  doc.moveDown(1);

  doc.font("Times-Roman").text("De mi mayor consideración:");
  doc.moveDown(1);

  writeSegments([
    [
      "Por medio de la presente, en mi calidad de director(a) de la unidad educativa ",
      false,
    ],
    [school, true],
    [", autorizo al/a la maestro(a) ", false],
    [teacher, true],
    [", con cédula de identidad ", false],
    [id, true],
    [
      ", a representar a nuestra unidad educativa en el Desafío Bebras Bolivia.",
      false,
    ],
  ]);
  doc.moveDown(1);

  doc.text(
    "En esa condición podrá registrar a nuestros estudiantes, organizar los grupos de participación y acompañarlos durante el desafío, en las fechas que el comité organizador establezca.",
    { lineGap: 4 },
  );
  doc.moveDown(1);

  doc.text(
    "Sin otro particular, saludo a ustedes con las consideraciones más distinguidas.",
    { lineGap: 4 },
  );

  doc.moveDown(9);
  const lineY = doc.y;
  doc
    .moveTo(doc.page.margins.left, lineY)
    .lineTo(doc.page.margins.left + 240, lineY)
    .lineWidth(0.8)
    .stroke();
  doc.moveDown(0.6);
  doc.font("Times-Bold").text(director);
  writeSegments([
    ["Director(a) de ", false],
    [schoolSign, true],
  ]);

  doc.end();
});

app.get("/api/schools", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const dep = typeof req.query.dep === "string" ? req.query.dep.trim() : "";

  if (q.length < 2) {
    res.json([]);
    return;
  }

  const schools = await prisma.school.findMany({
    where: {
      name: { contains: q },
      ...(dep ? { dep } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: {
      codUe: true,
      name: true,
      dep: true,
      sec: true,
      dis: true,
    },
  });

  res.json(schools);
});

app.get("/api/public-contests", async (_req, res) => {
  const contests = await prisma.contest.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      category: true,
      durationMinutes: true,
      startsAt: true,
      endsAt: true,
      publishedAt: true,
      suspendedAt: true,
      consolidatedAt: true,
      resultsPublishedAt: true,
    },
  });

  res.json(
    contests.map((contest) => {
      const { state, isOpen } = computeContestState(contest);
      return {
        id: contest.id,
        title: contest.title,
        category: contest.category,
        durationMinutes: contest.durationMinutes,
        startsAt: contest.startsAt.toISOString(),
        endsAt: contest.endsAt.toISOString(),
        state,
        isOpen,
      };
    }),
  );
});

// ---- Práctica pública (sin login) ----

const PRACTICE_CATEGORIES = [
  { name: "Guacamayo", age: "5-8 años", ranges: ["5–8"] },
  { name: "Capibara", age: "8-10 años", ranges: ["8–10"] },
  { name: "Titi", age: "10-12 años", ranges: ["10–12"] },
  { name: "Jucumari", age: "12-14 años", ranges: ["12–14"] },
  { name: "Yaguareté", age: "14-16 años", ranges: ["14–16"] },
  { name: "Kuntur", age: "17-18 años", ranges: ["17–18"] },
] as const;

function taskRanges(task: { difficulties: unknown }) {
  const diff = task.difficulties;
  if (diff && typeof diff === "object") {
    return Object.entries(diff as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.trim() !== "")
      .map(([range]) => range);
  }
  return [];
}

function taskMatchesCategory(
  task: { difficulties: unknown },
  category: (typeof PRACTICE_CATEGORIES)[number],
) {
  const ranges = taskRanges(task);
  return ranges.some((range) => category.ranges.includes(range as never));
}

async function loadPracticeTasks() {
  const tasks = await prisma.taskDraft.findMany({
    where: { isPractice: true },
    orderBy: { updatedAt: "desc" },
  });
  return tasks.map(deserializeTask);
}

app.get("/api/practice/categories", async (_req, res) => {
  const tasks = await loadPracticeTasks();

  const categories = PRACTICE_CATEGORIES.map((category) => ({
    name: category.name,
    age: category.age,
    count: tasks.filter((task) => taskMatchesCategory(task, category)).length,
  })).filter((category) => category.count > 0);

  res.json(categories);
});

app.get("/api/practice/tasks", async (req, res) => {
  const categoryName =
    typeof req.query.category === "string" ? req.query.category : "";
  const category = PRACTICE_CATEGORIES.find((c) => c.name === categoryName);

  if (!category) {
    res.status(404).json({ message: "Categoría no encontrada." });
    return;
  }

  const tasks = await loadPracticeTasks();
  const rows = tasks
    .filter((task) => taskMatchesCategory(task, category))
    .map((task) => ({
      id: task.id,
      title: task.title,
      answerType: task.answerType,
    }));

  res.json({ category: category.name, age: category.age, tasks: rows });
});

app.get("/api/practice/tasks/:id", async (req, res) => {
  const raw = await prisma.taskDraft.findFirst({
    where: { id: req.params.id, isPractice: true },
  });

  if (!raw) {
    res.status(404).json({ message: "Tarea no encontrada." });
    return;
  }

  res.json(renderSafeTask({ position: 0 }, deserializeTask(raw)));
});

app.post("/api/practice/tasks/:id/check", async (req, res) => {
  const raw = await prisma.taskDraft.findFirst({
    where: { id: req.params.id, isPractice: true },
  });

  if (!raw) {
    res.status(404).json({ message: "Tarea no encontrada." });
    return;
  }

  const task = deserializeTask(raw);
  const correct = answerIsCorrect(task, req.body?.payload);

  res.json({
    correct,
    explanation: (task as { explanation?: string }).explanation ?? "",
  });
});

// Banco de tareas, desafíos y gestión de usuarios: solo admin.
app.use(["/api/tasks", "/api/contests", "/api/users"], requireAdmin);
// Grupos: admin y maestro (con sesión); el alcance se filtra por rol.
async function requireApproved(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  requireAuth(req, res, () => {
    void prisma.user
      .findUnique({ where: { id: req.user!.id } })
      .then((user) => {
        if (!user || user.status !== "approved") {
          res.status(403).json({
            message:
              "Tu cuenta está pendiente de aprobación. Sube tus documentos desde tu perfil.",
          });
          return;
        }

        next();
      })
      .catch(() => {
        res.status(500).json({ message: "No se pudo validar tu cuenta." });
      });
  });
}

app.use("/api/groups", requireApproved);
app.use("/api/teams", requireApproved);

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
  let payload;

  try {
    payload = parseTaskPayload(req.body as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Tarea inválida.",
    });
    return;
  }

  const task = await prisma.taskDraft.create({
    data: {
      ...payload,
      isPractice: req.body?.isPractice === true,
    },
  });

  res.status(201).json(deserializeTask(task));
});

app.put("/api/tasks/:id", async (req, res) => {
  let payload;

  try {
    payload = parseTaskPayload(req.body as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Tarea inválida.",
    });
    return;
  }

  const existing = await prisma.taskDraft.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!existing) {
    res.status(404).json({ message: "Task not found" });
    return;
  }

  const task = await prisma.taskDraft.update({
    where: {
      id: req.params.id,
    },
    data: {
      ...payload,
      ...(typeof req.body?.isPractice === "boolean"
        ? { isPractice: req.body.isPractice }
        : {}),
    },
  });

  res.json(deserializeTask(task));
});

app.patch("/api/tasks/:id/practice", async (req, res) => {
  const task = await prisma.taskDraft.update({
    where: { id: req.params.id },
    data: { isPractice: req.body?.isPractice === true },
    select: { id: true, isPractice: true },
  });
  res.json(task);
});

app.delete("/api/tasks/:id", async (req, res) => {
  const contestCount = await prisma.contestTask.count({
    where: { taskDraftId: req.params.id },
  });

  if (contestCount > 0) {
    res.status(409).json({
      message: `Esta tarea está asociada a ${contestCount} desafío(s) y no se puede eliminar.`,
    });
    return;
  }

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
      message:
        error instanceof Error ? error.message : "Invalid contest payload",
    });
    return;
  }

  let taskWrites;

  try {
    taskWrites = await buildContestTaskWrites(payload.tasks, payload.category);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Tareas inválidas.",
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
      initialScore: computeInitialScore(taskWrites),
      questionDisplayMode: payload.questionDisplayMode,
      allowPairs: payload.allowPairs,
      showFeedback: payload.showFeedback,
      showSolutions: payload.showSolutions,
      showTotalScore: payload.showTotalScore,
      tasks: {
        create: taskWrites,
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
      message:
        error instanceof Error ? error.message : "Invalid contest payload",
    });
    return;
  }

  const existingContest = await prisma.contest.findUnique({
    where: {
      id: req.params.id,
    },
    select: {
      id: true,
      publishedAt: true,
      suspendedAt: true,
      consolidatedAt: true,
      resultsPublishedAt: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!existingContest) {
    res.status(404).json({
      message: "Contest not found",
    });
    return;
  }

  const { state: currentState } = computeContestState(existingContest);

  const alreadyRunning =
    currentState === "abierta" || currentState === "suspendida";

  if (alreadyRunning || contestHasEnded(currentState)) {
    res.status(409).json({
      message: alreadyRunning
        ? "El desafío ya empezó; no se puede modificar mientras está en curso."
        : "El desafío ya terminó; no se puede modificar.",
    });
    return;
  }

  let taskWrites;

  try {
    taskWrites = await buildContestTaskWrites(payload.tasks, payload.category);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Tareas inválidas.",
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
        initialScore: computeInitialScore(taskWrites),
        questionDisplayMode: payload.questionDisplayMode,
        allowPairs: payload.allowPairs,
        showFeedback: payload.showFeedback,
        showSolutions: payload.showSolutions,
        showTotalScore: payload.showTotalScore,
        tasks: {
          create: taskWrites,
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
    readinessErrors.push("El desafío necesita nombre.");
  }

  if (contest.endsAt <= contest.startsAt) {
    readinessErrors.push("La ventana de ejecución no es válida.");
  }

  if (contest.durationMinutes <= 0) {
    readinessErrors.push("La duración debe ser mayor que cero.");
  }

  const windowMinutes =
    (contest.endsAt.getTime() - contest.startsAt.getTime()) / 60000;

  if (windowMinutes < contest.durationMinutes) {
    readinessErrors.push(
      `La ventana de ejecución (${Math.round(windowMinutes)} min) es más corta que la duración del desafío (${contest.durationMinutes} min).`,
    );
  }

  if (contest.tasks.length === 0) {
    readinessErrors.push("El desafío necesita al menos una tarea.");
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
      publishedAt: contest.publishedAt ?? currentDate(),
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

const contestWithTasks = {
  tasks: {
    orderBy: { position: "asc" as const },
    include: { taskDraft: true },
  },
};

app.post("/api/contests/:id/suspend", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: contestWithTasks,
  });

  if (!contest) {
    res.status(404).json({ message: "Contest not found" });
    return;
  }

  if (computeContestState(contest).state !== "abierta") {
    res.status(409).json({
      message: "Solo se puede suspender un desafío que esté en curso.",
    });
    return;
  }

  const suspended = await prisma.contest.update({
    where: { id: contest.id },
    data: { suspendedAt: currentDate() },
    include: contestWithTasks,
  });

  res.json(deserializeContest(suspended));
});

app.post("/api/contests/:id/resume", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: contestWithTasks,
  });

  if (!contest) {
    res.status(404).json({ message: "Contest not found" });
    return;
  }

  if (
    computeContestState(contest).state !== "suspendida" ||
    !contest.suspendedAt
  ) {
    res.status(409).json({
      message: "Solo se puede reanudar un desafío suspendido.",
    });
    return;
  }

  const pausedMs = currentDate().getTime() - contest.suspendedAt.getTime();
  const pausedAttempts = await prisma.attempt.findMany({
    where: {
      status: "in_progress",
      endsAt: { not: null },
      team: { group: { contestId: contest.id } },
    },
    select: { id: true, endsAt: true },
  });

  await prisma.$transaction(
    pausedAttempts.map((attempt) =>
      prisma.attempt.update({
        where: { id: attempt.id },
        data: { endsAt: new Date(attempt.endsAt!.getTime() + pausedMs) },
      }),
    ),
  );

  const resumed = await prisma.contest.update({
    where: { id: contest.id },
    data: { suspendedAt: null },
    include: contestWithTasks,
  });

  res.json({
    ...deserializeContest(resumed),
    resumedAttempts: pausedAttempts.length,
  });
});

app.post("/api/contests/:id/consolidate", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: contestWithTasks,
  });

  if (!contest) {
    res.status(404).json({ message: "Contest not found" });
    return;
  }

  const { state } = computeContestState(contest);

  if (!contestHasEnded(state)) {
    res.status(409).json({
      message: "Solo se puede consolidar un desafío cuya ventana ya terminó.",
    });
    return;
  }

  const closedAttempts = await consolidateContest(contest.id);

  const consolidated = await prisma.contest.update({
    where: { id: contest.id },
    data: { consolidatedAt: currentDate() },
    include: contestWithTasks,
  });

  res.json({ ...deserializeContest(consolidated), closedAttempts });
});

app.post("/api/contests/:id/results/publish", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    select: { id: true, consolidatedAt: true },
  });

  if (!contest) {
    res.status(404).json({ message: "Contest not found" });
    return;
  }

  if (!contest.consolidatedAt) {
    res.status(409).json({
      message: "Primero consolida el desafío para calcular los puntajes.",
    });
    return;
  }

  const published = await prisma.contest.update({
    where: { id: contest.id },
    data: { resultsPublishedAt: currentDate() },
    include: contestWithTasks,
  });

  res.json(deserializeContest(published));
});

app.post("/api/contests/:id/results/unpublish", async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });

  if (!contest) {
    res.status(404).json({ message: "Contest not found" });
    return;
  }

  const updated = await prisma.contest.update({
    where: { id: contest.id },
    data: { resultsPublishedAt: null },
    include: contestWithTasks,
  });

  res.json(deserializeContest(updated));
});

app.delete("/api/contests/:id", async (req, res) => {
  const played = await prisma.attempt.count({
    where: {
      status: { not: "pending" },
      team: { group: { contestId: req.params.id } },
    },
  });

  if (played > 0) {
    res.status(409).json({
      message: `Este desafío tiene ${played} participante(s) que ya rindieron; no se puede eliminar sin perder sus resultados.`,
    });
    return;
  }

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
    .replace(
      /(^|\s|-)(\p{L})/gu,
      (_match, sep, letter) => sep + letter.toUpperCase(),
    );
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
  scheduledAt: Date | null;
  firstUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  contest?: { title: string; category: string; allowPairs: boolean } | null;
  teams?: Array<{
    id: string;
    participationMode: string;
    grade: string | null;
    memberOneFirstName: string;
    memberOneLastName: string;
    memberTwoFirstName: string | null;
    memberTwoLastName: string | null;
    personalCode: string;
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
    contestAllowPairs: group.contest?.allowPairs ?? false,
    scheduledAt: group.scheduledAt?.toISOString() ?? null,
    firstUsedAt: group.firstUsedAt?.toISOString() ?? null,
    expiresAt: group.expiresAt?.toISOString() ?? null,
    createdAt: group.createdAt.toISOString(),
    teamCount: group.teams?.length ?? 0,
    teams:
      group.teams?.map((team) => ({
        id: team.id,
        participationMode: team.participationMode,
        grade: team.grade,
        memberOneFirstName: team.memberOneFirstName,
        memberOneLastName: team.memberOneLastName,
        memberTwoFirstName: team.memberTwoFirstName,
        memberTwoLastName: team.memberTwoLastName,
        personalCode: team.personalCode,
        status: team.status,
        createdAt: team.createdAt.toISOString(),
      })) ?? [],
  };
}

const groupContestSelect = {
  contest: { select: { title: true, category: true, allowPairs: true } },
};

// ---- Gestión de maestros (solo admin) ----

app.get("/api/users/maestros", async (_req, res) => {
  const maestros = await prisma.user.findMany({
    where: { role: "maestro" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      schoolName: true,
      schoolCodUe: true,
      institutionType: true,
      phone: true,
      letterFilename: true,
      idFrontFilename: true,
      idBackFilename: true,
      createdAt: true,
      schools: { orderBy: { createdAt: "asc" as const } },
    },
  });

  res.json(
    maestros.map(
      ({
        letterFilename,
        idFrontFilename,
        idBackFilename,
        schoolCodUe,
        institutionType,
        schools,
        ...maestro
      }) => ({
        ...maestro,
        schools: schools.map(serializeTeacherSchool),
        institutionType:
          institutionType ?? (schoolCodUe ? "school" : "homeschool"),
        isHomeschool:
          (institutionType ?? (schoolCodUe ? "school" : "homeschool")) ===
          "homeschool",
        hasLetter: Boolean(letterFilename),
        hasIdFront: Boolean(idFrontFilename),
        hasIdBack: Boolean(idBackFilename),
        createdAt: maestro.createdAt.toISOString(),
      }),
    ),
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

app.post("/api/users/schools/:schoolId/:decision", async (req, res) => {
  const decision = req.params.decision;

  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ message: "Decisión inválida." });
    return;
  }

  const school = await prisma.teacherSchool.findUnique({
    where: { id: req.params.schoolId },
  });

  if (!school) {
    res.status(404).json({ message: "Colegio no encontrado." });
    return;
  }

  const updated = await prisma.teacherSchool.update({
    where: { id: school.id },
    data: { status: decision === "approve" ? "approved" : "rejected" },
  });

  res.json(serializeTeacherSchool(updated));
});

app.get("/api/users/schools/:schoolId/letter", async (req, res) => {
  const school = await prisma.teacherSchool.findUnique({
    where: { id: req.params.schoolId },
  });

  if (!school?.letterFilename) {
    res.status(404).json({ message: "Documento no encontrado." });
    return;
  }

  res.sendFile(resolve(UPLOADS_DIR, school.letterFilename));
});

app.post("/api/users/:id/suspend", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: Number(req.params.id) },
    data: { status: "suspended" },
    select: { id: true, status: true },
  });
  res.json(user);
});

app.get("/api/users/:id/documents/:doc", async (req, res) => {
  const docField =
    req.params.doc === "letter"
      ? "letterFilename"
      : req.params.doc === "idFront"
        ? "idFrontFilename"
        : req.params.doc === "idBack"
          ? "idBackFilename"
          : null;

  if (!docField) {
    res.status(400).json({ message: "Documento inválido." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    select: { [docField]: true },
  });

  const name = user?.[docField as keyof typeof user] as string | undefined;

  if (!name) {
    res
      .status(404)
      .json({ message: "Este maestro no tiene ese documento cargado." });
    return;
  }

  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    res.status(400).json({ message: "Nombre de archivo inválido." });
    return;
  }

  const ext = extname(name).toLowerCase();
  const contentType =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

  res.type(contentType);
  res.setHeader("Content-Disposition", `inline; filename="${name}"`);
  res.sendFile(resolve(UPLOADS_DIR, name), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ message: "Archivo no encontrado." });
    }
  });
});

// ---- Desafíos publicados para armar grupos (admin y maestro) ----

app.get("/api/published-contests", requireAuth, async (_req, res) => {
  const contests = await prisma.contest.findMany({
    where: { publishedAt: { not: null }, endsAt: { gte: currentDate() } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      startsAt: true,
      endsAt: true,
    },
  });
  res.json(
    contests.map((contest) => ({
      ...contest,
      startsAt: contest.startsAt.toISOString(),
      endsAt: contest.endsAt.toISOString(),
    })),
  );
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
    res.status(400).json({
      message: "El nombre del grupo es obligatorio.",
      code: "GROUP_NAME_REQUIRED",
      field: "name",
    });
    return;
  }

  let scheduledAt: Date | null;
  try {
    scheduledAt = parseOptionalDateInput(req.body?.scheduledAt);
  } catch (error) {
    res.status(400).json({
      message:
        error instanceof Error ? error.message : "Fecha de sesión inválida.",
      code: "GROUP_SCHEDULE_INVALID",
      field: "scheduledAt",
    });
    return;
  }

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });

  if (!contest) {
    res.status(400).json({
      message: "El desafío no existe.",
      code: "GROUP_CONTEST_NOT_FOUND",
      field: "contestId",
    });
    return;
  }

  if (!contest.publishedAt) {
    res.status(400).json({
      message: "El desafío debe estar publicado para crear grupos.",
      code: "GROUP_CONTEST_UNPUBLISHED",
      field: "contestId",
    });
    return;
  }

  if (contestHasEnded(computeContestState(contest).state)) {
    res.status(409).json({
      message: "El desafío ya cerró; no es posible crear grupos.",
      code: "GROUP_CONTEST_CLOSED",
      field: "contestId",
    });
    return;
  }

  if (
    scheduledAt &&
    (scheduledAt < contest.startsAt || scheduledAt > contest.endsAt)
  ) {
    res.status(400).json({
      message: "La sesión debe estar dentro del horario del desafío.",
      code: "GROUP_SCHEDULE_OUTSIDE_CONTEST",
      field: "scheduledAt",
    });
    return;
  }

  const accessCode = await generateUniqueAccessCode();
  const recoveryCode = generateCode(10);

  const group = await prisma.contestGroup.create({
    data: {
      contestId,
      name,
      scheduledAt,
      accessCode,
      recoveryCode,
      createdById: req.user?.id ?? null,
    },
    include: { ...groupContestSelect, teams: true },
  });

  res.status(201).json(serializeGroup(group));
});

app.delete("/api/groups/:id", async (req, res) => {
  const group = await prisma.contestGroup.findUnique({
    where: { id: req.params.id },
    select: {
      createdById: true,
      teams: { select: { attempt: { select: { status: true } } } },
    },
  });

  if (
    !group ||
    (req.user?.role === "maestro" && group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Grupo no encontrado." });
    return;
  }

  const played = group.teams.filter(
    (team) => team.attempt && team.attempt.status !== "pending",
  ).length;

  if (played > 0) {
    res.status(409).json({
      message: `Este grupo tiene ${played} participante(s) que ya rindieron; no se puede eliminar sin perder sus resultados.`,
    });
    return;
  }

  await prisma.contestGroup.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

function serializeTeam(team: {
  id: string;
  participationMode: string;
  grade?: string | null;
  memberOneFirstName: string;
  memberOneLastName: string;
  memberTwoFirstName: string | null;
  memberTwoLastName: string | null;
  personalCode?: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: team.id,
    participationMode: team.participationMode,
    grade: team.grade ?? null,
    memberOneFirstName: team.memberOneFirstName,
    memberOneLastName: team.memberOneLastName,
    memberTwoFirstName: team.memberTwoFirstName,
    memberTwoLastName: team.memberTwoLastName,
    personalCode: team.personalCode,
    status: team.status,
    createdAt: team.createdAt.toISOString(),
  };
}

app.delete("/api/teams/:id", async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    include: {
      attempt: { select: { status: true } },
      group: { select: { createdById: true } },
    },
  });

  if (
    !team ||
    (req.user?.role === "maestro" && team.group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Participante no encontrado." });
    return;
  }

  if (team.attempt && team.attempt.status !== "pending") {
    res.status(409).json({
      message:
        "Este participante ya rindió el desafío; no se puede eliminar sin perder su resultado.",
    });
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
    res.status(404).json({
      message: "Participante no encontrado.",
      code: "TEAM_NOT_FOUND",
    });
    return;
  }

  const readField = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const oneFirst = readField(req.body?.memberOneFirstName);
  const oneLast = readField(req.body?.memberOneLastName);
  const isPareja = team.participationMode === "pareja";
  const twoFirst = readField(req.body?.memberTwoFirstName);
  const twoLast = readField(req.body?.memberTwoLastName);
  let grade: string;

  try {
    grade = parseGrade(req.body?.grade, team.group.contest.category);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Curso inválido.",
      code: "TEAM_GRADE_INVALID",
      field: "grade",
    });
    return;
  }

  if (!oneFirst || !oneLast) {
    res.status(400).json({
      message: "Los nombres y apellidos son obligatorios.",
      code: "TEAM_MEMBER_ONE_REQUIRED",
      fields: [
        ...(!oneFirst ? ["memberOneFirstName"] : []),
        ...(!oneLast ? ["memberOneLastName"] : []),
      ],
    });
    return;
  }

  if (isPareja && (!twoFirst || !twoLast)) {
    res.status(400).json({
      message: "Faltan los nombres y apellidos del segundo integrante.",
      code: "TEAM_MEMBER_TWO_REQUIRED",
      fields: [
        ...(!twoFirst ? ["memberTwoFirstName"] : []),
        ...(!twoLast ? ["memberTwoLastName"] : []),
      ],
    });
    return;
  }

  const keyOne = nameKey(oneFirst, oneLast);
  const keyTwo = isPareja ? nameKey(twoFirst, twoLast) : "";

  if (isPareja && keyOne === keyTwo) {
    res.status(400).json({
      message: "Los dos integrantes no pueden ser la misma persona.",
      code: "TEAM_MEMBERS_IDENTICAL",
      fields: ["memberTwoFirstName", "memberTwoLastName"],
    });
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
      message: `${formatName(oneFirst)} ${formatName(oneLast)} ya está registrado en este desafío.`,
      code: "TEAM_MEMBER_DUPLICATE",
      fields: ["memberOneFirstName", "memberOneLastName"],
    });
    return;
  }

  if (isPareja && takenKeys.has(keyTwo)) {
    res.status(409).json({
      message: `${formatName(twoFirst)} ${formatName(twoLast)} ya está registrado en este desafío.`,
      code: "TEAM_MEMBER_DUPLICATE",
      fields: ["memberTwoFirstName", "memberTwoLastName"],
    });
    return;
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: {
      grade,
      memberOneFirstName: formatName(oneFirst),
      memberOneLastName: formatName(oneLast),
      memberTwoFirstName: isPareja ? formatName(twoFirst) : null,
      memberTwoLastName: isPareja ? formatName(twoLast) : null,
    },
  });

  res.json(serializeTeam(updated));
});

app.get("/api/groups/:id/roster-template", async (req, res) => {
  const group = await prisma.contestGroup.findUnique({
    where: { id: String(req.params.id) },
    include: { contest: true },
  });

  if (
    !group ||
    (req.user?.role === "maestro" && group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Grupo no encontrado." });
    return;
  }

  const grades = gradesForCategory(group.contest.category);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Participantes");

  sheet.columns = ROSTER_COLUMNS.map((header) => ({
    header,
    key: header,
    width: header.length + 14,
  }));
  sheet.getRow(1).font = { bold: true };

  sheet.addRow([
    "Ana",
    "Quispe",
    grades[0]?.value ?? "P3",
    "individual",
    "",
    "",
  ]);

  if (group.contest.allowPairs) {
    sheet.addRow([
      "Luis",
      "Mamani",
      grades[0]?.value ?? "P3",
      "pareja",
      "Sofía",
      "Rojas",
    ]);
  }

  const notes = workbook.addWorksheet("Instrucciones");
  notes.columns = [{ width: 100 }];
  notes.addRow(["Cómo llenar esta planilla"]);
  notes.getRow(1).font = { bold: true };
  notes.addRow([""]);
  notes.addRow(["Una fila por participante (o por pareja)."]);
  notes.addRow([
    "Modalidad: escribe individual o pareja. " +
      (group.contest.allowPairs
        ? "Este desafío permite parejas."
        : "Este desafío es solo individual."),
  ]);
  notes.addRow([
    "En pareja, llena también las columnas del compañero. En individual, déjalas vacías.",
  ]);
  notes.addRow([
    `Cursos válidos para la categoría ${group.contest.category}: ${grades
      .map((grade) => `${grade.value} (${grade.label})`)
      .join(", ")}.`,
  ]);
  notes.addRow(["No cambies los títulos de las columnas ni el orden."]);

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="participantes-${group.accessCode}.xlsx"`,
  );
  res.end(Buffer.from(buffer as unknown as ArrayBuffer));
});

app.post("/api/groups/:id/roster", rosterUploadMiddleware, async (req, res) => {
  const group = await prisma.contestGroup.findUnique({
    where: { id: String(req.params.id) },
    include: { contest: true },
  });

  if (
    !group ||
    (req.user?.role === "maestro" && group.createdById !== req.user.id)
  ) {
    res.status(404).json({ message: "Grupo no encontrado." });
    return;
  }

  if (contestHasEnded(computeContestState(group.contest).state)) {
    res
      .status(409)
      .json({ message: "El desafío ya cerró; no es posible inscribir." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ message: "Adjunta la planilla." });
    return;
  }

  const workbook = new ExcelJS.Workbook();

  try {
    if (req.file.originalname.toLowerCase().endsWith(".csv")) {
      await workbook.csv.read(Readable.from(req.file.buffer.toString("utf8")));
    } else {
      await workbook.xlsx.load(
        req.file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    }
  } catch {
    res.status(400).json({
      message: "No pudimos leer la planilla. Usa la plantilla del desafío.",
    });
    return;
  }

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    res.status(400).json({ message: "La planilla está vacía." });
    return;
  }

  const headerRow = sheet.getRow(1);
  const columnByHeader = new Map<string, number>();
  headerRow.eachCell((cell, column) => {
    columnByHeader.set(normalizeHeader(cell.value), column);
  });

  const columnOf = (header: string) =>
    columnByHeader.get(normalizeHeader(header)) ?? 0;
  const firstNameColumn = columnOf("Nombres");
  const lastNameColumn = columnOf("Apellidos");

  if (!firstNameColumn || !lastNameColumn || !columnOf("Curso")) {
    res.status(400).json({
      message:
        "La planilla necesita las columnas Nombres, Apellidos y Curso. Descarga la plantilla.",
    });
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
    takenKeys.add(
      nameKey(existing.memberOneFirstName, existing.memberOneLastName),
    );
    if (existing.memberTwoFirstName && existing.memberTwoLastName) {
      takenKeys.add(
        nameKey(existing.memberTwoFirstName, existing.memberTwoLastName),
      );
    }
  }

  const cellText = (row: ExcelJS.Row, column: number) => {
    if (!column) {
      return "";
    }

    const value = row.getCell(column).value;

    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "object" && "richText" in value) {
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    }

    if (typeof value === "object" && "text" in value) {
      return String(value.text).trim();
    }

    return String(value).trim();
  };

  const created: Array<{ row: number; name: string; personalCode: string }> =
    [];
  const skipped: Array<{ row: number; name: string; reason: string }> = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const oneFirst = cellText(row, firstNameColumn);
    const oneLast = cellText(row, lastNameColumn);
    const twoFirst = cellText(row, columnOf("Nombres del compañero"));
    const twoLast = cellText(row, columnOf("Apellidos del compañero"));
    const rawMode = normalizeHeader(cellText(row, columnOf("Modalidad")));
    const label = `${oneFirst} ${oneLast}`.trim();

    if (!oneFirst && !oneLast && !twoFirst && !twoLast) {
      continue;
    }

    if (!oneFirst || !oneLast) {
      skipped.push({
        row: rowNumber,
        name: label || "(sin nombre)",
        reason: "Faltan nombres o apellidos.",
      });
      continue;
    }

    const isPair = rawMode === "pareja" || Boolean(twoFirst || twoLast);

    if (isPair && !group.contest.allowPairs) {
      skipped.push({
        row: rowNumber,
        name: label,
        reason: "Este desafío no permite parejas.",
      });
      continue;
    }

    if (isPair && (!twoFirst || !twoLast)) {
      skipped.push({
        row: rowNumber,
        name: label,
        reason: "Faltan los datos del compañero.",
      });
      continue;
    }

    let grade: string;

    try {
      grade = gradeFromCell(
        cellText(row, columnOf("Curso")),
        group.contest.category,
      );
    } catch (error) {
      skipped.push({
        row: rowNumber,
        name: label,
        reason: error instanceof Error ? error.message : "Curso inválido.",
      });
      continue;
    }

    const keyOne = nameKey(oneFirst, oneLast);
    const keyTwo = isPair ? nameKey(twoFirst, twoLast) : "";

    if (isPair && keyOne === keyTwo) {
      skipped.push({
        row: rowNumber,
        name: label,
        reason: "Los dos integrantes son la misma persona.",
      });
      continue;
    }

    if (takenKeys.has(keyOne) || (keyTwo && takenKeys.has(keyTwo))) {
      skipped.push({
        row: rowNumber,
        name: label,
        reason: "Ya está inscrito en este desafío.",
      });
      continue;
    }

    const personalCode = await generateUniquePersonalCode();
    await prisma.team.create({
      data: {
        groupId: group.id,
        participationMode: isPair ? "pareja" : "individual",
        grade,
        memberOneFirstName: formatName(oneFirst),
        memberOneLastName: formatName(oneLast),
        memberTwoFirstName: isPair ? formatName(twoFirst) : null,
        memberTwoLastName: isPair ? formatName(twoLast) : null,
        personalCode,
        attempt: { create: { status: "pending" } },
      },
    });

    takenKeys.add(keyOne);
    if (keyTwo) {
      takenKeys.add(keyTwo);
    }

    created.push({
      row: rowNumber,
      name: `${formatName(oneFirst)} ${formatName(oneLast)}`,
      personalCode,
    });
  }

  res.status(created.length > 0 ? 201 : 200).json({ created, skipped });
});

app.post("/api/groups/:id/teams", async (req, res) => {
  const group = await prisma.contestGroup.findUnique({
    where: { id: req.params.id },
    include: { contest: true },
  });

  if (
    !group ||
    (req.user?.role === "maestro" && group.createdById !== req.user.id)
  ) {
    res.status(404).json({
      message: "Grupo no encontrado.",
      code: "TEAM_GROUP_NOT_FOUND",
    });
    return;
  }

  if (contestHasEnded(computeContestState(group.contest).state)) {
    res.status(409).json({
      message: "El desafío ya cerró; no es posible inscribir.",
      code: "TEAM_CONTEST_CLOSED",
    });
    return;
  }

  const mode =
    req.body?.participationMode === "pareja" ? "pareja" : "individual";
  const readField = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const oneFirst = readField(req.body?.memberOneFirstName);
  const oneLast = readField(req.body?.memberOneLastName);
  const twoFirst = readField(req.body?.memberTwoFirstName);
  const twoLast = readField(req.body?.memberTwoLastName);

  if (!oneFirst || !oneLast) {
    res.status(400).json({
      message: "Los nombres y apellidos son obligatorios.",
      code: "TEAM_MEMBER_ONE_REQUIRED",
      fields: [
        ...(!oneFirst ? ["memberOneFirstName"] : []),
        ...(!oneLast ? ["memberOneLastName"] : []),
      ],
    });
    return;
  }

  if (mode === "pareja" && !group.contest.allowPairs) {
    res.status(400).json({
      message: "Este desafío no permite parejas.",
      code: "TEAM_PAIRS_NOT_ALLOWED",
    });
    return;
  }

  if (mode === "pareja" && (!twoFirst || !twoLast)) {
    res.status(400).json({
      message: "Faltan los nombres y apellidos del segundo integrante.",
      code: "TEAM_MEMBER_TWO_REQUIRED",
      fields: [
        ...(!twoFirst ? ["memberTwoFirstName"] : []),
        ...(!twoLast ? ["memberTwoLastName"] : []),
      ],
    });
    return;
  }

  let grade: string;

  try {
    grade = parseGrade(req.body?.grade, group.contest.category);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Curso inválido.",
      code: "TEAM_GRADE_INVALID",
      field: "grade",
    });
    return;
  }

  const keyOne = nameKey(oneFirst, oneLast);
  const keyTwo = mode === "pareja" ? nameKey(twoFirst, twoLast) : "";

  if (mode === "pareja" && keyOne === keyTwo) {
    res.status(400).json({
      message: "Los dos integrantes no pueden ser la misma persona.",
      code: "TEAM_MEMBERS_IDENTICAL",
      fields: ["memberTwoFirstName", "memberTwoLastName"],
    });
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
    takenKeys.add(
      nameKey(existing.memberOneFirstName, existing.memberOneLastName),
    );
    if (existing.memberTwoFirstName && existing.memberTwoLastName) {
      takenKeys.add(
        nameKey(existing.memberTwoFirstName, existing.memberTwoLastName),
      );
    }
  }

  if (takenKeys.has(keyOne)) {
    res.status(409).json({
      message: `${formatName(oneFirst)} ${formatName(oneLast)} ya está registrado en este desafío.`,
      code: "TEAM_MEMBER_DUPLICATE",
      fields: ["memberOneFirstName", "memberOneLastName"],
    });
    return;
  }

  if (mode === "pareja" && takenKeys.has(keyTwo)) {
    res.status(409).json({
      message: `${formatName(twoFirst)} ${formatName(twoLast)} ya está registrado en este desafío.`,
      code: "TEAM_MEMBER_DUPLICATE",
      fields: ["memberTwoFirstName", "memberTwoLastName"],
    });
    return;
  }

  const personalCode = await generateUniquePersonalCode();

  const team = await prisma.team.create({
    data: {
      groupId: group.id,
      participationMode: mode,
      grade,
      memberOneFirstName: formatName(oneFirst),
      memberOneLastName: formatName(oneLast),
      memberTwoFirstName: mode === "pareja" ? formatName(twoFirst) : null,
      memberTwoLastName: mode === "pareja" ? formatName(twoLast) : null,
      personalCode,
      attempt: { create: { status: "pending" } },
    },
  });

  res.status(201).json(serializeTeam(team));
});

// ---- Entrada del estudiante (público, sin login) ----

app.get("/api/play/group/:code", async (req, res) => {
  const code = String(req.params.code ?? "")
    .trim()
    .toUpperCase();

  const group = await prisma.contestGroup.findUnique({
    where: { accessCode: code },
    include: { contest: true },
  });

  if (!group) {
    res.status(404).json({ message: "Código no encontrado." });
    return;
  }

  if (group.expiresAt && group.expiresAt < currentDate()) {
    res.status(410).json({ message: "El código ya expiró." });
    return;
  }

  if (!group.contest.publishedAt) {
    res.status(409).json({ message: "El desafío aún no está disponible." });
    return;
  }

  const { state } = computeContestState(group.contest);

  if (contestHasEnded(state)) {
    res.status(409).json({ message: "El desafío ya cerró." });
    return;
  }

  res.json({
    groupName: group.name,
    contestTitle: group.contest.title,
    contestCategory: group.contest.category,
    allowPairs: group.contest.allowPairs,
    durationMinutes: group.contest.durationMinutes,
    grades: group.contest.category
      ? gradesForCategory(group.contest.category)
      : SCHOOL_GRADES,
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

  if (group.expiresAt && group.expiresAt < currentDate()) {
    res.status(410).json({ message: "El código ya expiró." });
    return;
  }

  if (!group.contest.publishedAt) {
    res.status(409).json({ message: "El desafío aún no está disponible." });
    return;
  }

  if (contestHasEnded(computeContestState(group.contest).state)) {
    res
      .status(409)
      .json({ message: "El desafío ya cerró; no es posible registrarse." });
    return;
  }

  if (mode === "pareja" && !group.contest.allowPairs) {
    res.status(400).json({ message: "Este desafío no permite parejas." });
    return;
  }

  if (mode === "pareja" && (!memberTwoFirstName || !memberTwoLastName)) {
    res.status(400).json({
      message: "Faltan los nombres y apellidos del segundo integrante.",
    });
    return;
  }

  let grade: string;

  try {
    grade = parseGrade(req.body?.grade, group.contest.category);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Curso inválido.",
    });
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
      id: true,
      groupId: true,
      personalCode: true,
      participationMode: true,
      memberOneFirstName: true,
      memberOneLastName: true,
      memberTwoFirstName: true,
      memberTwoLastName: true,
    },
  });

  const teamKeys = (team: (typeof existingTeams)[number]) => {
    const keys = [nameKey(team.memberOneFirstName, team.memberOneLastName)];
    if (team.memberTwoFirstName && team.memberTwoLastName) {
      keys.push(nameKey(team.memberTwoFirstName, team.memberTwoLastName));
    }
    return keys;
  };

  const takenKeys = new Set<string>();
  for (const existing of existingTeams) {
    for (const key of teamKeys(existing)) {
      takenKeys.add(key);
    }
  }

  if (mode === "individual") {
    const sameTeam = existingTeams.find(
      (existing) =>
        existing.groupId === group.id &&
        existing.participationMode === "individual" &&
        nameKey(existing.memberOneFirstName, existing.memberOneLastName) ===
          keyOne,
    );

    if (sameTeam) {
      res.status(200).json({
        personalCode: sameTeam.personalCode,
        teamId: sameTeam.id,
        groupName: group.name,
        contestTitle: group.contest.title,
        alreadyRegistered: true,
      });
      return;
    }
  }

  const oneName = `${formatName(memberOneFirstName)} ${formatName(memberOneLastName)}`;
  if (takenKeys.has(keyOne)) {
    res.status(409).json({
      message: `${oneName} ya está registrado en este desafío.`,
    });
    return;
  }

  if (mode === "pareja" && takenKeys.has(keyTwo)) {
    const twoName = `${formatName(memberTwoFirstName)} ${formatName(memberTwoLastName)}`;
    res.status(409).json({
      message: `${twoName} ya está registrado en este desafío.`,
    });
    return;
  }

  const personalCode = await generateUniquePersonalCode();

  const team = await prisma.team.create({
    data: {
      groupId: group.id,
      participationMode: mode,
      grade,
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
    const firstUsedAt = currentDate();
    const expiresAt = new Date(
      firstUsedAt.getTime() + GROUP_CODE_LIFETIME_MINUTES * 60000,
    );
    await prisma.contestGroup.update({
      where: { id: group.id },
      data: { firstUsedAt, expiresAt },
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
      ids: [
        ...new Set(
          raw
            .slice(4)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
    };
  }
  if (raw.startsWith("all:")) {
    return {
      mode: "all",
      ids: [
        ...new Set(
          raw
            .slice(4)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
    };
  }
  return { mode: "single", ids: raw ? [raw] : [] };
}

type PlayTask = {
  id: string;
  title: string;
  bodyBlocks: unknown;
  challengeBlocks: unknown;
  answerType: string;
  multipleChoiceOrderMode: string;
  answers: Array<{ id: unknown; blocks: unknown }>;
  correctAnswerId: string;
  shortAnswer: unknown;
  rangeAnswers: Array<{ min: number; max: number }>;
  dragDropBackground: unknown;
  dragDropItems: DragDropItem[];
  dragDropTargets: DragDropTarget[];
  dragDropVersion: 1 | 2;
  explanation: unknown;
};

function answerHasResponse(answerType: string, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const response = payload as Record<string, unknown>;
  if (answerType === "multiple_choice") {
    return Array.isArray(response.selected) && response.selected.length > 0;
  }
  if (answerType === "short_text") {
    return typeof response.text === "string" && response.text.trim().length > 0;
  }
  if (answerType === "range") {
    const value = String(response.value ?? "").trim();
    return value !== "" && !Number.isNaN(Number(value));
  }
  if (answerType === "drag_drop") {
    return (
      response.placements &&
      typeof response.placements === "object" &&
      Object.keys(response.placements).length > 0
    );
  }
  return false;
}

type ParsedDragDropAnswer =
  | { kind: "targets"; placements: Record<string, string> }
  | {
      kind: "coordinates";
      placements: Record<string, { x: number; y: number }>;
    };

function parseDragDropAnswer(
  task: PlayTask,
  payload: unknown,
): ParsedDragDropAnswer | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const placements = (payload as Record<string, unknown>).placements;
  if (
    !placements ||
    typeof placements !== "object" ||
    Array.isArray(placements)
  ) {
    return null;
  }

  const entries = Object.entries(placements as Record<string, unknown>);
  const itemIds = new Set(task.dragDropItems.map((item) => item.id));
  if (entries.some(([itemId]) => !itemIds.has(itemId))) {
    return null;
  }

  if (entries.every(([, targetId]) => typeof targetId === "string")) {
    const targetIds = new Set(task.dragDropTargets.map((target) => target.id));
    const occupiedTargetIds = new Set<string>();
    const normalizedPlacements: Record<string, string> = {};

    for (const [itemId, targetId] of entries) {
      const normalizedTargetId = targetId as string;
      if (
        !targetIds.has(normalizedTargetId) ||
        occupiedTargetIds.has(normalizedTargetId)
      ) {
        return null;
      }
      occupiedTargetIds.add(normalizedTargetId);
      normalizedPlacements[itemId] = normalizedTargetId;
    }

    return { kind: "targets", placements: normalizedPlacements };
  }

  const normalizedPlacements: Record<string, { x: number; y: number }> = {};
  for (const [itemId, placement] of entries) {
    if (
      !placement ||
      typeof placement !== "object" ||
      Array.isArray(placement)
    ) {
      return null;
    }

    const { x, y } = placement as Record<string, unknown>;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }
    normalizedPlacements[itemId] = { x, y };
  }

  return { kind: "coordinates", placements: normalizedPlacements };
}

function answerIsCorrect(task: PlayTask, payload: unknown) {
  const response =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const type = task.answerType;
  if (type === "multiple_choice") {
    const selected = Array.isArray(response.selected)
      ? response.selected.map(String)
      : [];
    if (selected.length === 0 || new Set(selected).size !== selected.length) {
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
    const text = typeof response.text === "string" ? response.text : "";
    return (
      text.trim().toLowerCase() ===
      String(task.shortAnswer ?? "")
        .trim()
        .toLowerCase()
    );
  }
  if (type === "range") {
    const value = Number(response.value);
    if (Number.isNaN(value)) {
      return false;
    }
    return task.rangeAnswers.some(
      (range) => value >= range.min && value <= range.max,
    );
  }
  if (type === "drag_drop") {
    const items = task.dragDropItems;
    if (items.length === 0) {
      return false;
    }

    const answer = parseDragDropAnswer(task, payload);
    if (!answer) {
      return false;
    }

    if (answer.kind === "targets") {
      return items.every(
        (item) => answer.placements[item.id] === item.correctTargetId,
      );
    }

    if (task.dragDropVersion !== 1) {
      return false;
    }

    const targets = new Map(
      task.dragDropTargets.map((target) => [target.id, target]),
    );
    return items.every((item) => {
      const placement = answer.placements[item.id];
      const target = targets.get(item.correctTargetId);
      return (
        placement &&
        target &&
        Math.hypot(placement.x - target.x, placement.y - target.y) <=
          target.snapRadius
      );
    });
  }
  return false;
}

function seedFromText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function shuffleWithSeed<T>(input: T[], seed: number) {
  const result = [...input];
  let state = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function renderSafeTask(contestTask: { position: number }, task: PlayTask) {
  let answers = task.answers.map((answer) => ({
    id: answer.id,
    blocks: answer.blocks,
  }));
  if (task.multipleChoiceOrderMode === "random") {
    answers = shuffleWithSeed(answers, seedFromText(task.id));
  }

  return {
    taskId: task.id,
    position: contestTask.position,
    title: task.title,
    bodyBlocks: task.bodyBlocks,
    challengeBlocks: task.challengeBlocks,
    answerType: task.answerType,
    multipleChoiceOrderMode: task.multipleChoiceOrderMode,
    multipleChoiceMode: parseMcCorrectness(task.correctAnswerId).mode,
    answers,
    dragDropBackground: task.dragDropBackground,
    dragDropItems: task.dragDropItems.map((item) => ({
      id: item.id,
      label: item.label,
      image: item.image,
      widthPercent: item.widthPercent,
    })),
    dragDropTargets: [...task.dragDropTargets]
      .sort(
        (left, right) =>
          left.x - right.x ||
          left.y - right.y ||
          left.id.localeCompare(right.id),
      )
      .map((target) => ({
        id: target.id,
        x: target.x,
        y: target.y,
        snapRadius: target.snapRadius,
      })),
  };
}

function attemptElapsedMs(attempt: {
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  if (!attempt.startedAt || !attempt.finishedAt) {
    return Number.MAX_SAFE_INTEGER;
  }

  return attempt.finishedAt.getTime() - attempt.startedAt.getTime();
}

async function recomputeRanking(contestId: string) {
  const results = await prisma.result.findMany({
    where: { attempt: { team: { group: { contestId } } } },
    select: {
      id: true,
      totalScore: true,
      attempt: { select: { startedAt: true, finishedAt: true } },
    },
  });

  const ranked = results
    .map((result) => ({
      id: result.id,
      totalScore: result.totalScore,
      elapsedMs: attemptElapsedMs(result.attempt),
    }))
    .sort((left, right) => {
      if (left.totalScore !== right.totalScore) {
        return right.totalScore - left.totalScore;
      }

      return left.elapsedMs - right.elapsedMs;
    });

  for (let i = 0; i < ranked.length; i += 1) {
    await prisma.result.update({
      where: { id: ranked[i].id },
      data: { rankPosition: i + 1 },
    });
  }
}

async function finalizeAttempt(attemptId: string, recomputeRank = true) {
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

  let totalScore = contest.initialScore;
  let correctCount = 0;
  let answeredCount = 0;

  for (const contestTask of contest.tasks) {
    const task = deserializeTask(contestTask.taskDraft) as PlayTask;
    const existing = answersByTask.get(contestTask.taskDraftId);
    let payload: unknown = null;
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

  const now = currentDate();
  const finishedAt =
    attempt.endsAt && attempt.endsAt < now ? attempt.endsAt : now;

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { status: "finished", finishedAt },
  });
  await prisma.result.upsert({
    where: { attemptId: attempt.id },
    update: { totalScore, correctCount, answeredCount, calculatedAt: now },
    create: {
      attemptId: attempt.id,
      totalScore,
      correctCount,
      answeredCount,
      calculatedAt: now,
    },
  });

  if (recomputeRank) {
    await recomputeRanking(contest.id);
  }

  return { totalScore, correctCount, answeredCount };
}

async function consolidateContest(contestId: string) {
  const expired = await prisma.attempt.findMany({
    where: {
      status: "in_progress",
      team: { group: { contestId } },
    },
    select: { id: true },
  });

  for (const attempt of expired) {
    await finalizeAttempt(attempt.id, false);
  }

  await recomputeRanking(contestId);

  return expired.length;
}

const playTeamInclude = {
  attempt: true,
  group: {
    include: {
      contest: {
        include: {
          tasks: {
            orderBy: { position: "asc" as const },
            include: { taskDraft: true },
          },
        },
      },
    },
  },
};

const playTeamLightInclude = {
  attempt: true,
  group: { select: { contestId: true, contest: true } },
};

function findTeamForPlay(personalCode: string) {
  return prisma.team.findUnique({
    where: { personalCode },
    include: playTeamInclude,
  });
}

function findTeamBySession(sessionToken: string) {
  return prisma.team.findUnique({
    where: { sessionToken },
    include: playTeamInclude,
  });
}

function findLightTeamForPlay(personalCode: string) {
  return prisma.team.findUnique({
    where: { personalCode },
    include: playTeamLightInclude,
  });
}

function findLightTeamBySession(sessionToken: string) {
  return prisma.team.findUnique({
    where: { sessionToken },
    include: playTeamLightInclude,
  });
}

const PLAY_SESSION_TTL_MS = 30000;

type PlaySessionState = {
  sessionToken: string | null;
  sessionSeenAt: Date | null;
};

function playSessionIsLive(team: PlaySessionState) {
  return Boolean(
    team.sessionToken &&
    team.sessionSeenAt &&
    currentDate().getTime() - team.sessionSeenAt.getTime() <
      PLAY_SESSION_TTL_MS,
  );
}

function readSessionToken(req: {
  header: (name: string) => string | undefined;
}) {
  const value = req.header("x-play-session");
  return typeof value === "string" ? value.trim() : "";
}

type PlayAuthFailure = "not_found" | "session_gone" | "session_taken";

const PLAY_AUTH_ERRORS: Record<
  PlayAuthFailure,
  { status: number; message: string }
> = {
  not_found: { status: 404, message: "Registro no encontrado." },
  session_gone: {
    status: 401,
    message: "Tu sesión se cerró. Vuelve a entrar con tu nombre.",
  },
  session_taken: {
    status: 409,
    message: "Ya hay una sesión abierta con tu nombre en otro dispositivo.",
  },
};

async function authorizePlay<T extends PlaySessionState & { id: string }>(
  req: { header: (name: string) => string | undefined },
  personalCode: string,
  findByToken: (token: string) => Promise<T | null>,
  findByCode: (code: string) => Promise<T | null>,
): Promise<
  { team: T; error?: never } | { team?: never; error: PlayAuthFailure }
> {
  const token = readSessionToken(req);

  if (token) {
    const team = await findByToken(token);

    if (!team) {
      return { error: "session_gone" };
    }

    await prisma.team.update({
      where: { id: team.id },
      data: { sessionSeenAt: currentDate() },
    });

    return { team };
  }

  const team = personalCode ? await findByCode(personalCode) : null;

  if (!team) {
    return { error: "not_found" };
  }

  if (playSessionIsLive(team)) {
    return { error: "session_taken" };
  }

  return { team };
}

app.post("/api/play/session", async (req, res) => {
  const accessCode =
    typeof req.body?.accessCode === "string"
      ? req.body.accessCode.trim().toUpperCase()
      : "";
  const firstName =
    typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName =
    typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";

  if (!firstName || !lastName) {
    res.status(400).json({ message: "Escribe tu nombre y tu apellido." });
    return;
  }

  const group = await prisma.contestGroup.findUnique({
    where: { accessCode },
    include: { contest: true },
  });

  if (!group) {
    res.status(404).json({ message: "Código no encontrado." });
    return;
  }

  if (group.expiresAt && group.expiresAt < currentDate()) {
    res.status(410).json({ message: "El código ya expiró." });
    return;
  }

  if (!group.contest.publishedAt) {
    res.status(409).json({ message: "El desafío aún no está disponible." });
    return;
  }

  if (contestHasEnded(computeContestState(group.contest).state)) {
    res.status(409).json({ message: "El desafío ya cerro." });
    return;
  }

  const key = nameKey(firstName, lastName);
  const teams = await prisma.team.findMany({ where: { groupId: group.id } });
  const team = teams.find(
    (candidate) =>
      nameKey(candidate.memberOneFirstName, candidate.memberOneLastName) ===
        key ||
      (candidate.memberTwoFirstName !== null &&
        candidate.memberTwoLastName !== null &&
        nameKey(candidate.memberTwoFirstName, candidate.memberTwoLastName) ===
          key),
  );

  if (!team) {
    res.status(404).json({
      message:
        "No encontramos tu registro en este grupo. Revisa cómo escribiste tu nombre.",
    });
    return;
  }

  if (playSessionIsLive(team)) {
    res.status(409).json({
      message:
        "Ya hay una sesión abierta con tu nombre. Ciérrala o espera medio minuto e inténtalo otra vez.",
    });
    return;
  }

  const sessionToken = randomUUID();
  await prisma.team.update({
    where: { id: team.id },
    data: { sessionToken, sessionSeenAt: currentDate() },
  });

  res.status(201).json({
    sessionToken,
    groupName: group.name,
    contestTitle: group.contest.title,
    participationMode: team.participationMode,
    memberOneFirstName: team.memberOneFirstName,
    memberOneLastName: team.memberOneLastName,
    memberTwoFirstName: team.memberTwoFirstName,
    memberTwoLastName: team.memberTwoLastName,
  });
});

app.post("/api/play/session/close", async (req, res) => {
  const token = readSessionToken(req);

  if (token) {
    await prisma.team.updateMany({
      where: { sessionToken: token },
      data: { sessionToken: null, sessionSeenAt: null },
    });
  }

  res.status(204).end();
});

app.post("/api/play/heartbeat", async (req, res) => {
  const token = readSessionToken(req);

  if (!token) {
    res.status(401).json({ message: PLAY_AUTH_ERRORS.session_gone.message });
    return;
  }

  const refreshed = await prisma.team.updateMany({
    where: { sessionToken: token },
    data: { sessionSeenAt: currentDate() },
  });

  if (refreshed.count === 0) {
    res.status(401).json({ message: PLAY_AUTH_ERRORS.session_gone.message });
    return;
  }

  res.json({ ok: true });
});

app.post("/api/play/start", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const auth = await authorizePlay(
    req,
    personalCode,
    findTeamBySession,
    findTeamForPlay,
  );

  if (auth.error) {
    const failure = PLAY_AUTH_ERRORS[auth.error];
    res.status(failure.status).json({ message: failure.message });
    return;
  }

  const team = auth.team;

  if (!team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  const contest = team.group.contest;
  if (computeContestState(contest).state !== "abierta") {
    res
      .status(409)
      .json({ message: "El desafío no está abierto en este momento." });
    return;
  }

  if (team.attempt.status === "finished") {
    res.status(409).json({ message: "Ya entregaste este desafío." });
    return;
  }

  if (team.attempt.status === "pending") {
    const now = currentDate();
    const remainingMinutes = (contest.endsAt.getTime() - now.getTime()) / 60000;

    if (remainingMinutes < contest.durationMinutes) {
      res.status(409).json({
        message:
          "Ya no queda tiempo suficiente para rendir el desafío completo. Habla con tu maestro.",
      });
      return;
    }

    const endsAt = new Date(now.getTime() + contest.durationMinutes * 60000);
    await prisma.attempt.update({
      where: { id: team.attempt.id },
      data: { status: "in_progress", startedAt: now, endsAt },
    });
  }

  res.json({ ok: true });
});

const playAttemptHandler: express.RequestHandler = async (req, res) => {
  const personalCode = String(req.params.personalCode ?? "")
    .trim()
    .toUpperCase();
  const auth = await authorizePlay(
    req,
    personalCode,
    findTeamBySession,
    findTeamForPlay,
  );

  if (auth.error) {
    const failure = PLAY_AUTH_ERRORS[auth.error];
    res.status(failure.status).json({ message: failure.message });
    return;
  }

  const team = auth.team;

  if (!team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  let attempt = team.attempt;
  const contest = team.group.contest;
  const contestState = computeContestState(contest).state;

  if (
    attempt.status === "in_progress" &&
    attempt.endsAt &&
    contestState !== "suspendida" &&
    currentDate() > attempt.endsAt
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
  const correctnessByTask: Record<string, boolean | null> = {};
  for (const answer of savedAnswers) {
    try {
      answers[answer.taskDraftId] = JSON.parse(answer.responsePayload);
    } catch {
      answers[answer.taskDraftId] = null;
    }
    correctnessByTask[answer.taskDraftId] = answer.isCorrect;
  }

  const finished = attempt.status === "finished";
  const resultsPublished = Boolean(contest.resultsPublishedAt);
  const showResults =
    finished &&
    resultsPublished &&
    (contest.showFeedback || contest.showSolutions);
  const tasks = contest.tasks.map((contestTask) => {
    const task = deserializeTask(contestTask.taskDraft) as PlayTask;
    const safe: ReturnType<typeof renderSafeTask> & {
      correct?: boolean | null;
      explanation?: unknown;
    } = renderSafeTask(contestTask, task);
    if (showResults) {
      safe.correct = correctnessByTask[task.id] ?? null;
    }
    if (showResults && contest.showSolutions) {
      safe.explanation = task.explanation;
    }
    return safe;
  });

  const result =
    finished && resultsPublished && contest.showTotalScore
      ? await prisma.result.findUnique({ where: { attemptId: attempt.id } })
      : null;

  res.json({
    contestTitle: contest.title,
    durationMinutes: contest.durationMinutes,
    questionDisplayMode: contest.questionDisplayMode,
    state: contestState,
    status: attempt.status,
    startedAt: attempt.startedAt?.toISOString() ?? null,
    endsAt: attempt.endsAt?.toISOString() ?? null,
    suspendedAt: contest.suspendedAt?.toISOString() ?? null,
    resultsPublished,
    showFeedback: resultsPublished && contest.showFeedback,
    showSolutions: resultsPublished && contest.showSolutions,
    showTotalScore: resultsPublished && contest.showTotalScore,
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
};

app.get("/api/play/attempt", playAttemptHandler);
app.get("/api/play/attempt/:personalCode", playAttemptHandler);

app.post("/api/play/answer", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
  const payload = req.body?.payload ?? null;

  const auth = await authorizePlay(
    req,
    personalCode,
    findLightTeamBySession,
    findLightTeamForPlay,
  );

  if (auth.error) {
    const failure = PLAY_AUTH_ERRORS[auth.error];
    res.status(failure.status).json({ message: failure.message });
    return;
  }

  const team = auth.team;

  if (!team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  if (team.attempt.status !== "in_progress") {
    res.status(409).json({ message: "El desafío no está en curso." });
    return;
  }

  if (computeContestState(team.group.contest).state === "suspendida") {
    res.status(409).json({ message: SUSPENDED_CONTEST_MESSAGE });
    return;
  }

  if (team.attempt.endsAt && currentDate() > team.attempt.endsAt) {
    await finalizeAttempt(team.attempt.id);
    res.status(409).json({ message: "El tiempo terminó." });
    return;
  }

  const contestTask = await prisma.contestTask.findUnique({
    where: {
      contestId_taskDraftId: {
        contestId: team.group.contestId,
        taskDraftId: taskId,
      },
    },
    include: { taskDraft: true },
  });

  if (!contestTask) {
    res.status(404).json({ message: "La tarea no pertenece a este desafío." });
    return;
  }

  const task = deserializeTask(contestTask.taskDraft) as PlayTask;
  if (task.answerType === "drag_drop") {
    const answer = parseDragDropAnswer(task, payload);
    if (
      !answer ||
      (answer.kind === "coordinates" && task.dragDropVersion !== 1)
    ) {
      res.status(400).json({
        message: "La respuesta de arrastrar y soltar no es válida.",
      });
      return;
    }
  }

  await prisma.attemptAnswer.upsert({
    where: {
      attemptId_taskDraftId: {
        attemptId: team.attempt.id,
        taskDraftId: taskId,
      },
    },
    update: {
      responsePayload: JSON.stringify(payload),
      answeredAt: currentDate(),
    },
    create: {
      attemptId: team.attempt.id,
      taskDraftId: taskId,
      responsePayload: JSON.stringify(payload),
      answeredAt: currentDate(),
    },
  });

  res.status(204).send();
});

app.post("/api/play/submit", async (req, res) => {
  const personalCode =
    typeof req.body?.personalCode === "string"
      ? req.body.personalCode.trim().toUpperCase()
      : "";
  const auth = await authorizePlay(
    req,
    personalCode,
    findLightTeamBySession,
    findLightTeamForPlay,
  );

  if (auth.error) {
    const failure = PLAY_AUTH_ERRORS[auth.error];
    res.status(failure.status).json({ message: failure.message });
    return;
  }

  const team = auth.team;

  if (!team.attempt) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  if (team.attempt.status === "finished") {
    res.json({ ok: true });
    return;
  }

  if (computeContestState(team.group.contest).state === "suspendida") {
    res.status(409).json({ message: SUSPENDED_CONTEST_MESSAGE });
    return;
  }

  if (team.attempt.status !== "in_progress") {
    res.status(409).json({ message: "El desafío no está en curso." });
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
    res.status(404).json({ message: "Desafío no encontrado." });
    return;
  }

  const rows = contest.groups.flatMap((group) =>
    group.teams.map((team) => ({
      teamId: team.id,
      groupName: group.name,
      participationMode: team.participationMode,
      grade: team.grade,
      memberOneFirstName: team.memberOneFirstName,
      memberOneLastName: team.memberOneLastName,
      memberTwoFirstName: team.memberTwoFirstName,
      memberTwoLastName: team.memberTwoLastName,
      status: team.attempt?.status ?? "pending",
      elapsedSeconds:
        team.attempt && team.attempt.startedAt && team.attempt.finishedAt
          ? Math.round(attemptElapsedMs(team.attempt) / 1000)
          : null,
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
    state: computeContestState(contest).state,
    rows,
  });
});

async function migrateLegacyDragDropConfigs() {
  const tasks = await prisma.taskDraft.findMany({
    where: { answerType: "drag_drop" },
    select: { id: true, dragDropItems: true },
  });

  for (const task of tasks) {
    const stored = parseJsonValue<unknown>(task.dragDropItems, []);
    if (!Array.isArray(stored)) {
      continue;
    }

    const legacy = normalizeDragDropConfig(stored);
    const targetIds = new Map(
      legacy.targets.map((target) => [target.id, randomUUID()]),
    );
    const migrated = {
      version: 1 as const,
      items: legacy.items.map((item) => ({
        ...item,
        correctTargetId: targetIds.get(item.correctTargetId) ?? randomUUID(),
      })),
      targets: legacy.targets.map((target) => ({
        ...target,
        id: targetIds.get(target.id) ?? randomUUID(),
      })),
    };

    await prisma.taskDraft.update({
      where: { id: task.id },
      data: { dragDropItems: serializeJson(migrated) },
    });
  }
}

const startServer = async () => {
  await prisma.$connect();
  await migrateLegacyDragDropConfigs();
  await mkdir(UPLOADS_DIR, { recursive: true });

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
};

startServer().catch(async (error) => {
  console.error("Failed to start server", error);
  await prisma.$disconnect();
  process.exit(1);
});

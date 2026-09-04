import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const AGE_RANGES = ["5–8", "8–10", "10–12", "12–14", "14–16", "17–18"];

type TaskItem = {
  id: string;
  title: string;
  categories?: string[];
  category?: string[];
  difficulties?: Record<string, string>;
  difficulty?: string;
  question?: string;
  bodyBlocks?: unknown[];
  challengeBlocks?: unknown[];
  answerType?: string;
  multipleChoiceOrderMode?: string;
  answers?: Array<{ id: string; blocks: unknown[]; isCorrect?: boolean }>;
  correctAnswerId?: string;
  shortAnswer?: string;
  rangeAnswers?: unknown[];
  dragDropBackground?: unknown;
  dragDropItems?: unknown;
  dragDropTargets?: unknown[];
  explanation?: string;
  status?: string;
  isPractice?: boolean;
};

function contentBlock(id: string, type: "text" | "challenge", content: string) {
  return { id, type, content, image: null, widthPercent: 100 };
}

async function main() {
  const jsonPath = path.resolve(__dirname, "seed/bebras-tasks.json");

  if (fs.existsSync(jsonPath)) {
    const fileContent = fs.readFileSync(jsonPath, "utf8");
    const tasks: TaskItem[] = JSON.parse(fileContent);

    console.log(`Cargando ${tasks.length} tareas Bebras desde archivo JSON...`);

    for (const task of tasks) {
      const data = {
        title: task.title,
        category: JSON.stringify(task.categories ?? task.category ?? ["Algoritmos y programación"]),
        difficulties: JSON.stringify(task.difficulties ?? {}),
        bodyBlocks: JSON.stringify(task.bodyBlocks ?? []),
        challengeBlocks: JSON.stringify(task.challengeBlocks ?? []),
        answerType: task.answerType ?? "multiple_choice",
        multipleChoiceOrderMode: task.multipleChoiceOrderMode ?? "fixed",
        answers: JSON.stringify(task.answers ?? []),
        correctAnswerId: task.correctAnswerId ?? "",
        shortAnswer: task.shortAnswer ?? "",
        rangeAnswers: JSON.stringify(task.rangeAnswers ?? []),
        dragDropBackground: JSON.stringify(task.dragDropBackground ?? null),
        dragDropItems: JSON.stringify(
          task.dragDropTargets
            ? {
                version: 2,
                items: Array.isArray(task.dragDropItems)
                  ? task.dragDropItems
                  : [],
                targets: task.dragDropTargets,
              }
            : (task.dragDropItems ?? []),
        ),
        explanation: task.explanation ?? "",
        status: task.status ?? "Borrador",
        isPractice: task.isPractice ?? true,
      };

      await prisma.taskDraft.upsert({
        where: { id: task.id },
        update: data,
        create: { id: task.id, ...data },
      });

      console.log(`✓ Tarea registrada: [${task.id}] ${task.title}`);
    }

    console.log(`\n¡Listo! ${tasks.length} tareas Bebras cargadas con éxito.`);
  }

  // Semillas basicas: fixtures que las pruebas e2e esperan por id. Se cargan
  // siempre, haya o no banco JSON; sus ids no chocan con los de las tareas
  // oficiales.
  const fallbackTasks = [
    {
      id: "seed-bebras-easy",
      title: "Semilla Bebras A",
      difficulty: "easy",
      question: "¿Cuál de estas opciones representa el número dos?",
      answers: ["1", "2", "3", "4"],
      correctAnswerId: "B",
      explanation: "La opción B representa el número dos.",
    },
    {
      id: "seed-bebras-medium",
      title: "Semilla Bebras B",
      difficulty: "medium",
      question: "¿Qué número continúa la secuencia 2, 4, 6?",
      answers: ["7", "8", "9", "10"],
      correctAnswerId: "B",
      explanation: "La secuencia aumenta de dos en dos, por lo que continúa con 8.",
    },
    {
      id: "seed-bebras-hard",
      title: "Semilla Bebras C",
      difficulty: "hard",
      question: "Si todos los caminos llevan a B, ¿qué nodo se alcanza?",
      answers: ["A", "B", "C", "D"],
      correctAnswerId: "B",
      explanation: "Todos los caminos descritos terminan en el nodo B.",
    },
  ] as const;

  for (const task of fallbackTasks) {
    const data = {
      title: task.title,
      category: JSON.stringify(["Algoritmos y programación"]),
      difficulties: JSON.stringify(
        Object.fromEntries(
          AGE_RANGES.map((range) => [
            range,
            range === "8–10" ? task.difficulty : "",
          ]),
        ),
      ),
      bodyBlocks: JSON.stringify([
        contentBlock(`${task.id}-body`, "text", "Lee el desafío y selecciona la respuesta correcta."),
      ]),
      challengeBlocks: JSON.stringify([
        contentBlock(`${task.id}-challenge`, "challenge", task.question),
      ]),
      answerType: "multiple_choice",
      multipleChoiceOrderMode: "fixed",
      answers: JSON.stringify(
        task.answers.map((answer, index) => ({
          id: String.fromCharCode(65 + index),
          blocks: [contentBlock(`${task.id}-answer-${index}`, "text", answer)],
        })),
      ),
      correctAnswerId: task.correctAnswerId,
      shortAnswer: "",
      rangeAnswers: "[]",
      dragDropBackground: "null",
      dragDropItems: "[]",
      explanation: task.explanation,
      status: "Borrador",
      isPractice: false,
    };

    await prisma.taskDraft.upsert({
      where: { id: task.id },
      update: data,
      create: { id: task.id, ...data },
    });
  }

  console.log(`Tareas: ${fallbackTasks.length} semillas básicas listas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en el seed de tareas:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const AGE_RANGES = ["5–8", "8–10", "10–12", "12–14", "14–16", "17–18"];

const tasks = [
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
    explanation:
      "La secuencia aumenta de dos en dos, por lo que continúa con 8.",
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

function contentBlock(id: string, type: "text" | "challenge", content: string) {
  return { id, type, content, image: null, widthPercent: 100 };
}

async function main() {
  for (const task of tasks) {
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
        contentBlock(
          `${task.id}-body`,
          "text",
          "Lee el desafío y selecciona la respuesta correcta.",
        ),
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
    };

    await prisma.taskDraft.upsert({
      where: { id: task.id },
      update: data,
      create: { id: task.id, ...data },
    });
  }

  console.log(`Tareas: ${tasks.length} semillas listas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en el seed de tareas:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

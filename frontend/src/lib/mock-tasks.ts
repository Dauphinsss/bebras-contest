import { type StoredTask } from "@/lib/task-schema";

export const seedTasks: StoredTask[] = [
  {
    id: "draft-1",
    title: "Secuencia incorrecta de transformaciones",
    category: "Algoritmos y programación",
    difficulties: {
      "6–8": "",
      "8–10": "",
      "10–12": "hard",
      "12–14": "medium",
      "14–16": "easy",
      "16–19": "",
    },
    bodyBlocks: [
      {
        id: "body-1",
        type: "text",
        content:
          "Xavier quiere programar su primer juego en línea y está aprendiendo a transformar una imagen.",
        image: null,
        widthPercent: 100,
      },
      {
        id: "body-2",
        type: "text",
        content:
          "Solo permite dos operaciones para la imagen: M y R. Todas las operaciones se aplican de izquierda a derecha.",
        image: null,
        widthPercent: 100,
      },
    ],
    challengeBlocks: [
      {
        id: "challenge-1",
        type: "challenge",
        content:
          "¿Qué secuencia de operaciones no transforma la imagen inicial en la imagen final?",
        image: null,
        widthPercent: 100,
      },
    ],
    answers: [
      {
        id: "A",
        blocks: [
          {
            id: "answer-a-1",
            type: "text",
            content: "M R",
            image: null,
            widthPercent: 100,
          },
        ],
      },
      {
        id: "B",
        blocks: [
          {
            id: "answer-b-1",
            type: "text",
            content: "R R R M",
            image: null,
            widthPercent: 100,
          },
        ],
      },
      {
        id: "C",
        blocks: [
          {
            id: "answer-c-1",
            type: "text",
            content: "R M",
            image: null,
            widthPercent: 100,
          },
        ],
      },
      {
        id: "D",
        blocks: [
          {
            id: "answer-d-1",
            type: "text",
            content: "M R M R M R",
            image: null,
            widthPercent: 100,
          },
        ],
      },
    ],
    correctAnswerId: "C",
    explanation:
      "La respuesta correcta es la tercera. Las demás secuencias sí logran la transformación esperada.",
    status: "Borrador",
    updatedAt: "2026-03-29T00:00:00.000Z",
  },
  {
    id: "draft-2",
    title: "Mensajes en cadena",
    category: "Comunicación y redes",
    difficulties: {
      "6–8": "",
      "8–10": "",
      "10–12": "",
      "12–14": "medium",
      "14–16": "medium",
      "16–19": "",
    },
    bodyBlocks: [
      {
        id: "body-3",
        type: "text",
        content:
          "Una red escolar envía mensajes por diferentes nodos. Si un nodo falla, algunos caminos dejan de funcionar.",
        image: null,
        widthPercent: 100,
      },
    ],
    challengeBlocks: [
      {
        id: "challenge-2",
        type: "challenge",
        content:
          "¿Cuál mensaje llega más rápido si la red falla en un nodo intermedio?",
        image: null,
        widthPercent: 100,
      },
    ],
    answers: [
      {
        id: "A",
        blocks: [
          {
            id: "answer-e-1",
            type: "text",
            content: "El mensaje que usa la ruta con respaldo inmediato.",
            image: null,
            widthPercent: 100,
          },
        ],
      },
      {
        id: "B",
        blocks: [
          {
            id: "answer-f-1",
            type: "text",
            content: "El mensaje que pasa por el nodo caído.",
            image: null,
            widthPercent: 100,
          },
        ],
      },
    ],
    correctAnswerId: "A",
    explanation:
      "La ruta con respaldo inmediato evita el nodo caído y mantiene el recorrido más corto.",
    status: "Borrador",
    updatedAt: "2026-03-29T00:00:00.000Z",
  },
];

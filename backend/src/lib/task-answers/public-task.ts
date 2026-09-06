import type { PlayTask } from "./types";
import { parseMcCorrectness } from "./multiple-choice";

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

export function renderSafeTask(
  contestTask: { position: number },
  task: PlayTask,
) {
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
    // The current types use their existing fields. Future types must explicitly
    // project their validated configuration here, never the private answerKey.
    answerConfig: {},
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

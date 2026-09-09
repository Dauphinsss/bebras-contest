import type { PlayTask } from "./types";
import { parseHotspotConfig } from "./image-hotspot";
import { readMultipleChoiceLayout } from "./config";
import { parseMcCorrectness } from "./multiple-choice";
import { parseAssignmentConfig } from "./assignment-answers";

/** Inline blanks contain only a location ID, never a stored or correct answer. */
function publicDocument(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const node = value as Record<string, unknown>;
  const attrs =
    node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
      ? (node.attrs as Record<string, unknown>)
      : {};
  if (node.type === "taskBlank")
    return {
      type: "taskBlank",
      attrs: {
        blankId: typeof attrs.blankId === "string" ? attrs.blankId : "",
      },
    };
  return {
    ...node,
    ...(node.type === "paragraph" && Object.hasOwn(attrs, "indent")
      ? {
          attrs: {
            ...attrs,
            indent:
              typeof attrs.indent === "number" && Number.isFinite(attrs.indent)
                ? Math.min(8, Math.max(0, Math.trunc(attrs.indent)))
                : 0,
          },
        }
      : {}),
    ...(Array.isArray(node.content)
      ? { content: node.content.map(publicDocument) }
      : {}),
  };
}

function publicBlocks(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((block) =>
    block &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    Object.hasOwn(block, "richText")
      ? { ...block, richText: publicDocument(block.richText) }
      : block,
  );
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

export function renderSafeTask(
  contestTask: { position: number },
  task: PlayTask,
) {
  let answers = task.answers.map((answer) => ({
    id: answer.id,
    blocks: publicBlocks(answer.blocks),
  }));
  if (task.multipleChoiceOrderMode === "random") {
    answers = shuffleWithSeed(answers, seedFromText(task.id));
  }

  return {
    taskId: task.id,
    position: contestTask.position,
    title: task.title,
    bodyBlocks: publicBlocks(task.bodyBlocks),
    challengeBlocks: publicBlocks(task.challengeBlocks),
    answerType: task.answerType,
    // The current types use their existing fields. Future types must explicitly
    // project their validated configuration here, never the private answerKey.
    answerConfig:
      task.answerType === "image_hotspot"
        ? parseHotspotConfig(task.answerConfig)
        : task.answerType === "state_grid" || task.answerType === "text_cloze"
          ? parseAssignmentConfig(task.answerType, task.answerConfig)
          : task.answerType === "multiple_choice"
            ? {
                multipleChoiceLayout: readMultipleChoiceLayout(
                  task.answerConfig,
                ),
              }
            : {},
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

import { TaskContentRenderer } from "@/components/task-content-renderer";
import type { ContentBlock } from "@/lib/task-schema";

export function TaskExplanation({
  explanation = "",
  blocks,
}: {
  explanation?: string;
  blocks?: ContentBlock[];
}) {
  return (
    <TaskContentRenderer
      blocks={
        blocks?.length
          ? blocks
          : [
              {
                id: "explanation",
                type: "text",
                content: explanation,
                image: null,
                widthPercent: 100,
              },
            ]
      }
    />
  );
}

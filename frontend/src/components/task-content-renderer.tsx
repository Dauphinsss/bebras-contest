"use client";

import { type ContentBlock } from "@/lib/task-schema";

type TaskContentRendererProps = {
  blocks: ContentBlock[];
  className?: string;
};

export function TaskContentRenderer({
  blocks,
  className,
}: TaskContentRendererProps) {
  return (
    <div className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}>
      {blocks.map((block) => {
        if (block.type === "image" && block.image) {
          return (
            <div key={block.id} className="flex justify-center py-2">
              <img
                alt={block.image.name}
                className="block h-auto max-w-full"
                src={block.image.url}
                style={{ width: `${block.widthPercent}%` }}
              />
            </div>
          );
        }

        if (block.content.trim().length === 0) {
          return null;
        }

        return (
          <p key={block.id} className="whitespace-pre-wrap leading-7">
            {block.content}
          </p>
        );
      })}
    </div>
  );
}

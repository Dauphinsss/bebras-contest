"use client";

import { type ContentBlock } from "@/lib/task-schema";
import { renderInlineText } from "@/lib/rich-text";
import { renderRichTextDocument } from "@/lib/rich-text-document";

type TaskContentRendererProps = {
  blocks: ContentBlock[];
  className?: string;
};

export function TaskContentRenderer({
  blocks,
  className,
}: TaskContentRendererProps) {
  return (
    <div
      className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}
    >
      {blocks.map((block) => {
        if (block.type === "image" && block.image) {
          return (
            <div key={block.id} className="flex justify-center py-2">
              <img
                alt={block.image.name}
                className="block h-auto max-w-full"
                src={block.image.url}
                style={{
                  width: `min(100%, max(${block.widthPercent}%, 16rem))`,
                }}
              />
            </div>
          );
        }

        if (block.content.trim().length === 0) {
          return null;
        }

        return (
          <div
            key={block.id}
            className="whitespace-pre-wrap leading-7 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em]"
          >
            {block.richText
              ? renderRichTextDocument(block.richText)
              : renderInlineText(block.content)}
          </div>
        );
      })}
    </div>
  );
}

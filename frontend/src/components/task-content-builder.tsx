"use client";

import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  type ContentBlock,
  type ContentBlockType,
} from "@/lib/task-schema";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";

type TaskContentBuilderProps = {
  blocks: ContentBlock[];
  description: string;
  allowedBlockTypes: ContentBlockType[];
  textPlaceholder: string;
  onAddBlock: (type?: ContentBlockType) => string | null;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (
    fromBlockId: string,
    toBlockId: string,
    position: "before" | "after",
  ) => void;
  onUpdateBlockContent: (blockId: string, content: string) => void;
  onUpdateBlockImage: (blockId: string, files: FileList | null) => void;
  onUpdateBlockWidth: (blockId: string, widthPercent: number) => void;
  showChallengeErrors: boolean;
};

export function TaskContentBuilder({
  blocks,
  description,
  allowedBlockTypes,
  textPlaceholder,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlockContent,
  onUpdateBlockImage,
  onUpdateBlockWidth,
  showChallengeErrors,
}: TaskContentBuilderProps) {
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageAreaRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingImageBlockIdRef = useRef<string | null>(null);
  const draggingBlockIdRef = useRef<string | null>(null);
  const resizeStateRef = useRef<{
    blockId: string;
    side: "left" | "right";
    startX: number;
    startWidthPx: number;
    containerWidth: number;
  } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    blockId: string;
    position: "before" | "after";
  } | null>(null);
  const [activeResizeBlockId, setActiveResizeBlockId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!pendingImageBlockIdRef.current) {
      return;
    }

    const input = imageInputRefs.current[pendingImageBlockIdRef.current];
    if (input) {
      input.click();
    }

    pendingImageBlockIdRef.current = null;
  }, [blocks]);

  useEffect(() => {
    if (!activeResizeBlockId) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const deltaX = event.clientX - resizeState.startX;
      const nextWidthPx =
        resizeState.startWidthPx +
        (resizeState.side === "right" ? deltaX * 2 : -deltaX * 2);
      const nextWidthPercent = Math.max(
        20,
        Math.min(100, (nextWidthPx / resizeState.containerWidth) * 100),
      );

      onUpdateBlockWidth(resizeState.blockId, Math.round(nextWidthPercent));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      setActiveResizeBlockId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeResizeBlockId, onUpdateBlockWidth]);

  const handleAddImage = () => {
    const blockId = onAddBlock("image");
    if (blockId) {
      pendingImageBlockIdRef.current = blockId;
    }
  };

  const handleDrop = (targetBlockId: string) => {
    const sourceBlockId = draggingBlockIdRef.current;
    const position = dropIndicator?.position ?? "after";

    if (!sourceBlockId || sourceBlockId === targetBlockId) {
      draggingBlockIdRef.current = null;
      setDropIndicator(null);
      return;
    }

    onMoveBlock(sourceBlockId, targetBlockId, position);
    draggingBlockIdRef.current = null;
    setDropIndicator(null);
  };

  const startResize = (
    event: ReactMouseEvent<HTMLButtonElement>,
    block: ContentBlock,
    side: "left" | "right",
  ) => {
    const imageArea = imageAreaRefs.current[block.id];
    if (!imageArea) {
      return;
    }

    const containerWidth = imageArea.getBoundingClientRect().width;
    resizeStateRef.current = {
      blockId: block.id,
      side,
      startX: event.clientX,
      startWidthPx: (containerWidth * block.widthPercent) / 100,
      containerWidth,
    };
    setActiveResizeBlockId(block.id);
  };

  return (
    <FieldGroup>
      <FieldDescription>{description}</FieldDescription>
      {blocks.map((block) => (
        <div
          key={block.id}
          className="relative flex items-center gap-3"
          onDragOver={(event) => {
            event.preventDefault();

            const rect = event.currentTarget.getBoundingClientRect();
            const position =
              event.clientY < rect.top + rect.height / 2 ? "before" : "after";

            setDropIndicator({
              blockId: block.id,
              position,
            });
          }}
          onDragLeave={() => {
            setDropIndicator((current) =>
              current?.blockId === block.id ? null : current,
            );
          }}
          onDrop={() => handleDrop(block.id)}
        >
          {dropIndicator?.blockId === block.id &&
            dropIndicator.position === "before" && (
              <div className="absolute inset-x-2 -top-2 h-1 rounded-full bg-primary/35" />
            )}
          <Button
            className="cursor-grab"
            draggable
            size="icon-sm"
            type="button"
            variant="ghost"
            onDragEnd={() => {
              draggingBlockIdRef.current = null;
              setDropIndicator(null);
            }}
            onDragStart={() => {
              draggingBlockIdRef.current = block.id;
            }}
          >
            <GripVerticalIcon />
          </Button>
          <div className="min-w-0 flex-1">
            {block.type === "image" ? (
              <Field>
                <FieldContent>
                  {!block.image && (
                    <>
                      <Input
                        id={`block-image-${block.id}`}
                        accept="image/*"
                        type="file"
                        ref={(node) => {
                          imageInputRefs.current[block.id] = node;
                        }}
                        onChange={(event) => {
                          onUpdateBlockImage(block.id, event.target.files);
                          event.target.value = "";
                        }}
                      />
                      <FieldDescription>
                        Agrega una imagen en este punto del contenido.
                      </FieldDescription>
                    </>
                  )}
                  {block.image && (
                    <div
                      className="group/image flex justify-center"
                      ref={(node) => {
                        imageAreaRefs.current[block.id] = node;
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          width: `${block.widthPercent}%`,
                          maxWidth: "100%",
                        }}
                      >
                        <img
                          alt={block.image.name}
                          className="block h-auto w-full"
                          draggable={false}
                          src={block.image.url}
                        />
                        <button
                          aria-label="Reducir o ampliar imagen desde la izquierda"
                          className={cn(
                            "absolute top-1/2 left-0 h-12 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm",
                            activeResizeBlockId === block.id
                              ? "flex"
                              : "hidden group-hover/image:flex",
                          )}
                          type="button"
                          onMouseDown={(event) => startResize(event, block, "left")}
                        >
                          <span className="block h-6 w-0.5 rounded-full bg-current" />
                          <span className="ml-0.5 block h-6 w-0.5 rounded-full bg-current" />
                        </button>
                        <button
                          aria-label="Reducir o ampliar imagen desde la derecha"
                          className={cn(
                            "absolute top-1/2 right-0 h-12 w-4 translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm",
                            activeResizeBlockId === block.id
                              ? "flex"
                              : "hidden group-hover/image:flex",
                          )}
                          type="button"
                          onMouseDown={(event) => startResize(event, block, "right")}
                        >
                          <span className="block h-6 w-0.5 rounded-full bg-current" />
                          <span className="ml-0.5 block h-6 w-0.5 rounded-full bg-current" />
                        </button>
                      </div>
                    </div>
                  )}
                </FieldContent>
              </Field>
            ) : (
              <Field
                data-invalid={
                  showChallengeErrors &&
                  block.type === "challenge" &&
                  block.content.trim().length === 0
                }
              >
                <FieldContent>
                  <Textarea
                    id={`block-content-${block.id}`}
                    rows={block.type === "challenge" ? 4 : 6}
                    aria-invalid={
                      showChallengeErrors &&
                      block.type === "challenge" &&
                      block.content.trim().length === 0
                    }
                    placeholder={
                      block.type === "challenge"
                        ? "Escribe la pregunta o desafío."
                        : textPlaceholder
                    }
                    value={block.content}
                    onChange={(event) =>
                      onUpdateBlockContent(block.id, event.target.value)
                    }
                  />
                </FieldContent>
              </Field>
            )}
          </div>
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onRemoveBlock(block.id)}
          >
            <XIcon />
          </Button>
          {dropIndicator?.blockId === block.id &&
            dropIndicator.position === "after" && (
              <div className="absolute inset-x-2 -bottom-2 h-1 rounded-full bg-primary/35" />
            )}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        {allowedBlockTypes.includes("text") && (
          <Button type="button" variant="outline" onClick={() => onAddBlock("text")}>
            <PlusIcon data-icon="inline-start" />
            Agregar texto
          </Button>
        )}
        {allowedBlockTypes.includes("image") && (
          <Button type="button" variant="outline" onClick={handleAddImage}>
            <PlusIcon data-icon="inline-start" />
            Agregar imagen
          </Button>
        )}
        {allowedBlockTypes.includes("challenge") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onAddBlock("challenge")}
          >
            <PlusIcon data-icon="inline-start" />
            Agregar pregunta o desafio
          </Button>
        )}
      </div>
    </FieldGroup>
  );
}

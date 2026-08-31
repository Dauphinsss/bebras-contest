"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { type ContentBlock, type ContentBlockType } from "@/lib/task-schema";
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
  allowAddingBlocks?: boolean;
  allowRemovingBlocks?: boolean;
  allowReorderingBlocks?: boolean;
};

export function TaskContentBuilder({
  blocks,
  allowedBlockTypes,
  textPlaceholder,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlockContent,
  onUpdateBlockImage,
  onUpdateBlockWidth,
  showChallengeErrors,
  allowAddingBlocks = true,
  allowRemovingBlocks = true,
  allowReorderingBlocks = true,
}: TaskContentBuilderProps) {
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageAreaRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingImageBlockIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    blockId: string;
  } | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
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

  const handleAddImage = () => {
    const blockId = onAddBlock("image");
    if (blockId) {
      pendingImageBlockIdRef.current = blockId;
    }
  };

  const findDropTarget = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const row = element?.closest<HTMLElement>("[data-content-block-id]");
    const blockId = row?.dataset.contentBlockId;

    if (!row || !blockId || !blocks.some((block) => block.id === blockId)) {
      return null;
    }

    const rect = row.getBoundingClientRect();
    return {
      blockId,
      position: clientY < rect.top + rect.height / 2 ? "before" : "after",
    } as const;
  };

  const handleBlockPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    blockId: string,
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId, blockId };
  };

  const handleBlockPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setDropIndicator(findDropTarget(event.clientX, event.clientY));
  };

  const finishBlockDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const target = commit ? findDropTarget(event.clientX, event.clientY) : null;
    dragStateRef.current = null;
    setDropIndicator(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (target && target.blockId !== dragState.blockId) {
      onMoveBlock(dragState.blockId, target.blockId, target.position);
    }
  };

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    block: ContentBlock,
    side: "left" | "right",
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    const imageArea = imageAreaRefs.current[block.id];
    if (!imageArea) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const containerWidth = imageArea.getBoundingClientRect().width;
    resizeStateRef.current = {
      pointerId: event.pointerId,
      blockId: block.id,
      side,
      startX: event.clientX,
      startWidthPx: (containerWidth * block.widthPercent) / 100,
      containerWidth,
    };
    setActiveResizeBlockId(block.id);
  };

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
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

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    resizeStateRef.current = null;
    setActiveResizeBlockId(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <FieldGroup className="gap-4">
      {blocks.map((block) => (
        <div
          key={block.id}
          className="relative flex items-center gap-3"
          data-content-block-id={block.id}
        >
          {dropIndicator?.blockId === block.id &&
            dropIndicator.position === "before" && (
              <div className="absolute inset-x-2 -top-2 h-1 rounded-full bg-primary/35" />
            )}
          {allowReorderingBlocks ? (
            <Button
              aria-label="Arrastrar para reordenar bloque"
              className="cursor-grab touch-none select-none active:cursor-grabbing"
              size="icon-sm"
              type="button"
              variant="ghost"
              onPointerCancel={(event) => finishBlockDrag(event, false)}
              onPointerDown={(event) => handleBlockPointerDown(event, block.id)}
              onPointerMove={handleBlockPointerMove}
              onPointerUp={(event) => finishBlockDrag(event, true)}
            >
              <GripVerticalIcon />
            </Button>
          ) : (
            <div className="size-8 shrink-0" />
          )}
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
                            "absolute top-1/2 left-0 h-12 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm sm:w-4",
                            activeResizeBlockId === block.id
                              ? "flex"
                              : "hidden group-hover/image:flex [@media(hover:none)]:flex",
                          )}
                          type="button"
                          onPointerCancel={finishResize}
                          onPointerDown={(event) =>
                            startResize(event, block, "left")
                          }
                          onPointerMove={handleResizePointerMove}
                          onPointerUp={finishResize}
                        >
                          <span className="block h-6 w-0.5 rounded-full bg-current" />
                          <span className="ml-0.5 block h-6 w-0.5 rounded-full bg-current" />
                        </button>
                        <button
                          aria-label="Reducir o ampliar imagen desde la derecha"
                          className={cn(
                            "absolute top-1/2 right-0 h-12 w-6 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm sm:w-4",
                            activeResizeBlockId === block.id
                              ? "flex"
                              : "hidden group-hover/image:flex [@media(hover:none)]:flex",
                          )}
                          type="button"
                          onPointerCancel={finishResize}
                          onPointerDown={(event) =>
                            startResize(event, block, "right")
                          }
                          onPointerMove={handleResizePointerMove}
                          onPointerUp={finishResize}
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
          {allowRemovingBlocks ? (
            <Button
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => onRemoveBlock(block.id)}
            >
              <XIcon />
            </Button>
          ) : (
            <div className="size-8 shrink-0" />
          )}
          {dropIndicator?.blockId === block.id &&
            dropIndicator.position === "after" && (
              <div className="absolute inset-x-2 -bottom-2 h-1 rounded-full bg-primary/35" />
            )}
        </div>
      ))}
      {allowAddingBlocks && (
        <div className="flex flex-wrap gap-3">
          {allowedBlockTypes.includes("text") && (
            <Button type="button" onClick={() => onAddBlock("text")}>
              <PlusIcon data-icon="inline-start" />
              Agregar texto
            </Button>
          )}
          {allowedBlockTypes.includes("image") && (
            <Button type="button" onClick={handleAddImage}>
              <PlusIcon data-icon="inline-start" />
              Agregar imagen
            </Button>
          )}
          {allowedBlockTypes.includes("challenge") && (
            <Button type="button" onClick={() => onAddBlock("challenge")}>
              <PlusIcon data-icon="inline-start" />
              Agregar pregunta o desafio
            </Button>
          )}
        </div>
      )}
    </FieldGroup>
  );
}

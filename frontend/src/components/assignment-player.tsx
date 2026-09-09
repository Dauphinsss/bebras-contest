"use client";

import { useRef, useState, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { TaskContentRenderer } from "@/components/task-content-renderer";
import type {
  AssignmentOption,
  GridConfig,
  ClozeConfig,
} from "@/lib/assignment-answers";
import type { ContentBlock } from "@/lib/task-schema";
import { cn } from "@/lib/utils";

export function readAssignments(
  value: unknown,
  field: "cells" | "blanks",
): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const map = (value as Record<string, unknown>)[field];
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  return Object.fromEntries(
    Object.entries(map).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function OptionContent({ option }: { option: AssignmentOption }) {
  return (
    <>
      {option.image && (
        <img
          src={option.image.url}
          alt=""
          className="size-9 shrink-0 object-contain"
        />
      )}
      <span>{option.label}</span>
    </>
  );
}

function AssignmentSurface({
  options,
  slots,
  slotNoun,
  value,
  onChange,
  disabled = false,
  children,
}: {
  options: AssignmentOption[];
  slots: Array<{ id: string; label: string; allowedOptionIds?: string[] }>;
  /** Cómo se llama aquí una posición: una casilla de la rejilla, o un hueco. */
  slotNoun: "casilla" | "hueco";
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
  children: (
    renderSlot: (id: string, compact?: boolean) => ReactNode,
  ) => ReactNode;
}) {
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const [announcement, setAnnouncement] = useState("");
  const pointer = useRef<{
    id: number;
    optionId: string;
    x: number;
    y: number;
  } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  function assign(slotId: string, optionId: string) {
    if (disabled) return;
    const slot = slots.find((entry) => entry.id === slotId);
    const option = options.find((entry) => entry.id === optionId);
    if (
      !slot ||
      (optionId &&
        (!option ||
          option.limit === 0 ||
          (slot.allowedOptionIds && !slot.allowedOptionIds.includes(optionId))))
    )
      return;
    const next = { ...value };
    delete next[slotId];
    if (option) {
      const occupied = Object.keys(next).filter((id) => next[id] === optionId);
      // Moving an exhausted option frees its previous position.
      if (option.limit !== null && occupied.length >= option.limit)
        delete next[occupied[0]];
      next[slotId] = optionId;
    }
    onChange(next);
    setAnnouncement(`${slot.label}: ${option?.label ?? "vacío"}`);
  }
  function renderSlot(id: string, compact = false) {
    const slot = slots.find((entry) => entry.id === id);
    if (!slot) return <span>[hueco]</span>;
    const option = options.find((entry) => entry.id === value[id]);
    return (
      <button
        key={id}
        type="button"
        data-assignment-slot={id}
        disabled={disabled}
        aria-label={`${slot.label}: ${option?.label ?? "vacío"}`}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-background px-2 align-middle text-sm focus-visible:outline-2 focus-visible:outline-primary",
          compact ? "mx-1 max-w-full flex-wrap" : "w-full flex-col",
          option && "border-solid border-primary bg-primary/5",
        )}
        onClick={() => assign(id, selected)}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            assign(id, "");
          }
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const allowed = options.filter(
              (entry) =>
                entry.limit !== 0 &&
                (!slot.allowedOptionIds ||
                  slot.allowedOptionIds.includes(entry.id)),
            );
            if (!allowed.length) return;
            const index = allowed.findIndex((entry) => entry.id === value[id]);
            assign(
              id,
              allowed[
                (index +
                  (event.key === "ArrowRight" ? 1 : allowed.length - 1) +
                  allowed.length) %
                  allowed.length
              ].id,
            );
          }
        }}
      >
        {option ? (
          !compact && option.image ? (
            <img
              src={option.image.url}
              alt=""
              className="size-9 max-w-full object-contain"
            />
          ) : (
            <OptionContent option={option} />
          )
        ) : (
          <span className="text-muted-foreground">___</span>
        )}
      </button>
    );
  }
  return (
    <div
      ref={surface}
      className="flex min-w-0 flex-col gap-3"
      data-assignment-surface
      onPointerMove={(event) => {
        if (pointer.current?.id === event.pointerId) event.preventDefault();
      }}
      onPointerUp={(event) => {
        const drag = pointer.current;
        pointer.current = null;
        if (
          !drag ||
          drag.id !== event.pointerId ||
          Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6
        )
          return;
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>("[data-assignment-slot]");
        if (target && surface.current?.contains(target))
          assign(target.dataset.assignmentSlot!, drag.optionId);
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
    >
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Banco de opciones"
      >
        <ToggleGroup
          type="single"
          spacing={2}
          variant="outline"
          value={selected}
          onValueChange={(id) => {
            if (id) setSelected(id);
          }}
          disabled={disabled}
          className="flex max-w-full flex-wrap justify-start gap-2"
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              aria-label={`Elegir ${option.label}`}
              disabled={disabled || option.limit === 0}
              className="h-auto min-h-11 max-w-full touch-none whitespace-normal px-3 py-2 text-left"
              onPointerDown={(event) => {
                if (disabled || option.limit === 0) return;
                setSelected(option.id);
                pointer.current = {
                  id: event.pointerId,
                  optionId: option.id,
                  x: event.clientX,
                  y: event.clientY,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
            >
              <OptionContent option={option} />
              {option.limit !== null && (
                <span className="text-xs">
                  (
                  {Math.max(
                    0,
                    option.limit -
                      Object.values(value).filter((id) => id === option.id)
                        .length,
                  )}
                  )
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={selected === ""}
            onClick={() => setSelected("")}
          >
            Borrar
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Elige y toca {slotNoun === "hueco" ? "un hueco" : "una casilla"}, o
        arrastra. Con el teclado, usa las flechas para cambiar y Supr para
        borrar.
      </p>
      {children(renderSlot)}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

export function StateGridPlayer({
  config,
  value,
  onChange,
  disabled,
}: {
  config: GridConfig;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
}) {
  return (
    <AssignmentSurface
      options={config.states}
      slots={config.cells}
      slotNoun="casilla"
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      {(renderSlot) => (
        <div className="overflow-x-auto">
          <div
            className="grid gap-1 sm:gap-2"
            style={{
              gridTemplateColumns: `repeat(${config.columns}, minmax(40px, 1fr))`,
            }}
          >
            {config.cells.map((cell) => (
              <div
                key={cell.id}
                className="flex min-w-0 flex-col gap-1 text-center"
              >
                <span className="text-xs text-muted-foreground">
                  {cell.label}
                </span>
                {renderSlot(cell.id)}
              </div>
            ))}
          </div>
        </div>
      )}
    </AssignmentSurface>
  );
}

export function TextClozePlayer({
  config,
  blocks,
  value,
  onChange,
  disabled,
}: {
  config: ClozeConfig;
  blocks: ContentBlock[];
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  disabled?: boolean;
}) {
  return (
    <AssignmentSurface
      options={config.options}
      slots={config.blanks.map((blank, index) => ({
        ...blank,
        label: `Hueco ${index + 1}`,
      }))}
      slotNoun="hueco"
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      {(renderSlot) => (
        <TaskContentRenderer
          blocks={blocks}
          renderBlank={(id) => renderSlot(id, true)}
        />
      )}
    </AssignmentSurface>
  );
}

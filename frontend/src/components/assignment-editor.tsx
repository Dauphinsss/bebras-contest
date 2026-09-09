"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploadButton } from "@/components/image-upload-button";
import {
  StateGridPlayer,
  TextClozePlayer,
} from "@/components/assignment-player";
import {
  collectTaskBlankIds,
  type AssignmentKey,
  type AssignmentOption,
  type GridConfig,
  type ClozeConfig,
} from "@/lib/assignment-answers";
import { createContentImages, type ContentBlock } from "@/lib/task-schema";

export function initialGrid(): GridConfig {
  return {
    version: 1,
    rows: 1,
    columns: 3,
    cells: Array.from({ length: 3 }, (_, i) => ({
      id: crypto.randomUUID(),
      label: String(i + 1),
    })),
    states: ["Estado 1", "Estado 2"].map((label) => ({
      id: crypto.randomUUID(),
      label,
      image: null,
      limit: null,
    })),
  };
}
export function initialCloze(): ClozeConfig {
  return {
    version: 1,
    blanks: [],
    options: ["Opción 1", "Opción 2"].map((label) => ({
      id: crypto.randomUUID(),
      label,
      image: null,
      limit: 1,
    })),
  };
}
/** Keep inactive metadata in the draft so deleting a blank and undoing restores it. */
export function activeCloze(
  config: ClozeConfig,
  blocks: ContentBlock[],
): ClozeConfig {
  const ids = collectTaskBlankIds(blocks);
  return {
    ...config,
    blanks: ids.map(
      (id) =>
        config.blanks.find((blank) => blank.id === id) ?? {
          id,
          allowedOptionIds: config.options.map((option) => option.id),
        },
    ),
  };
}
export function activeKey(key: AssignmentKey, ids: string[]): AssignmentKey {
  return {
    version: 1,
    acceptedAssignments: key.acceptedAssignments.map((map) =>
      Object.fromEntries(
        Object.entries(map).filter(([id]) => ids.includes(id)),
      ),
    ),
  };
}

export function AssignmentEditor({
  kind,
  config,
  answerKey,
  blocks,
  onChange,
}: {
  kind: "state_grid" | "text_cloze";
  config: GridConfig | ClozeConfig;
  answerKey: AssignmentKey;
  blocks: ContentBlock[];
  onChange: (config: GridConfig | ClozeConfig, key: AssignmentKey) => void;
}) {
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [selectedBlank, setSelectedBlank] = useState("");
  const grid = kind === "state_grid" ? (config as GridConfig) : null;
  const cloze =
    kind === "text_cloze" ? activeCloze(config as ClozeConfig, blocks) : null;
  const options = grid?.states ?? cloze!.options;
  const index = Math.min(
    solutionIndex,
    Math.max(0, answerKey.acceptedAssignments.length - 1),
  );
  const blank =
    cloze?.blanks.find((entry) => entry.id === selectedBlank) ??
    cloze?.blanks[0];
  function setOptions(next: AssignmentOption[]) {
    const previousIds = options.map((option) => option.id);
    const nextIds = next.map((option) => option.id);
    onChange(
      grid
        ? { ...grid, states: next }
        : {
            ...(config as ClozeConfig),
            options: next,
            blanks: (config as ClozeConfig).blanks.map((entry) => ({
              ...entry,
              allowedOptionIds: previousIds.every((id) =>
                entry.allowedOptionIds.includes(id),
              )
                ? nextIds
                : entry.allowedOptionIds.filter((id) => nextIds.includes(id)),
            })),
          },
      answerKey,
    );
  }
  function updateOption(id: string, update: Partial<AssignmentOption>) {
    setOptions(
      options.map((option) =>
        option.id === id ? { ...option, ...update } : option,
      ),
    );
  }
  function resize(rows: number, columns: number) {
    if (
      !grid ||
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1 ||
      rows > 12 ||
      columns > 12
    )
      return;
    onChange(
      {
        ...grid,
        rows,
        columns,
        cells: Array.from(
          { length: rows * columns },
          (_, i) =>
            grid.cells[i] ?? { id: crypto.randomUUID(), label: String(i + 1) },
        ),
      },
      answerKey,
    );
  }
  function setAnswer(value: Record<string, string>) {
    const solutions = [...answerKey.acceptedAssignments];
    // Merge inactive answers back for undo; only current positions are serialized.
    const ids =
      grid?.cells.map((cell) => cell.id) ??
      cloze!.blanks.map((entry) => entry.id);
    const inactive = Object.fromEntries(
      Object.entries(solutions[index] ?? {}).filter(
        ([id]) => !ids.includes(id),
      ),
    );
    solutions[index] = { ...inactive, ...value };
    const nextConfig = cloze
      ? {
          ...cloze,
          blanks: [
            ...(config as ClozeConfig).blanks.filter(
              (entry) => !ids.includes(entry.id),
            ),
            ...cloze.blanks,
          ],
        }
      : config;
    onChange(nextConfig, { version: 1, acceptedAssignments: solutions });
  }
  const value =
    activeKey(
      answerKey,
      grid?.cells.map((cell) => cell.id) ??
        cloze!.blanks.map((entry) => entry.id),
    ).acceptedAssignments[index] ?? {};
  return (
    <div className="flex flex-col gap-5">
      {grid && (
        <FieldGroup className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="grid-rows">Filas</FieldLabel>
            <Input
              id="grid-rows"
              type="number"
              min={1}
              max={12}
              value={grid.rows}
              onChange={(event) =>
                resize(Number(event.target.value), grid.columns)
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="grid-columns">Columnas</FieldLabel>
            <Input
              id="grid-columns"
              type="number"
              min={1}
              max={12}
              value={grid.columns}
              onChange={(event) =>
                resize(grid.rows, Number(event.target.value))
              }
            />
          </Field>
        </FieldGroup>
      )}
      {cloze && (
        <p className="text-sm text-muted-foreground">
          Inserta los huecos desde la barra del texto. Aquí escribe las opciones
          y completa una respuesta correcta.
        </p>
      )}
      <FieldGroup className="gap-3">
        {options.map((option, optionIndex) => (
          <Field key={option.id} className="gap-2">
            <FieldLabel htmlFor={`option-${option.id}`}>
              {grid ? "Estado" : "Opción"} {optionIndex + 1}
            </FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {option.image && (
                <img
                  src={option.image.url}
                  alt={option.label}
                  className="size-10 object-contain"
                />
              )}
              <Input
                id={`option-${option.id}`}
                className="min-w-40 flex-1"
                value={option.label}
                onChange={(event) =>
                  updateOption(option.id, { label: event.target.value })
                }
              />
              <Input
                type="number"
                min={0}
                max={144}
                className="w-28"
                aria-label={`Cantidad de ${option.label}`}
                placeholder="Ilimitada"
                value={option.limit ?? ""}
                onChange={(event) =>
                  updateOption(option.id, {
                    limit:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
              <ImageUploadButton
                onChange={async (event) => {
                  const images = await createContentImages(event.target.files);
                  if (images[0]) updateOption(option.id, { image: images[0] });
                }}
              />
              {option.image && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateOption(option.id, { image: null })}
                >
                  Quitar imagen
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Eliminar ${option.label}`}
                disabled={options.length === 1}
                onClick={() =>
                  setOptions(options.filter((entry) => entry.id !== option.id))
                }
              >
                Eliminar
              </Button>
            </div>
          </Field>
        ))}
      </FieldGroup>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={options.length >= 64}
        onClick={() =>
          setOptions([
            ...options,
            {
              id: crypto.randomUUID(),
              label: `${grid ? "Estado" : "Opción"} ${options.length + 1}`,
              image: null,
              limit: grid ? null : 1,
            },
          ])
        }
      >
        Añadir {grid ? "estado" : "opción"}
      </Button>
      <details className="text-sm">
        <summary className="cursor-pointer">
          {grid ? "Etiquetas de las casillas" : "Opciones permitidas por hueco"}
        </summary>
        {grid ? (
          <FieldGroup className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {grid.cells.map((cell, i) => (
              <Field key={cell.id}>
                <FieldLabel htmlFor={`cell-${cell.id}`}>
                  Casilla {i + 1}
                </FieldLabel>
                <Input
                  id={`cell-${cell.id}`}
                  value={cell.label}
                  onChange={(event) =>
                    onChange(
                      {
                        ...grid,
                        cells: grid.cells.map((entry) =>
                          entry.id === cell.id
                            ? { ...entry, label: event.target.value }
                            : entry,
                        ),
                      },
                      answerKey,
                    )
                  }
                />
              </Field>
            ))}
          </FieldGroup>
        ) : (
          blank && (
            <div className="mt-3 flex flex-col gap-2">
              <NativeSelect
                aria-label="Configurar hueco"
                value={blank.id}
                onChange={(event) => setSelectedBlank(event.target.value)}
              >
                {cloze!.blanks.map((entry, i) => (
                  <option key={entry.id} value={entry.id}>
                    Hueco {i + 1}
                  </option>
                ))}
              </NativeSelect>
              {options.map((option) => (
                <Field key={option.id} orientation="horizontal">
                  <Checkbox
                    id={`allow-${option.id}`}
                    checked={blank.allowedOptionIds.includes(option.id)}
                    onCheckedChange={(checked) => {
                      const updated = {
                        ...blank,
                        allowedOptionIds: checked
                          ? [...blank.allowedOptionIds, option.id]
                          : blank.allowedOptionIds.filter(
                              (id) => id !== option.id,
                            ),
                      };
                      onChange(
                        {
                          ...(config as ClozeConfig),
                          blanks: [
                            ...(config as ClozeConfig).blanks.filter(
                              (entry) => entry.id !== blank.id,
                            ),
                            updated,
                          ],
                        },
                        answerKey,
                      );
                    }}
                  />
                  <FieldLabel htmlFor={`allow-${option.id}`}>
                    {option.label}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          )
        )}
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Solución correcta"
          value={index}
          onChange={(event) => setSolutionIndex(Number(event.target.value))}
        >
          {answerKey.acceptedAssignments.map((_, i) => (
            <option key={i} value={i}>
              {i === 0 ? "Respuesta correcta" : `Alternativa ${i}`}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSolutionIndex(answerKey.acceptedAssignments.length);
            onChange(config, {
              version: 1,
              acceptedAssignments: [...answerKey.acceptedAssignments, {}],
            });
          }}
        >
          Añadir solución
        </Button>
        {answerKey.acceptedAssignments.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(config, {
                version: 1,
                acceptedAssignments: answerKey.acceptedAssignments.filter(
                  (_, i) => i !== index,
                ),
              });
              setSolutionIndex(0);
            }}
          >
            Eliminar solución
          </Button>
        )}
      </div>
      {grid ? (
        <StateGridPlayer config={grid} value={value} onChange={setAnswer} />
      ) : (
        <TextClozePlayer
          config={cloze!}
          blocks={blocks}
          value={value}
          onChange={setAnswer}
        />
      )}
    </div>
  );
}

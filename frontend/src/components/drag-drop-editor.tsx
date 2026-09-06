"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ImagePlusIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ImageUploadButton } from "@/components/image-upload-button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT,
  type StoredTaskDragDropItem,
  type StoredTaskDragDropSolution,
  type StoredTaskDragDropTarget,
} from "@/lib/task-schema";
import { cn } from "@/lib/utils";

type DragDropEditorProps = {
  backgroundUrl: string | null;
  items: StoredTaskDragDropItem[];
  targets: StoredTaskDragDropTarget[];
  onUploadBackground: (files: FileList | null) => void;
  onReplaceItemImage: (itemId: string, files: FileList | null) => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (
    itemId: string,
    patch: Partial<Pick<StoredTaskDragDropItem, "label" | "widthPercent">>,
  ) => void;
  onUpdateTarget: (
    targetId: string,
    patch: Partial<Pick<StoredTaskDragDropTarget, "x" | "y" | "snapRadius">>,
  ) => void;
  /** Acomodos correctos además del principal. */
  solutions: StoredTaskDragDropSolution[];
  /** Crea una copia del acomodo principal y devuelve su ID. */
  onAddSolution: () => string;
  onRemoveSolution: (solutionId: string) => void;
  onUpdateSolution: (
    solutionId: string,
    placements: Record<string, string>,
  ) => void;
};

type StageSize = {
  width: number;
  height: number;
};

function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function DragDropEditor({
  backgroundUrl,
  items,
  targets,
  onUploadBackground,
  onReplaceItemImage,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onUpdateTarget,
  solutions,
  onAddSolution,
  onRemoveSolution,
  onUpdateSolution,
}: DragDropEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Solo afecta a cómo se ve mientras editas: las posiciones son porcentajes,
  // así que el escenario se reescala entero y nada se descoloca.
  const [stageZoom, setStageZoom] = useState(100);

  // El encaje es uno solo para toda la tarea. Tenerlo por objeto no aportaba
  // nada y se descuadraba solo: cada objeto nuevo nacía con otro valor.
  const sharedSnapRadius = Number.isFinite(targets[0]?.snapRadius)
    ? targets[0].snapRadius
    : 10;

  const setSharedSnapRadius = (value: number) => {
    for (const target of targets) {
      onUpdateTarget(target.id, { snapRadius: value });
    }
  };
  const dragStateRef = useRef<{
    pointerId: number;
    targetId: string;
  } | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    itemId: string;
    side: "left" | "right";
    startX: number;
    startWidthPx: number;
  } | null>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [livePosition, setLivePosition] = useState<{
    targetId: string;
    x: number;
    y: number;
  } | null>(null);
  const [liveWidth, setLiveWidth] = useState<{
    itemId: string;
    widthPercent: number;
  } | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 0,
    height: 0,
  });
  // `null` = el acomodo principal, el que se edite moviendo los destinos.
  // Con una alternativa activa los destinos no se mueven: solo se cambia qué
  // objeto va en cuál.
  const [activeSolutionId, setActiveSolutionId] = useState<string | null>(null);
  const solutionDragRef = useRef<{
    pointerId: number;
    itemId: string;
  } | null>(null);
  const [solutionDrag, setSolutionDrag] = useState<{
    itemId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const updateStageSize = () => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [backgroundUrl]);

  const activeItem =
    items.find((item) => item.id === activeItemId) ?? items[0] ?? null;

  const pointerToPercent = (clientX: number, clientY: number) => {
    const stage = stageRef.current;

    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    const width = stage.clientWidth;
    const height = stage.clientHeight;

    if (width === 0 || height === 0) {
      return null;
    }

    return {
      x: roundCoordinate(
        Math.max(
          0,
          Math.min(
            100,
            ((clientX - rect.left - stage.clientLeft) / width) * 100,
          ),
        ),
      ),
      y: roundCoordinate(
        Math.max(
          0,
          Math.min(
            100,
            ((clientY - rect.top - stage.clientTop) / height) * 100,
          ),
        ),
      ),
    };
  };

  const handleMarkerPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
    targetId: string,
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { pointerId: event.pointerId, targetId };
    setActiveItemId(itemId);
  };

  const handleMarkerPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const position = pointerToPercent(event.clientX, event.clientY);

    if (position) {
      setLivePosition({ targetId: dragState.targetId, ...position });
    }
  };

  const finishMarkerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    const dragState = dragStateRef.current;
    dragStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // Un solo guardado, al soltar.
    if (livePosition && livePosition.targetId === dragState.targetId) {
      onUpdateTarget(dragState.targetId, {
        x: livePosition.x,
        y: livePosition.y,
      });
    }

    setLivePosition(null);
  };

  const itemWidthPercent = (item: StoredTaskDragDropItem) => {
    if (liveWidth?.itemId === item.id) {
      return liveWidth.widthPercent;
    }

    return Number.isFinite(item.widthPercent)
      ? item.widthPercent
      : DEFAULT_DRAG_DROP_ITEM_WIDTH_PERCENT;
  };

  // Redimensionar sobre la propia foto: se agranda desde el centro, así el
  // objeto no se desplaza de su destino mientras cambias el tamaño.
  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: StoredTaskDragDropItem,
    side: "left" | "right",
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      pointerId: event.pointerId,
      itemId: item.id,
      side,
      startX: event.clientX,
      startWidthPx: (itemWidthPercent(item) / 100) * stageSize.width,
    };
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = resizeStateRef.current;

    if (!state || state.pointerId !== event.pointerId || !stageSize.width) {
      return;
    }

    event.preventDefault();
    const delta = event.clientX - state.startX;
    const nextPx =
      state.startWidthPx + (state.side === "right" ? delta * 2 : -delta * 2);

    setLiveWidth({
      itemId: state.itemId,
      widthPercent: Math.max(
        1,
        Math.min(60, Math.round((nextPx / stageSize.width) * 1000) / 10),
      ),
    });
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    resizeStateRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (liveWidth) {
      onUpdateItem(liveWidth.itemId, { widthPercent: liveWidth.widthPercent });
    }

    setLiveWidth(null);
  };

  const activeSolution =
    solutions.find((solution) => solution.id === activeSolutionId) ?? null;

  // Un acomodo completo: si a la alternativa le falta algún objeto (porque se
  // agregó después) se cae al destino principal de ese objeto.
  const solutionPlacements = activeSolution
    ? Object.fromEntries(
        items.map((item) => [
          item.id,
          activeSolution.placements[item.id] ?? item.correctTargetId,
        ]),
      )
    : null;

  const startSolutionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    solutionDragRef.current = { pointerId: event.pointerId, itemId };
    setActiveItemId(itemId);
  };

  const moveSolutionDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = solutionDragRef.current;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const position = pointerToPercent(event.clientX, event.clientY);

    if (position) {
      setSolutionDrag({ itemId: state.itemId, ...position });
    }
  };

  const finishSolutionDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = solutionDragRef.current;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    solutionDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const drop = solutionDrag;
    setSolutionDrag(null);

    if (!drop || !activeSolution || !solutionPlacements) {
      return;
    }

    // Siempre cae en algún destino: el más cercano a donde soltaste. Un
    // acomodo a medias no sirve de nada como respuesta correcta.
    let closestId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const target of targets) {
      const distance = Math.hypot(drop.x - target.x, drop.y - target.y);

      if (distance < closestDistance) {
        closestId = target.id;
        closestDistance = distance;
      }
    }

    const previousTargetId = solutionPlacements[state.itemId];

    if (!closestId || closestId === previousTargetId) {
      return;
    }

    const displacedItemId = Object.keys(solutionPlacements).find(
      (itemId) =>
        itemId !== state.itemId && solutionPlacements[itemId] === closestId,
    );
    const next = { ...solutionPlacements, [state.itemId]: closestId };

    // Si el destino estaba ocupado, los dos objetos intercambian lugar.
    if (displacedItemId) {
      next[displacedItemId] = previousTargetId;
    }

    onUpdateSolution(activeSolution.id, next);
  };

  const targetById = new Map(targets.map((target) => [target.id, target]));
  const handleSize = "h-10 w-4 sm:w-3";

  return (
    <FieldGroup className="gap-3">
      <FieldSet className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <FieldLegend className="mb-0" variant="label">
            Escenario
          </FieldLegend>
          {backgroundUrl && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="w-48">
                <SliderField
                  id="drag-stage-snap"
                  label="Encaje"
                  value={sharedSnapRadius}
                  min={1}
                  max={40}
                  onChange={setSharedSnapRadius}
                />
              </div>
              <div className="w-48">
                <SliderField
                  id="drag-stage-zoom"
                  label="Zoom"
                  value={stageZoom}
                  min={40}
                  max={150}
                  onChange={setStageZoom}
                />
              </div>
            </div>
          )}
        </div>

        <Field>
          <FieldContent className="gap-3">
            {!backgroundUrl && (
              <ImageUploadButton
                onChange={(event) => {
                  onUploadBackground(event.target.files);
                  event.target.value = "";
                }}
              />
            )}

            {backgroundUrl && (
              <div className="flex flex-col gap-2">
                <div
                  style={{ maxWidth: `calc(48rem * ${stageZoom} / 100)` }}
                  className="relative mx-auto w-full overflow-hidden rounded-sm"
                  ref={stageRef}
                  role="group"
                  aria-label="Ubicación de los destinos de encaje"
                >
                  <img
                    alt="Escenario de fondo"
                    className="block h-auto w-full select-none"
                    draggable={false}
                    src={backgroundUrl}
                  />

                  {items.map((item, index) => {
                    const target = targets.find(
                      (candidate) => candidate.id === item.correctTargetId,
                    );

                    if (!target || activeSolution) {
                      return null;
                    }

                    const selected = item.id === activeItem?.id;
                    const position =
                      livePosition?.targetId === target.id
                        ? livePosition
                        : {
                            x: Number.isFinite(target.x) ? target.x : 0,
                            y: Number.isFinite(target.y) ? target.y : 0,
                          };
                    const radiusPixels =
                      (sharedSnapRadius / 100) *
                      Math.min(stageSize.width, stageSize.height);
                    const itemWidthPixels =
                      (itemWidthPercent(item) / 100) * stageSize.width;
                    const name = `Objeto ${index + 1}`;

                    return (
                      <div
                        key={target.id}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${position.x}%`,
                          top: `${position.y}%`,
                        }}
                      >
                        {selected && (
                          <div
                            className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary bg-primary/5"
                            style={{
                              height: `${radiusPixels * 2}px`,
                              width: `${radiusPixels * 2}px`,
                            }}
                          />
                        )}

                        <button
                          className={cn(
                            "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab border-2 border-transparent outline-none transition-[opacity,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
                            // Al pasar por encima el objeto se aclara y se
                            // perfila: sin eso no había forma de saber que los
                            // demás también se pueden seleccionar.
                            selected
                              ? "z-20"
                              : "z-10 opacity-70 hover:z-20 hover:opacity-100 hover:ring-2 hover:ring-primary/40",
                            item.image
                              ? "block overflow-hidden rounded-sm bg-transparent p-0"
                              : "size-10 rounded-full border-dashed border-muted-foreground bg-background/90",
                            // Sin recuadro: el círculo punteado ya marca cuál
                            // está seleccionado, y un marco cuadrado sobre una
                            // pieza redonda estorba al colocarla.
                          )}
                          style={{
                            touchAction: "none",
                            ...(item.image
                              ? { width: `${itemWidthPixels}px` }
                              : {}),
                          }}
                          type="button"
                          aria-label={`Mover ${name}`}
                          aria-pressed={selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveItemId(item.id);
                            if (!item.image) {
                              imageInputRefs.current[item.id]?.click();
                            }
                          }}
                          onKeyDown={(event) => {
                            const step = event.shiftKey ? 0.2 : 1;
                            const moves: Record<string, [number, number]> = {
                              ArrowLeft: [-step, 0],
                              ArrowRight: [step, 0],
                              ArrowUp: [0, -step],
                              ArrowDown: [0, step],
                            };
                            const move = moves[event.key];

                            if (!move) {
                              return;
                            }

                            event.preventDefault();
                            setActiveItemId(item.id);
                            const clamp = (value: number) =>
                              Math.min(100, Math.max(0, value));
                            onUpdateTarget(target.id, {
                              x: clamp(position.x + move[0]),
                              y: clamp(position.y + move[1]),
                            });
                          }}
                          onPointerCancel={finishMarkerDrag}
                          onPointerDown={(event) =>
                            handleMarkerPointerDown(event, item.id, target.id)
                          }
                          onPointerMove={handleMarkerPointerMove}
                          onPointerUp={finishMarkerDrag}
                        >
                          {item.image ? (
                            <img
                              alt=""
                              className="block h-auto w-full select-none"
                              draggable={false}
                              src={item.image.url}
                            />
                          ) : (
                            <ImagePlusIcon className="mx-auto size-4 text-muted-foreground" />
                          )}
                        </button>

                        {/* Todo lo del objeto se hace aquí: cambiar su imagen,
                            estirarlo y quitarlo. Sin panel debajo. */}
                        {selected && (
                          <>
                            <button
                              aria-label={`Estirar ${name} desde la izquierda`}
                              className={cn(
                                "pointer-events-auto absolute z-30 flex -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background text-muted-foreground",
                                handleSize,
                              )}
                              style={{
                                left: `${-itemWidthPixels / 2}px`,
                                transform: "translate(-50%, -50%)",
                              }}
                              type="button"
                              onPointerCancel={finishResize}
                              onPointerDown={(event) =>
                                startResize(event, item, "left")
                              }
                              onPointerMove={handleResizeMove}
                              onPointerUp={finishResize}
                            >
                              <span className="block h-4 w-0.5 rounded-full bg-current" />
                            </button>

                            <button
                              aria-label={`Estirar ${name} desde la derecha`}
                              className={cn(
                                "pointer-events-auto absolute z-30 flex -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background text-muted-foreground",
                                handleSize,
                              )}
                              style={{
                                left: `${itemWidthPixels / 2}px`,
                                transform: "translate(-50%, -50%)",
                              }}
                              type="button"
                              onPointerCancel={finishResize}
                              onPointerDown={(event) =>
                                startResize(event, item, "right")
                              }
                              onPointerMove={handleResizeMove}
                              onPointerUp={finishResize}
                            >
                              <span className="block h-4 w-0.5 rounded-full bg-current" />
                            </button>

                            {items.length > 1 && (
                              <Button
                                size="icon-sm"
                                type="button"
                                variant="outline"
                                aria-label={`Quitar ${name}`}
                                className="pointer-events-auto absolute z-30 rounded-full"
                                style={{
                                  left: `${itemWidthPixels / 2 + 14}px`,
                                  top: `${-itemWidthPixels / 2 - 14}px`,
                                }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveItem(item.id);
                                }}
                              >
                                <XIcon />
                              </Button>
                            )}
                          </>
                        )}

                        <input
                          accept="image/*"
                          className="sr-only"
                          ref={(node) => {
                            imageInputRefs.current[item.id] = node;
                          }}
                          tabIndex={-1}
                          type="file"
                          onChange={(event) => {
                            onReplaceItemImage(item.id, event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </div>
                    );
                  })}

                  {activeSolution &&
                    solutionPlacements &&
                    targets.map((target) => {
                      const radiusPixels =
                        (sharedSnapRadius / 100) *
                        Math.min(stageSize.width, stageSize.height);

                      return (
                        <div
                          key={`hueco-${target.id}`}
                          className="pointer-events-none absolute z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-muted-foreground/50"
                          style={{
                            left: `${Number.isFinite(target.x) ? target.x : 0}%`,
                            top: `${Number.isFinite(target.y) ? target.y : 0}%`,
                            height: `${radiusPixels * 2}px`,
                            width: `${radiusPixels * 2}px`,
                          }}
                        />
                      );
                    })}

                  {activeSolution &&
                    solutionPlacements &&
                    items.map((item, index) => {
                      const target = targetById.get(
                        solutionPlacements[item.id],
                      );

                      if (!target) {
                        return null;
                      }

                      const dragging = solutionDrag?.itemId === item.id;
                      const position = dragging
                        ? solutionDrag
                        : {
                            x: Number.isFinite(target.x) ? target.x : 0,
                            y: Number.isFinite(target.y) ? target.y : 0,
                          };
                      const itemWidthPixels =
                        (itemWidthPercent(item) / 100) * stageSize.width;
                      const name = `Objeto ${index + 1}`;

                      return (
                        <button
                          key={`alterno-${item.id}`}
                          aria-label={`Llevar ${name} a otro destino`}
                          className={cn(
                            "absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab overflow-hidden rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing",
                            dragging && "opacity-70",
                          )}
                          style={{
                            left: `${position.x}%`,
                            top: `${position.y}%`,
                            touchAction: "none",
                            width: item.image
                              ? `${itemWidthPixels}px`
                              : undefined,
                          }}
                          type="button"
                          onPointerCancel={finishSolutionDrag}
                          onPointerDown={(event) =>
                            startSolutionDrag(event, item.id)
                          }
                          onPointerMove={moveSolutionDrag}
                          onPointerUp={finishSolutionDrag}
                        >
                          {item.image ? (
                            <img
                              alt=""
                              className="block h-auto w-full select-none"
                              draggable={false}
                              src={item.image.url}
                            />
                          ) : (
                            <span className="block rounded-sm border border-dashed border-muted-foreground bg-background/90 px-2 py-4 text-xs">
                              {name}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>

                {items.length > 1 && (
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Soluciones válidas
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={activeSolutionId ? "outline" : "default"}
                        onClick={() => setActiveSolutionId(null)}
                      >
                        Principal
                      </Button>
                      {solutions.map((solution, index) => (
                        <span
                          key={solution.id}
                          className="inline-flex items-center gap-0.5"
                        >
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              activeSolutionId === solution.id
                                ? "default"
                                : "outline"
                            }
                            onClick={() => setActiveSolutionId(solution.id)}
                          >
                            {`Alterna ${index + 1}`}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Quitar la solución alterna ${index + 1}`}
                            onClick={() => {
                              if (activeSolutionId === solution.id) {
                                setActiveSolutionId(null);
                              }

                              onRemoveSolution(solution.id);
                            }}
                          >
                            <XIcon />
                          </Button>
                        </span>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setActiveSolutionId(onAddSolution())}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Otra solución
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activeSolution
                        ? "Arrastra un objeto a otro destino para armar este acomodo; si el destino está ocupado, los dos objetos se intercambian."
                        : "Agrega una alterna si la tarea admite más de un acomodo correcto. Dos objetos con la misma imagen ya cuentan como intercambiables."}
                    </p>
                  </div>
                )}

                <div
                  className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2"
                  hidden={Boolean(activeSolution)}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onAddItem}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Agregar objeto
                  </Button>
                  <ImageUploadButton
                    onChange={(event) => {
                      onUploadBackground(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
            )}
          </FieldContent>
        </Field>
      </FieldSet>
    </FieldGroup>
  );
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="w-14 shrink-0 text-xs text-muted-foreground"
      >
        {label}
      </label>
      <Slider
        id={id}
        className="min-w-0 flex-1"
        min={min}
        max={max}
        step={0.5}
        value={[Math.min(max, Math.max(min, value))]}
        onValueChange={([next]) => onChange(next)}
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { HotspotShapeView } from "@/components/image-hotspot-player";
import { ImageUploadButton } from "@/components/image-upload-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createContentImages } from "@/lib/task-schema";
import {
  parseHotspotConfig,
  parseHotspotKey,
  type HotspotConfig,
  type HotspotKey,
  type HotspotPoint,
  type HotspotShape,
} from "@/lib/image-hotspot";

export function ImageHotspotEditor({
  config,
  answerKey,
  onChange,
}: {
  config: HotspotConfig | null;
  answerKey: HotspotKey;
  onChange: (config: HotspotConfig, key: HotspotKey) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [selection, setSelection] = useState({ id: "", shape: 0 });
  const [drawing, setDrawing] = useState<"circle" | "polygon" | null>(null);
  const [append, setAppend] = useState(false);
  const [points, setPoints] = useState<HotspotPoint[]>([]);
  const drag = useRef<{
    id: string;
    index: number;
    point: HotspotPoint;
    shape: HotspotShape;
    vertex?: number;
    radius?: boolean;
  } | null>(null);
  const region = config?.regions.find((r) => r.id === selection.id);
  const selectedShape = region?.shapes[selection.shape];
  let error = "";
  if (config) {
    try {
      parseHotspotKey(answerKey, parseHotspotConfig(config));
    } catch (failure) {
      error = failure instanceof Error ? failure.message : "Revisa las zonas.";
    }
  }
  const position = (event: {
    clientX: number;
    clientY: number;
  }): HotspotPoint => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix || !config) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return {
      x: Math.max(0, Math.min(100, (p.x / config.imageWidth) * 100)),
      y: Math.max(0, Math.min(100, (p.y / config.imageHeight) * 100)),
    };
  };
  const updateShape = (id: string, index: number, shape: HotspotShape) => {
    if (config)
      onChange(
        {
          ...config,
          regions: config.regions.map((r) =>
            r.id === id
              ? {
                  ...r,
                  shapes: r.shapes.map((s, i) => (i === index ? shape : s)),
                }
              : r,
          ),
        },
        answerKey,
      );
  };
  const addShape = (shape: HotspotShape) => {
    if (!config) return;
    const id = append && region ? region.id : crypto.randomUUID();
    const index = append && region ? region.shapes.length : 0;
    const regions =
      append && region
        ? config.regions.map((r) =>
            r.id === id ? { ...r, shapes: [...r.shapes, shape] } : r,
          )
        : [
            ...config.regions,
            { id, label: `Zona ${config.regions.length + 1}`, shapes: [shape] },
          ];
    onChange({ ...config, regions }, answerKey);
    setSelection({ id, shape: index });
    setDrawing(null);
    setPoints([]);
    setAppend(false);
  };
  const finishPolygon = () => {
    if (points.length >= 3) addShape({ type: "polygon", points });
  };
  const startDrag = (
    event: PointerEvent<SVGElement>,
    id: string,
    index: number,
    shape: HotspotShape,
    vertex?: number,
    radius = false,
  ) => {
    if (drawing) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection({ id, shape: index });
    drag.current = { id, index, shape, point: position(event), vertex, radius };
    svg.current?.setPointerCapture(event.pointerId);
  };
  const moveShape = (
    shape: HotspotShape,
    dx: number,
    dy: number,
    vertex?: number,
  ): HotspotShape => {
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    if (shape.type === "circle")
      return { ...shape, x: clamp(shape.x + dx), y: clamp(shape.y + dy) };
    return {
      ...shape,
      points: shape.points.map((p, i) =>
        vertex === undefined || vertex === i
          ? { x: clamp(p.x + dx), y: clamp(p.y + dy) }
          : p,
      ),
    };
  };
  const keyMove = (
    event: KeyboardEvent<SVGElement>,
    shape: HotspotShape,
    vertex?: number,
  ) => {
    const step = event.shiftKey ? 0.1 : 0.5;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (delta[event.key] && region) {
      event.preventDefault();
      event.stopPropagation();
      updateShape(
        region.id,
        selection.shape,
        moveShape(shape, ...delta[event.key], vertex),
      );
    }
  };
  const upload = async (files: FileList | null) => {
    try {
      const image = (await createContentImages(files))[0];
      if (!image) return;
      const loaded = new Image();
      loaded.src = image.url;
      await loaded.decode();
      onChange(
        {
          version: 1,
          image,
          imageWidth: loaded.naturalWidth,
          imageHeight: loaded.naturalHeight,
          regions: config?.regions ?? [],
        },
        answerKey,
      );
      setDrawing(null);
      setPoints([]);
    } catch {
      toast.error("No se pudo abrir esa imagen.");
    }
  };

  return (
    <div className="flex flex-col gap-3" aria-label="Editor de zonas activas">
      <div className="flex flex-wrap items-center gap-2">
        <ImageUploadButton
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
        />
        {config && (
          <>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                setDrawing("circle");
                setAppend(false);
                setPoints([]);
              }}
            >
              Añadir punto
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                setDrawing("polygon");
                setAppend(false);
                setPoints([]);
              }}
            >
              Dibujar camino
            </Button>
            {drawing && (
              <>
                {drawing === "polygon" && (
                  <Button
                    size="sm"
                    type="button"
                    disabled={points.length < 3}
                    onClick={finishPolygon}
                  >
                    Cerrar camino
                  </Button>
                )}
                {points.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setPoints(points.slice(0, -1))}
                  >
                    Deshacer punto
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setDrawing(null);
                    setPoints([]);
                  }}
                >
                  Cancelar
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {!config && (
        <p className="text-sm text-muted-foreground">
          Sube la figura para marcar sus puntos o caminos.
        </p>
      )}
      {config && (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {drawing === "circle"
              ? "Toca la imagen para colocar el punto."
              : drawing === "polygon"
                ? "Marca el contorno con clics y ciérralo tocando el primer punto o «Cerrar camino»."
                : "Selecciona una zona y arrastra sus puntos para ajustarla. Las flechas del teclado también funcionan."}
          </p>
          <svg
            ref={svg}
            viewBox={`0 0 ${config.imageWidth} ${config.imageHeight}`}
            width={config.imageWidth}
            height={config.imageHeight}
            style={{ height: "auto", maxHeight: "min(52vh, 480px)" }}
            className="w-full touch-none text-primary"
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label="Dibujar zonas sobre la imagen"
            onClick={(event) => {
              if (drawing === "circle")
                addShape({ type: "circle", ...position(event), radius: 3 });
              if (drawing === "polygon") {
                const p = position(event);
                if (
                  !points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.01)
                )
                  setPoints([...points, p]);
              }
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d) return;
              const p = position(event);
              const shape =
                d.radius && d.shape.type === "circle"
                  ? {
                      ...d.shape,
                      radius: Math.max(
                        0.1,
                        Math.min(
                          50,
                          Math.hypot(
                            (p.x - d.shape.x) * config.imageWidth,
                            (p.y - d.shape.y) * config.imageHeight,
                          ) / Math.min(config.imageWidth, config.imageHeight),
                        ),
                      ),
                    }
                  : moveShape(
                      d.shape,
                      p.x - d.point.x,
                      p.y - d.point.y,
                      d.vertex,
                    );
              updateShape(d.id, d.index, shape);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <image
              href={config.image.url}
              width={config.imageWidth}
              height={config.imageHeight}
            />
            {config.regions.map((r) =>
              r.shapes.map((shape, i) => (
                <g
                  key={`${r.id}:${i}`}
                  role="button"
                  tabIndex={drawing ? -1 : 0}
                  aria-label={`${r.label}, trazado ${i + 1}`}
                  aria-pressed={r.id === selection.id && i === selection.shape}
                  className="cursor-move outline-none"
                  onFocus={() => setSelection({ id: r.id, shape: i })}
                  onPointerDown={(e) => startDrag(e, r.id, i, shape)}
                  onKeyDown={(e) => keyMove(e, shape)}
                >
                  <HotspotShapeView
                    shape={shape}
                    config={config}
                    fill="currentColor"
                    fillOpacity={r.id === selection.id ? 0.18 : 0.05}
                    stroke="currentColor"
                    strokeWidth={r.id === selection.id ? 3 : 1}
                    strokeDasharray={r.id === selection.id ? undefined : "5 3"}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              )),
            )}
            {!drawing &&
              region &&
              selectedShape &&
              (selectedShape.type === "polygon"
                ? selectedShape.points
                : [
                    selectedShape,
                    {
                      x:
                        selectedShape.x +
                        (selectedShape.radius *
                          Math.min(config.imageWidth, config.imageHeight)) /
                          config.imageWidth,
                      y: selectedShape.y,
                    },
                  ]
              ).map((p, i) => (
                <circle
                  key={i}
                  cx={(p.x * config.imageWidth) / 100}
                  cy={(p.y * config.imageHeight) / 100}
                  r={Math.min(config.imageWidth, config.imageHeight) * 0.018}
                  className="fill-background stroke-primary"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    selectedShape.type === "polygon"
                      ? `Vértice ${i + 1}`
                      : i
                        ? "Ajustar radio"
                        : "Mover centro"
                  }
                  onPointerDown={(e) =>
                    startDrag(
                      e,
                      region.id,
                      selection.shape,
                      selectedShape,
                      selectedShape.type === "polygon" ? i : undefined,
                      selectedShape.type === "circle" && i === 1,
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      selectedShape.type === "circle" &&
                      i === 1 &&
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    ) {
                      e.preventDefault();
                      updateShape(region.id, selection.shape, {
                        ...selectedShape,
                        radius: Math.max(
                          0.1,
                          selectedShape.radius +
                            (["ArrowLeft", "ArrowDown"].includes(e.key)
                              ? -0.2
                              : 0.2),
                        ),
                      });
                    } else
                      keyMove(
                        e,
                        selectedShape,
                        selectedShape.type === "polygon" ? i : undefined,
                      );
                  }}
                />
              ))}
            {drawing === "polygon" && points.length > 0 && (
              <>
                <polyline
                  points={points
                    .map(
                      (p) =>
                        `${(p.x * config.imageWidth) / 100},${(p.y * config.imageHeight) / 100}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={(p.x * config.imageWidth) / 100}
                    cy={(p.y * config.imageHeight) / 100}
                    r={Math.min(config.imageWidth, config.imageHeight) * 0.018}
                    fill="currentColor"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (i === 0) finishPolygon();
                    }}
                  />
                ))}
              </>
            )}
          </svg>
          {!drawing && config.regions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <NativeSelect
                aria-label="Zona seleccionada"
                value={region?.id ?? ""}
                onChange={(e) => setSelection({ id: e.target.value, shape: 0 })}
              >
                {!region && (
                  <NativeSelectOption value="">
                    Elige una zona
                  </NativeSelectOption>
                )}
                {config.regions.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {r.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {region && (
                <>
                  <Field className="w-40">
                    <FieldLabel className="sr-only" htmlFor="hotspot-name">
                      Nombre de la zona
                    </FieldLabel>
                    <Input
                      id="hotspot-name"
                      value={region.label}
                      onChange={(e) =>
                        onChange(
                          {
                            ...config,
                            regions: config.regions.map((r) =>
                              r.id === region.id
                                ? { ...r, label: e.target.value }
                                : r,
                            ),
                          },
                          answerKey,
                        )
                      }
                    />
                  </Field>
                  <Field orientation="horizontal" className="w-auto">
                    <Checkbox
                      id="hotspot-correct"
                      checked={answerKey.acceptedRegionIds.includes(region.id)}
                      onCheckedChange={(checked) =>
                        onChange(config, {
                          version: 1,
                          acceptedRegionIds: checked
                            ? [
                                ...answerKey.acceptedRegionIds.filter(
                                  (id) => id !== region.id,
                                ),
                                region.id,
                              ]
                            : answerKey.acceptedRegionIds.filter(
                                (id) => id !== region.id,
                              ),
                        })
                      }
                    />
                    <FieldLabel htmlFor="hotspot-correct">
                      Respuesta válida
                    </FieldLabel>
                  </Field>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAppend(true);
                      setDrawing("polygon");
                      setPoints([]);
                    }}
                  >
                    Otro tramo
                  </Button>
                  {region.shapes.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onChange(
                          {
                            ...config,
                            regions: config.regions.map((r) =>
                              r.id === region.id
                                ? {
                                    ...r,
                                    shapes: r.shapes.filter(
                                      (_, i) => i !== selection.shape,
                                    ),
                                  }
                                : r,
                            ),
                          },
                          answerKey,
                        );
                        setSelection({ id: region.id, shape: 0 });
                      }}
                    >
                      Quitar tramo
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onChange(
                        {
                          ...config,
                          regions: config.regions.filter(
                            (r) => r.id !== region.id,
                          ),
                        },
                        {
                          ...answerKey,
                          acceptedRegionIds: answerKey.acceptedRegionIds.filter(
                            (id) => id !== region.id,
                          ),
                        },
                      );
                      setSelection({ id: "", shape: 0 });
                    }}
                  >
                    Eliminar zona
                  </Button>
                </>
              )}
            </div>
          )}
          {error && !drawing && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

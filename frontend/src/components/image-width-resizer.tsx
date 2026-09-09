"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/utils";

type ResizeState = {
  pointerId: number;
  side: "left" | "right";
  startX: number;
  startWidthPx: number;
  containerWidth: number;
};

/**
 * Imagen con dos tiradores para achicarla o agrandarla. La usan los bloques de
 * contenido y las opciones de respuesta, para que redimensionar se sienta igual
 * en los dos lugares.
 */
export function ImageWidthResizer({
  src,
  alt,
  widthPercent,
  minPercent = 20,
  className,
  onChange,
}: {
  src: string;
  alt: string;
  widthPercent: number;
  minPercent?: number;
  className?: string;
  onChange: (widthPercent: number) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const [resizing, setResizing] = useState(false);

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    side: "left" | "right",
  ) => {
    const area = areaRef.current;

    if (!event.isPrimary || event.button !== 0 || !area) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const containerWidth = area.getBoundingClientRect().width;
    resizeRef.current = {
      pointerId: event.pointerId,
      side,
      startX: event.clientX,
      startWidthPx: (containerWidth * widthPercent) / 100,
      containerWidth,
    };
    setResizing(true);
  };

  const handleResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = resizeRef.current;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - state.startX;
    const nextWidthPx =
      state.startWidthPx + (state.side === "right" ? deltaX * 2 : -deltaX * 2);
    onChange(
      Math.round(
        Math.max(
          minPercent,
          Math.min(100, (nextWidthPx / state.containerWidth) * 100),
        ),
      ),
    );
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) {
      return;
    }

    resizeRef.current = null;
    setResizing(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handle = (side: "left" | "right") => (
    <button
      aria-label={`Reducir o ampliar imagen desde la ${
        side === "left" ? "izquierda" : "derecha"
      }`}
      className={cn(
        "absolute top-1/2 h-12 w-6 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm sm:w-4",
        side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
        resizing
          ? "flex"
          : "hidden group-hover/image:flex [@media(hover:none)]:flex",
      )}
      type="button"
      onPointerCancel={finishResize}
      onPointerDown={(event) => startResize(event, side)}
      onPointerMove={handleResize}
      onPointerUp={finishResize}
    >
      <span className="block h-6 w-0.5 rounded-full bg-current" />
      <span className="ml-0.5 block h-6 w-0.5 rounded-full bg-current" />
    </button>
  );

  return (
    <div
      className={cn("group/image flex justify-center", className)}
      ref={areaRef}
    >
      <div
        className="relative"
        style={{ width: `${widthPercent}%`, maxWidth: "100%" }}
      >
        <img
          alt={alt}
          className="block h-auto w-full"
          draggable={false}
          src={src}
        />
        {handle("left")}
        {handle("right")}
      </div>
    </div>
  );
}

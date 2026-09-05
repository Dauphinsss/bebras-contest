"use client";

import type { ReactNode } from "react";

import { FieldHint } from "@/components/field-hint";

/**
 * Encabezado de sección con una línea divisoria, en vez de una tarjeta con
 * borde y sombra: en formularios largos el marco de cada tarjeta suma ruido y
 * hace que editar se sienta más pesado de lo que es.
 */
export function FormSection({
  title,
  description,
  hint,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h2 className="font-heading text-base font-semibold">{title}</h2>
            {hint && <FieldHint>{hint}</FieldHint>}
          </div>
          {description && (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

import { countryFlag } from "@/lib/countries";
import { cn } from "@/lib/utils";

type TaskOriginProps = {
  country?: string | null;
  year?: number | null;
  sourceTaskCode?: string | null;
  className?: string;
};

/**
 * De dónde viene la tarea: país, año y código oficial del cuadernillo.
 *
 * Antes esto vivía dentro del título ("01. Caja de Pulseras (Brasil / 2024)"),
 * donde no se podía filtrar ni corregir por separado.
 */
export function TaskOrigin({
  country,
  year,
  sourceTaskCode,
  className,
}: TaskOriginProps) {
  const details = [country, year, sourceTaskCode].filter(
    (detail) => detail !== null && detail !== undefined && detail !== "",
  );

  if (details.length === 0) {
    return null;
  }

  const flag = countryFlag(country);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      {flag && (
        // El borde del tema es negro puro y sobre una bandera de 14 px pesa
        // demasiado; basta una línea tenue para que las banderas con blanco
        // (Polonia, Indonesia) no se confundan con el fondo.
        <img
          alt=""
          className="h-3.5 w-auto rounded-[2px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
          src={flag}
        />
      )}
      {details.join(" · ")}
    </span>
  );
}

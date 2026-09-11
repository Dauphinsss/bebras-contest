export type SiteNavRole =
  | "public"
  | "admin"
  | "staff"
  | "maestro"
  | "approved-maestro";

export const SITE_NAV_ITEMS = [
  { href: "/practica", label: "Práctica", role: "public" },
  { href: "/tareas", label: "Tareas", role: "admin" },
  { href: "/desafios", label: "Desafíos", role: "admin" },
  { href: "/perfil", label: "Mi cuenta", role: "maestro" },
  { href: "/grupos", label: "Grupos", role: "staff" },
  { href: "/mis-practicas", label: "Mis prácticas", role: "approved-maestro" },
  { href: "/maestros", label: "Maestros", role: "admin" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  role: SiteNavRole;
}>;

export function canAccessSiteNav(
  itemRole: SiteNavRole,
  userRole?: string,
  userStatus?: string,
) {
  if (itemRole === "public") {
    return true;
  }
  if (itemRole === "maestro") return userRole === "maestro";

  if (itemRole === "approved-maestro")
    return userRole === "maestro" && userStatus === "approved";

  if (userStatus !== "approved") {
    return false;
  }

  if (userRole === "admin") {
    return true;
  }

  return userRole === "maestro" && itemRole === "staff";
}

/**
 * Devuelve a dónde volver tras editar algo desde otra pantalla. Solo acepta
 * rutas internas: un valor externo aquí sería un redirect abierto.
 */
export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}
